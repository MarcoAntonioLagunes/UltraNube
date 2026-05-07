// src/services/pdfTranslationService.js
//
// Translates a PDF while preserving its visual layout:
//   1. pdfjs-dist  — extract text items (may be per-glyph) with positions
//   2. buildTextBlocks — merge adjacent items on the same baseline into logical blocks
//   3. batchTranslateTexts — translate each block via Claude (chunked)
//   4. pdf-lib     — cover originals with white rects, draw translated blocks
//                    using a Unicode WOFF font so every script renders correctly
//
// Why grouping is necessary:
//   pdfjs returns one item per PDF text operator, which is often a single character.
//   Drawing each character independently in NotoSans (different advance widths than
//   the original font) produces "P E S _ N A N _ A"-style spacing. By merging
//   adjacent items into a single drawText() call we let the font handle kerning.
//
// Limitations:
//   • Background assumed white — colored backgrounds show white cover rectangles.
//   • Arabic renders LTR without shaping (pdf-lib has no bidi/HarfBuzz engine).
//   • Scanned PDFs (image-only) have no selectable text and will fail clearly.

import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import fontkit from '@pdf-lib/fontkit';
import { batchTranslateTexts } from './anthropicService';

// Language name → WOFF font served from /public/fonts/
const FONT_PATH = {
  'Japonés': '/fonts/NotoSansJP-Regular.woff',
  'Chino':   '/fonts/NotoSansSC-Regular.woff',
  'Coreano': '/fonts/NotoSansKR-Regular.woff',
  'Árabe':   '/fonts/NotoSansArabic-Regular.woff',
};
const DEFAULT_FONT = '/fonts/NotoSans-Regular.woff'; // Latin + Cyrillic + Greek

const CJK_LANGS = new Set(['Japonés', 'Chino', 'Coreano']);

