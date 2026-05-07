// src/services/pdfTranslationService.js
//
// Strategy: extract → group → translate → generate brand-new PDF
//
//   1. pdfjs-dist  — extract text items (x, y, fontSize) from every page
//   2. buildTextBlocks — merge per-glyph items into logical word/phrase blocks
//   3. batchTranslateTexts — translate each block via Claude
//   4. pdf-lib     — create a FRESH PDF document (same page dimensions as original)
//                    and draw every translated block with NotoSans at the
//                    original coordinates.
//
// WHY a fresh PDF instead of modifying the original:
//   PDF fonts use custom encoding vectors (CID, Type3, proprietary glyph maps).
//   Painting white rectangles over existing glyphs and re-drawing with a new font
//   causes the underlying encoded bytes to still render as garbled characters.
//   Starting from a blank document avoids all encoding conflicts entirely.
//
// Trade-off: images, backgrounds, and decorative vector graphics from the
//   original PDF are not preserved.  Text layout and positions ARE preserved.
//
// Limitations:
//   • Arabic renders LTR without glyph shaping — pdf-lib has no bidi engine.
//   • Scanned PDFs (image-only) have no selectable text and will fail clearly.

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

// Session-level font cache
const _fontCache = new Map();
async function fetchFontBytes(path) {
  if (_fontCache.has(path)) return _fontCache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar la fuente: ${path} (${res.status})`);
  const buf = await res.arrayBuffer();
  _fontCache.set(path, buf);
  return buf;
}

// ── Merge per-glyph items → logical text blocks ───────────────────────────────
// pdfjs returns one item per PDF text operator, often a single character.
// We merge adjacent items on the same baseline so each block maps to one
// drawText() call, letting the font handle kerning correctly.
function buildTextBlocks(items) {
  if (!items.length) return [];

  // Sort: page asc → y desc (top of page first in PDF space) → x asc
  const sorted = [...items].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    if (Math.abs(a.y - b.y) > 2)    return b.y - a.y;
    return a.x - b.x;
  });

  const blocks = [];
  let cur = null;

  for (const item of sorted) {
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
    const adjacent = gap < cur.fontSize * 2 && gap > -cur.fontSize;

    if (samePage && sameLine && adjacent) {
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

// ── Main translation function ─────────────────────────────────────────────────

export async function translatePdfWithLayout(blob, targetLang, onProgress) {
  // ── 1. Extract raw text items + page dimensions ───────────────────────────
  onProgress?.('Extrayendo texto del PDF…');

  const pdfjs = await import('pdfjs-dist');
  const pdfjsLib = pdfjs.default ?? pdfjs;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const rawBuffer = await blob.arrayBuffer();
  let viewerDoc;
  try {
    viewerDoc = await pdfjsLib.getDocument({ data: new Uint8Array(rawBuffer) }).promise;
  } catch (err) {
    throw new Error(`No se puede leer el PDF: ${err.message}`);
  }

  const rawItems      = [];
  const pageDimensions = [];

  for (let p = 1; p <= viewerDoc.numPages; p++) {
    const page    = await viewerDoc.getPage(p);
    // page.view = [x0, y0, x1, y1] in PDF user-space (points)
    const [vx0, vy0, vx1, vy1] = page.view;
    pageDimensions.push({ width: vx1 - vx0, height: vy1 - vy0 });

    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const [a, b, , d, x, y] = item.transform;
      const fontSize = item.height > 0
        ? item.height
        : Math.max(Math.abs(d), Math.sqrt(a * a + b * b), 8);
      rawItems.push({
        pageIndex: p - 1,
        str: item.str,
        x, y,
        width: item.width,
        fontSize: Math.max(4, fontSize),
      });
    }
  }

  if (rawItems.length === 0) {
    throw new Error(
      'No se encontró texto seleccionable en este PDF. ' +
      'Los PDFs escaneados (basados en imágenes) no son compatibles con la traducción.'
    );
  }

  // ── 2. Group per-glyph items into logical blocks ──────────────────────────
  const textBlocks = buildTextBlocks(rawItems);

  // ── 3. Translate ──────────────────────────────────────────────────────────
  onProgress?.(`Traduciendo ${textBlocks.length} bloques al ${targetLang}…`);
  const originals        = textBlocks.map((b) => b.str);
  const translatedStrings = await batchTranslateTexts({ texts: originals, targetLang });

  // ── 4. Load Unicode font ──────────────────────────────────────────────────
  onProgress?.('Cargando fuente Unicode…');
  const fontBytes = await fetchFontBytes(FONT_PATH[targetLang] ?? DEFAULT_FONT);

  // ── 5. Build fresh PDF ────────────────────────────────────────────────────
  onProgress?.('Generando PDF traducido…');

  const { PDFDocument, rgb } = await import('pdf-lib');
  const newDoc = await PDFDocument.create();
  newDoc.registerFontkit(fontkit);
  const font = await newDoc.embedFont(fontBytes, { subset: true });

  // Create one blank white page per original page, same dimensions
  const pdfPages = pageDimensions.map(({ width, height }) => {
    const page = newDoc.addPage([width, height]);
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
    return page;
  });

  // Draw each translated block at the original coordinates
  for (let i = 0; i < textBlocks.length; i++) {
    const block = textBlocks[i];
    const page  = pdfPages[block.pageIndex];
    if (!page) continue;

    const tStr = String(translatedStrings[i] ?? block.str).trim();
    if (!tStr) continue;

    // Shrink font size proportionally if translated text overflows original width
    let finalSize = block.fontSize;
    if (block.width > 0) {
      const tw = font.widthOfTextAtSize(tStr, finalSize);
      if (tw > block.width * 1.05) {
        finalSize = Math.max(4, finalSize * (block.width / tw));
      }
    }

    try {
      page.drawText(tStr, {
        x:    block.x,
        y:    block.y,
        size: finalSize,
        font,
        color: rgb(0, 0, 0),
      });
    } catch {
      // Skip blocks with out-of-bounds coordinates or unsupported characters
    }
  }

  const bytes = await newDoc.save();
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    translatedText: translatedStrings.filter(Boolean).join(' '),
  };
}

// ── Plain-text → PDF with Unicode font ───────────────────────────────────────

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
