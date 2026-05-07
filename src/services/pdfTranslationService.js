// src/services/pdfTranslationService.js
//
// Pipeline:
//   1. api.extractPdfText(blob)  — backend extracts plain text (pdftotext / Claude API)
//   2. batchTranslateTexts       — Claude translates each page
//   3. buildTextPdf              — brand-new A4 PDF, NotoSans, plain readable text
//
// Note: { subset: true } is intentionally NOT used in embedFont.
// Font subsetting in @pdf-lib/fontkit remaps glyph IDs incorrectly for WOFF fonts,
// producing garbled output (vowels stripped, wrong characters). Full font embedding
// produces larger files but renders every character correctly.

import fontkit from '@pdf-lib/fontkit';
import { batchTranslateTexts } from './anthropicService';
import api from './api';

const FONT_PATH = {
  'Inglés':    '/fonts/NotoSans-Regular.woff',
  'Español':   '/fonts/NotoSans-Regular.woff',
  'Portugués': '/fonts/NotoSans-Regular.woff',
  'Francés':   '/fonts/NotoSans-Regular.woff',
  'Alemán':    '/fonts/NotoSans-Regular.woff',
  'Italiano':  '/fonts/NotoSans-Regular.woff',
  'Holandés':  '/fonts/NotoSans-Regular.woff',
};
const DEFAULT_FONT = '/fonts/NotoSans-Regular.woff';

const _fontCache = new Map();
async function fetchFontBytes(path) {
  if (_fontCache.has(path)) return _fontCache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar la fuente: ${path} (${res.status})`);
  const buf = await res.arrayBuffer();
  _fontCache.set(path, buf);
  return buf;
}

export async function translatePdfWithLayout(blob, targetLang, onProgress) {
  // 1. Extract text via backend
  onProgress?.('Extrayendo texto del PDF…');
  let pages;
  try {
    const result = await api.extractPdfText(blob);
    pages = result.pages;
  } catch (err) {
    throw new Error(`No se pudo extraer el texto del PDF: ${err.message}`);
  }

  if (!pages || pages.length === 0) {
    throw new Error(
      'No se encontró texto seleccionable en este PDF. ' +
      'Los PDFs escaneados (solo imágenes) no son compatibles con la traducción.'
    );
  }

  // 2. Translate
  onProgress?.(`Traduciendo ${pages.length} página(s) al ${targetLang}…`);
  const translatedPages = await batchTranslateTexts({ texts: pages, targetLang });
  const translatedText  = translatedPages.filter(Boolean).join('\n\n');

  // 3. Build clean PDF
  onProgress?.('Generando PDF limpio…');
  const pdfBlob = await buildTextPdf(translatedText, targetLang);

  return { blob: pdfBlob, translatedText };
}

export async function buildTextPdf(text, targetLang) {
  const fontPath  = FONT_PATH[targetLang] ?? DEFAULT_FONT;
  const fontBytes = await fetchFontBytes(fontPath);

  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // No { subset: true } — full font embedding avoids glyph-ID remapping bugs in fontkit
  const font = await doc.embedFont(fontBytes);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 55;
  const FONT_SZ = 11;
  const LINE_H  = FONT_SZ * 1.6;
  const MAX_W   = PAGE_W - MARGIN * 2;

  // Word-wrap each paragraph into display lines
  const allLines = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { allLines.push(''); continue; }
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
