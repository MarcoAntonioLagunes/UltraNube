// src/services/pdfTranslationService.js
//
// Pipeline:
//   1. api.extractPdfText(blob)  — backend extracts plain text (pdftotext / Claude API)
//   2. translatePages            — TRANSLATOR_PROMPT with 8192 tokens, chunked for long docs
//   3. buildTextPdf              — brand-new A4 PDF, NotoSans, plain readable text

import fontkit from '@pdf-lib/fontkit';
import { translateText } from './anthropicService';
import api from './api';

const FONT_PATH  = '/fonts/NotoSans-Regular.woff';
const CHUNK_CHARS = 40_000; // stay under the 50K MAX_CHARS limit in translateText

const _fontCache = new Map();
async function fetchFontBytes(path) {
  if (_fontCache.has(path)) return _fontCache.get(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar la fuente: ${path} (${res.status})`);
  const buf = await res.arrayBuffer();
  _fontCache.set(path, buf);
  return buf;
}

// Split pages into chunks ≤ CHUNK_CHARS, translate each chunk, rejoin.
async function translatePages(pages, targetLang) {
  console.log(`[PDF translator] translatePages: ${pages.length} página(s), idioma: ${targetLang}`);
  console.log(`[PDF translator] página 1 (primeros 200 chars): ${pages[0]?.slice(0, 200)}`);

  // Group consecutive pages into chunks that fit within the token budget
  const chunks = [];
  let current  = '';
  for (const page of pages) {
    const candidate = current ? `${current}\n\n${page}` : page;
    if (candidate.length > CHUNK_CHARS && current) {
      chunks.push(current);
      current = page;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  console.log(`[PDF translator] dividido en ${chunks.length} chunk(s)`);

  const translatedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[PDF translator] traduciendo chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)…`);
    const result = await translateText({
      text:       chunks[i],
      targetLang,
      fileName:   'documento.pdf',
    });
    console.log(`[PDF translator] chunk ${i + 1} resultado (primeros 200 chars): ${result?.slice(0, 200)}`);
    translatedChunks.push(result);
  }

  return translatedChunks.join('\n\n');
}

export async function translatePdfWithLayout(blob, targetLang, onProgress) {
  // 1. Extract text via backend
  onProgress?.('Extrayendo texto del PDF…');
  let pages;
  try {
    const result = await api.extractPdfText(blob);
    pages = result.pages;
    console.log(`[PDF translator] extracción OK: ${pages?.length} página(s)`);
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
  const translatedText = await translatePages(pages, targetLang);
  console.log(`[PDF translator] traducción completa: ${translatedText?.length} chars`);

  // 3. Build clean PDF
  onProgress?.('Generando PDF limpio…');
  const pdfBlob = await buildTextPdf(translatedText, targetLang);

  return { blob: pdfBlob, translatedText };
}

export async function buildTextPdf(text, _targetLang) {
  const fontBytes = await fetchFontBytes(FONT_PATH);

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
