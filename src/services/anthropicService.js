// src/services/anthropicService.js
import {
  TRANSLATOR_PROMPT,
  LAWYER_PROMPT,
  COPILOT_SEARCH_PROMPT,
  COPILOT_SUMMARY_PROMPT,
  BATCH_TRANSLATE_PROMPT,
} from '../constants/agentPrompts';
import api from './api';

// Vite bundles this as an asset and gives us the correct URL at runtime
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const MAX_CHARS = 50_000;

async function callClaude(systemPrompt, userContent, maxTokens = 4096) {
  return api.anthropicProxy(systemPrompt, [{ role: 'user', content: userContent }], maxTokens);
}

async function extractPdfText(blob) {
  const pdfjs = await import('pdfjs-dist');
  const pdfjsLib = pdfjs.default ?? pdfjs;

  // Use the Vite-bundled worker URL (avoids CDN dependency)
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

  const buffer = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(' '));
  }

  return pages.join('\n');
}

async function extractDocxText(blob) {
  const mod = await import('mammoth');
  // mammoth is CJS — Vite wraps it as { default: module }
  const mammoth = mod.default ?? mod;
  const buffer = await blob.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

export async function extractTextFromBlob(blob, fileName) {
  const ext = String(fileName).split('.').pop().toLowerCase();

  if (ext === 'txt' || ext === 'md') return blob.text();
  if (ext === 'pdf') return extractPdfText(blob);
  if (ext === 'docx') return extractDocxText(blob);

  throw new Error(`Formato .${ext} no compatible con los agentes de IA`);
}

export async function translateText({ text, targetLang, fileName }) {
  const truncated = text.slice(0, MAX_CHARS);
  const userContent = `Nombre del archivo: ${fileName}\nIdioma de destino: ${targetLang}\n\nContenido a traducir:\n\n${truncated}`;
  return callClaude(TRANSLATOR_PROMPT, userContent, 8192);
}

export async function analyzeLegalDocument({ text, fileName }) {
  const truncated = text.slice(0, MAX_CHARS);
  const userContent = `Nombre del archivo: ${fileName}\n\nContenido del documento:\n\n${truncated}`;
  const raw = await callClaude(LAWYER_PROMPT, userContent, 4096);

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA devolvió un formato inesperado');
  return JSON.parse(match[0]);
}

export async function searchFilesWithAI({ query, fileIndex }) {
  const indexStr = JSON.stringify(fileIndex.slice(0, 300));
  const userContent = `Índice de archivos:\n${indexStr}\n\nPregunta: ${query}`;
  const raw = await callClaude(COPILOT_SEARCH_PROMPT, userContent, 2048);

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA devolvió un formato inesperado');
  return JSON.parse(match[0]);
}

export async function summarizeFolderWithAI({ items, folderName }) {
  const index = items.map(({ name, type }) => ({ name, type }));
  const userContent = `Carpeta: "${folderName}"\n\nArchivos:\n${JSON.stringify(index)}`;
  const raw = await callClaude(COPILOT_SUMMARY_PROMPT, userContent, 2048);

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA devolvió un formato inesperado');
  return JSON.parse(match[0]);
}

// Translates an array of short strings in batches; returns a parallel array of translations.
// Falls back to original text for any chunk that fails or returns mismatched length.
const BATCH_SIZE = 150;

export async function batchTranslateTexts({ texts, targetLang }) {
  const results = new Array(texts.length);

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const chunk = texts.slice(start, start + BATCH_SIZE);
    const userContent = `Idioma de destino: ${targetLang}\n\n${JSON.stringify(chunk)}`;

    let raw;
    try {
      raw = await callClaude(BATCH_TRANSLATE_PROMPT, userContent, 4096);
    } catch {
      for (let j = 0; j < chunk.length; j++) results[start + j] = chunk[j];
      continue;
    }

    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const translated = JSON.parse(match[0]);
        if (Array.isArray(translated) && translated.length === chunk.length) {
          for (let j = 0; j < chunk.length; j++) {
            results[start + j] = typeof translated[j] === 'string' ? translated[j] : chunk[j];
          }
          continue;
        }
      } catch { /* fall through to fallback */ }
    }

    // Fallback: keep originals for this chunk
    for (let j = 0; j < chunk.length; j++) results[start + j] = chunk[j];
  }

  return results;
}
