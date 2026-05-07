// src/services/pdfTranslationService.js
//
// PDF translation pipeline:
//   1. pdfjs-dist  — extract plain text from each page (respects line breaks via hasEOL)
//   2. batchTranslateTexts — translate each page as a coherent unit via Claude
//   3. buildTextPdf — generate a brand-new, clean, fully-readable PDF with NotoSans
//
// Why we stopped trying to preserve the original layout:
//   PDF fonts use proprietary encoding vectors (CID, Type1, Type3, custom ToUnicode maps).
//   Any attempt to copy glyph positions from the original and redraw with a different font
//   produces garbled output ("u c v" etc.) because glyph IDs don't map to Unicode 1-to-1.
//   The only reliable approach is: extract text → translate → build a new PDF from scratch.

import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import fontkit from '@pdf-lib/fontkit';
import { batchTranslateTexts } from './anthropicService';

// Language name → WOFF font in /public/fonts/
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
  if (!res.ok) throw new Error(`No se pudo cargar la fuente: ${path} (${res.status})`);
  const buf = await res.arrayBuffer();
  _fontCache.set(path, buf);
  return buf;
}

// ── Extract readable text from a pdfjs page ───────────────────────────────────
// Uses item.hasEOL to reconstruct natural line breaks instead of joining
// everything into one long string that loses paragraph structure.
function extractPageText(contentItems) {
  let text = '';
  for (const item of contentItems) {
    if (!item.str) continue;
    text += item.str;
    if (item.hasEOL) text += '\n';
  }
  return text.replace(/[ \t]+/g, ' ').trim();
}

// ── PDF translation ───────────────────────────────────────────────────────────

export async function translatePdfWithLayout(blob, targetLang, onProgress) {
  // ── 1. Extract text page by page ──────────────────────────────────────────
  onProgress?.('Extrayendo texto del PDF…');

  const pdfjs = await import('pdfjs-dist');
  const pdfjsLib = pdfjs.default ?? pdfjs;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const buffer = await blob.arrayBuffer();
  let viewerDoc;
  try {
    viewerDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (err) {
    throw new Error(`No se puede leer el PDF: ${err.message}`);
  }

  const pageTexts = [];
  for (let p = 1; p <= viewerDoc.numPages; p++) {
    const page    = await viewerDoc.getPage(p);
    const content = await page.getTextContent();
    const text    = extractPageText(content.items);
    if (text) pageTexts.push(text);
  }

  if (pageTexts.length === 0) {
    throw new Error(
      'No se encontró texto seleccionable en este PDF. ' +
      'Los PDFs escaneados (solo imágenes) no son compatibles con la traducción.'
    );
  }

  // ── 2. Translate each page as a coherent unit ─────────────────────────────
  onProgress?.(`Traduciendo ${pageTexts.length} página(s) al ${targetLang}…`);

  const translatedPages   = await batchTranslateTexts({ texts: pageTexts, targetLang });
  const translatedText    = translatedPages.filter(Boolean).join('\n\n');

  // ── 3. Generate clean PDF ─────────────────────────────────────────────────
  onProgress?.('Generando PDF limpio…');

  const pdfBlob = await buildTextPdf(translatedText, targetLang);

  return { blob: pdfBlob, translatedText };
}

// ── Plain-text / translated-text → clean PDF ─────────────────────────────────
// Used both by translatePdfWithLayout (PDF sources) and TranslatorAgent
// (TXT/MD sources). Produces a fully readable A4 document with NotoSans.

export async function buildTextPdf(text, targetLang) {
  const fontBytes = await fetchFontBytes(FONT_PATH[targetLang] ?? DEFAULT_FONT);

  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc  = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });

  const PAGE_W  = 595.28;   // A4 width in points
  const PAGE_H  = 841.89;   // A4 height in points
  const MARGIN  = 55;
  const FONT_SZ = 11;
  const LINE_H  = FONT_SZ * 1.65;
  const MAX_W   = PAGE_W - MARGIN * 2;
  const isCJK   = CJK_LANGS.has(targetLang);

  // Wrap each paragraph into display lines
  const allLines = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      allLines.push(''); // blank line between paragraphs
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
      // Word-by-word wrap for Latin, Cyrillic, Arabic
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
      page.drawText(line, { x: MARGIN, y, size: FONT_SZ, font, color: rgb(0.05, 0.05, 0.05) });
    }
    y -= LINE_H;
  }

  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
