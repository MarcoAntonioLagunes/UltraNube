// src/services/pdfTranslationService.js
//
// Translates a PDF while preserving its visual layout:
//   1. pdfjs-dist  — extract text items with their exact (x, y, fontSize) in PDF user space
//   2. batchTranslateTexts — translate every fragment via Claude (chunked)
//   3. pdf-lib     — load the original PDF, paint white rectangles over old text,
//                    draw translated text at the same coordinates with a Unicode font
//
// Font strategy: Noto Sans WOFF files in public/fonts/ — one per script family.
// pdf-lib's fontkit understands WOFF (zlib-compressed) and subsets glyphs used,
// so the output PDF only contains the characters that appear in the translation.
//
// Limitations:
//   • Background is assumed white; colored/dark backgrounds will show white boxes.
//   • Arabic text renders LTR without glyph shaping — pdf-lib has no bidi/shaping engine.
//   • Scanned PDFs (image-only) have no selectable text — extraction will fail with a
//     clear error message.

import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { batchTranslateTexts } from './anthropicService';

// Language name (from TranslatorAgent's LANGUAGES array) → WOFF font in /public/fonts/
const FONT_PATH = {
  'Japonés': '/fonts/NotoSansJP-Regular.woff',
  'Chino':   '/fonts/NotoSansSC-Regular.woff',
  'Coreano': '/fonts/NotoSansKR-Regular.woff',
  'Árabe':   '/fonts/NotoSansArabic-Regular.woff',
};
// Covers Latin (all European languages) + Cyrillic (Russian) + Greek
const DEFAULT_FONT = '/fonts/NotoSans-Regular.woff';

// Languages that wrap text character-by-character (no word spaces)
const CJK_LANGS = new Set(['Japonés', 'Chino', 'Coreano']);

// Session-level font cache — avoids re-downloading on subsequent translations
const _fontCache = new Map();