const _fontCache = new Map();
async function fetchFontBytes(path) {
  if (_fontCache.has(path)) return _fontCache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar la fuente Unicode: ${path} (${res.status})`);
  const buf = await res.arrayBuffer();
  _fontCache.set(path, buf);
  return buf;
}

// ── Merge per-glyph items into drawable text blocks ───────────────────────────
// Items on the same baseline with a small horizontal gap are merged into one block.
// This ensures a single drawText() call per logical word/phrase, so the embedded
// font applies its own kerning instead of relying on per-glyph PDF coordinates.
function buildTextBlocks(items) {
  if (!items.length) return [];

  // Sort: page asc → y desc (higher y = top of page in PDF space) → x asc
  const sorted = [...items].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    if (Math.abs(a.y - b.y) > 2)    return b.y - a.y;
    return a.x - b.x;
  });

  const blocks = [];
  let cur = null;

  for (const item of sorted) {
    // Some PDFs report width=0 for individual glyphs — estimate from font size
    const itemW = item.width > 0
      ? item.width
      : item.fontSize * item.str.length * 0.55;

    if (!cur) {
      cur = { pageIndex: item.pageIndex, str: item.str, x: item.x, y: item.y, endX: item.x + itemW, fontSize: item.fontSize };
      continue;
    }

    const samePage = cur.pageIndex === item.pageIndex;
    const sameLine = Math.abs(cur.y - item.y) < Math.max(cur.fontSize, item.fontSize) * 0.5;
    const gap      = item.x - cur.endX;
    // Merge if gap is a normal inter-character or inter-word distance (< 2 em),
    // allowing slight overlap (> -1 em) for PDFs that kern aggressively.
    const adjacent = gap < cur.fontSize * 2 && gap > -cur.fontSize;

    if (samePage && sameLine && adjacent) {
      // Insert a space character when the visual gap is large enough to be a word space
      if (gap > cur.fontSize * 0.15) cur.str += ' ';
      cur.str  += item.str;
      cur.endX  = Math.max(cur.endX, item.x + itemW);
      cur.fontSize = Math.max(cur.fontSize, item.fontSize);
    } else {
      blocks.push({ ...cur, width: cur.endX - cur.x });
      cur = { pageIndex: item.pageIndex, str: item.str, x: item.x, y: item.y, endX: item.x + itemW, fontSize: item.fontSize };
    }
  }
  if (cur) blocks.push({ ...cur, width: cur.endX - cur.x });
  return blocks;
}

// ── PDF layout translation ────────────────────────────────────────────────────

export async function translatePdfWithLayout(blob, targetLang, onProgress) {
  // ── 1. Extract raw text items ─────────────────────────────────────────────
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

  const rawItems = [];
  for (let p = 1; p <= viewerDoc.numPages; p++) {
    const page    = await viewerDoc.getPage(p);
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const [a, b, , d, x, y] = item.transform;
      const fontSize = item.height > 0
        ? item.height
        : Math.max(Math.abs(d), Math.sqrt(a * a + b * b), 8);
      rawItems.push({ pageIndex: p - 1, str: item.str, x, y, width: item.width, fontSize: Math.max(4, fontSize) });
    }
  }

  if (rawItems.length === 0) {
    throw new Error(
      'No se encontró texto seleccionable en este PDF. ' +
      'Los PDFs escaneados (basados en imágenes) no son compatibles con la traducción de diseño.'
    );
  }

  // ── 2. Merge per-glyph items into logical blocks ──────────────────────────
  const textBlocks = buildTextBlocks(rawItems);

  // ── 3. Batch translate ─────────────────────────────────────────────────────
  onProgress?.(`Traduciendo ${textBlocks.length} bloques al ${targetLang}…`);

  const originals        = textBlocks.map((b) => b.str);
  const translatedStrings = await batchTranslateTexts({ texts: originals, targetLang });

  // ── 4. Load Unicode font ───────────────────────────────────────────────────
  onProgress?.('Cargando fuente Unicode…');

  const fontBytes = await fetchFontBytes(FONT_PATH[targetLang] ?? DEFAULT_FONT);

  // ── 5. Rebuild PDF ─────────────────────────────────────────────────────────
  onProgress?.('Reconstruyendo el PDF con el texto traducido…');

  const { PDFDocument, rgb } = await import('pdf-lib');

  let pdfLibDoc;
  try {
    pdfLibDoc = await PDFDocument.load(bufferForPdfLib, { ignoreEncryption: true });
  } catch (err) {
    throw new Error(`No se puede modificar el PDF: ${err.message}`);
  }

  pdfLibDoc.registerFontkit(fontkit);
  const font  = await pdfLibDoc.embedFont(fontBytes, { subset: true });
  const pages = pdfLibDoc.getPages();

  for (let i = 0; i < textBlocks.length; i++) {
    const block = textBlocks[i];
    const page  = pages[block.pageIndex];
    if (!page) continue;

    const tStr = String(translatedStrings[i] ?? block.str).trim();
    if (!tStr) continue;

    // Scale font size down only if the translated text overflows the block width
    let finalSize = block.fontSize;
    if (block.width > 0) {
      const tw = font.widthOfTextAtSize(tStr, finalSize);
      if (tw > block.width * 1.05) {
        finalSize = Math.max(4, finalSize * (block.width / tw));
      }
    }

    const coverWidth = block.width > 0
      ? block.width
      : font.widthOfTextAtSize(block.str, block.fontSize);

    // Cover original text with a white rectangle
    page.drawRectangle({
      x: block.x - 1,
      y: block.y - 1,
      width:  coverWidth + 4,
      height: block.fontSize + 3,
      color: rgb(1, 1, 1),
      opacity: 1,
    });

    // Draw the entire translated block as one string — font handles kerning
    page.drawText(tStr, {
      x:    block.x,
      y:    block.y,
      size: finalSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const bytes = await pdfLibDoc.save();
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    translatedText: translatedStrings.filter(Boolean).join(' '),
  };
}

// ── Plain-text → PDF with Unicode font ───────────────────────────────────────
// Used by TranslatorAgent when the source is TXT/MD (no existing PDF structure).

export async function buildTextPdf(text, targetLang) {
  const fontBytes = await fetchFontBytes(FONT_PATH[targetLang] ?? DEFAULT_FONT);

  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc  = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });

  const PAGE_W  = 595.28;
  const PAGE_H  = 841.89;
  const MARGIN  = 50;
  const FONT_SZ = 11;
  const LINE_H  = FONT_SZ * 1.6;
  const MAX_W   = PAGE_W - MARGIN * 2;
  const isCJK   = CJK_LANGS.has(targetLang);

  const allLines = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { allLines.push(''); continue; }
    if (isCJK) {
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
    if (y < MARGIN + LINE_H) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    if (line) page.drawText(line, { x: MARGIN, y, size: FONT_SZ, font, color: rgb(0, 0, 0) });
    y -= LINE_H;
  }

  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
