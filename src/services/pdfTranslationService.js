// src/services/pdfTranslationService.js
//
// Translates a PDF while preserving its visual layout:
//   1. pdfjs-dist  — extract text items with their exact (x, y, fontSize) in PDF user space
//   2. batchTranslateTexts — translate every fragment via Claude (chunked)
//   3. pdf-lib     — load the original PDF, paint white rectangles over old text,
//                    draw translated text at the same coordinates with Helvetica
//
// Limitations:
//   • Background is assumed white; colored/dark backgrounds will show white boxes.
//   • Helvetica replaces the original font → only Latin scripts render correctly.
//     Japanese, Chinese, Arabic, Korean, Russian need a Unicode font embedded in pdf-lib
//     (not implemented here).
//   • Scanned PDFs (image-only) have no selectable text — extraction will fail with a
//     clear error message.

import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { batchTranslateTexts } from './anthropicService';

export async function translatePdfWithLayout(blob, targetLang, onProgress) {
  // ── 1. Extract text items with positions ────────────────────────────────────
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

  // ── 2. Batch translate ───────────────────────────────────────────────────────
  onProgress?.(`Traduciendo ${textItems.length} fragmentos al ${targetLang}…`);

  const originals = textItems.map((it) => it.str);
  const translatedStrings = await batchTranslateTexts({ texts: originals, targetLang });

  // ── 3. Rebuild PDF with pdf-lib ──────────────────────────────────────────────
  onProgress?.('Reconstruyendo el PDF con el texto traducido…');

  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

  let pdfLibDoc;
  try {
    pdfLibDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch (err) {
    throw new Error(`No se puede modificar el PDF: ${err.message}`);
  }

  const font = await pdfLibDoc.embedFont(StandardFonts.Helvetica);
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
    // Plain text version used by the "Download as Word" button
    translatedText: translatedStrings.filter(Boolean).join(' '),
  };
}