async function fetchFontBytes(path) {
  if (_fontCache.has(path)) return _fontCache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar la fuente Unicode: ${path} (${res.status})`);
  const buf = await res.arrayBuffer();
  _fontCache.set(path, buf);
  return buf;
}

// ── PDF layout translation ────────────────────────────────────────────────────

export async function translatePdfWithLayout(blob, targetLang, onProgress) {
  // ── 1. Extract text items with positions ──────────────────────────────────
  onProgress?.('Extrayendo texto del PDF…');

  const pdfjs = await import('pdfjs-dist');
  const pdfjsLib = pdfjs.default ?? pdfjs;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const rawBuffer = await blob.arrayBuffer();
  // pdfjs transfers its buffer to the Web Worker (detaching it), so pdf-lib
  // needs its own independent copy obtained before that transfer happens.
  const bufferForPdfjs  = rawBuffer.slice(0);
  const bufferForPdfLib = rawBuffer.slice(0);

  let viewerDoc;
  try {
    viewerDoc = await pdfjsLib.getDocument({ data: new Uint8Array(bufferForPdfjs) }).promise;
  } catch (err) {
    throw new Error(`No se puede leer el PDF: ${err.message}`);
  }

  // Each entry: { pageIndex, str, x, y, width, fontSize }
  const textItems = [];

  for (let p = 1; p <= viewerDoc.numPages; p++) {
    const page = await viewerDoc.getPage(p);
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;

      const [a, b, , d, x, y] = item.transform;

      // Font size: item.height is most reliable; fall back to transform components.
      const fontSize = item.height > 0
        ? item.height
        : Math.max(Math.abs(d), Math.sqrt(a * a + b * b), 8);

      textItems.push({
        pageIndex: p - 1,
        str: item.str,
        x,
        y,
        width: item.width,
        fontSize: Math.max(4, fontSize),
      });
    }
  }

  if (textItems.length === 0) {
    throw new Error(
      'No se encontró texto seleccionable en este PDF. ' +
      'Los PDFs escaneados (basados en imágenes) no son compatibles con la traducción de diseño.'
    );
  }

  // ── 2. Batch translate ─────────────────────────────────────────────────────
  onProgress?.(`Traduciendo ${textItems.length} fragmentos al ${targetLang}…`);

  const originals = textItems.map((it) => it.str);
  const translatedStrings = await batchTranslateTexts({ texts: originals, targetLang });

  // ── 3. Load Unicode font ───────────────────────────────────────────────────
  onProgress?.('Cargando fuente Unicode…');

  const fontPath  = FONT_PATH[targetLang] ?? DEFAULT_FONT;
  const fontBytes = await fetchFontBytes(fontPath);

  // ── 4. Rebuild PDF with pdf-lib ────────────────────────────────────────────
  onProgress?.('Reconstruyendo el PDF con el texto traducido…');

  const { PDFDocument, rgb } = await import('pdf-lib');

  let pdfLibDoc;
  try {
    pdfLibDoc = await PDFDocument.load(bufferForPdfLib, { ignoreEncryption: true });
  } catch (err) {
    throw new Error(`No se puede modificar el PDF: ${err.message}`);
  }

  // subset: true — embed only the glyphs used (keeps CJK PDFs reasonable in size)
  const font  = await pdfLibDoc.embedFont(fontBytes, { subset: true });
  const pages = pdfLibDoc.getPages();

  for (let i = 0; i < textItems.length; i++) {
    const item = textItems[i];
    const page = pages[item.pageIndex];
    if (!page) continue;

    const tStr = String(translatedStrings[i] ?? item.str);
    if (!tStr.trim()) continue;

    // Scale font size down if translated text is wider than the original slot
    let finalSize = item.fontSize;
    if (item.width > 0) {
      const tw = font.widthOfTextAtSize(tStr, finalSize);
      if (tw > item.width * 1.05) {
        finalSize = Math.max(4, finalSize * (item.width / tw));
      }
    }

    // Width of the original text to size the cover rectangle correctly
    const origTextWidth = item.width > 0
      ? item.width
      : font.widthOfTextAtSize(item.str, item.fontSize);

    // Paint a white rectangle over the original text
    page.drawRectangle({
      x: item.x - 1,
      y: item.y - 1,
      width: origTextWidth + 4,
      height: item.fontSize + 3,
      color: rgb(1, 1, 1),
      opacity: 1,
    });

    // Draw translated text at the original baseline position
    page.drawText(tStr, {
      x: item.x,
      y: item.y,
      size: finalSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const bytes = await pdfLibDoc.save();

  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    // Plain text version used by the "Download as PDF/Word" buttons
    translatedText: translatedStrings.filter(Boolean).join(' '),
  };
}

// ── Plain-text → PDF with Unicode font ───────────────────────────────────────
// Used by TranslatorAgent when the source is TXT/MD (no existing PDF structure).

export async function buildTextPdf(text, targetLang) {
  const fontPath  = FONT_PATH[targetLang] ?? DEFAULT_FONT;
  const fontBytes = await fetchFontBytes(fontPath);

  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc  = await PDFDocument.create();
  const font = await doc.embedFont(fontBytes, { subset: true });

  const PAGE_W   = 595.28;  // A4 in points
  const PAGE_H   = 841.89;
  const MARGIN   = 50;
  const FONT_SZ  = 11;
  const LINE_H   = FONT_SZ * 1.6;
  const MAX_W    = PAGE_W - MARGIN * 2;
  const isCJK    = CJK_LANGS.has(targetLang);

  // Wrap each paragraph into display lines
  const allLines = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      allLines.push('');
      continue;
    }
    if (isCJK) {
      // CJK has no word separators — wrap character by character
      let line = '';
      for (const ch of para) {
        const test = line + ch;
        if (font.widthOfTextAtSize(test, FONT_SZ) > MAX_W && line) {
          allLines.push(line);
          line = ch;
        } else {
          line = test;
        }
      }
      if (line) allLines.push(line);
    } else {
      // Western/Arabic — wrap word by word
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, FONT_SZ) > MAX_W && line) {
          allLines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) allLines.push(line);
    }
  }

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y    = PAGE_H - MARGIN;

  for (const line of allLines) {
    if (y < MARGIN + LINE_H) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y    = PAGE_H - MARGIN;
    }
    if (line) {
      page.drawText(line, { x: MARGIN, y, size: FONT_SZ, font, color: rgb(0, 0, 0) });
    }
    y -= LINE_H;
  }

  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
