// src/components/agents/TranslatorAgent.jsx
import { useState } from 'react';
import styles from './TranslatorAgent.module.css';
import { extractTextFromBlob, translateText } from '../../services/anthropicService';
import api from '../../services/api';

const LANGUAGES = [
  'Inglés', 'Español', 'Portugués', 'Francés', 'Alemán', 'Italiano',
  'Japonés', 'Chino (Simplificado)', 'Ruso', 'Árabe', 'Coreano',
];

function buildOutputName(originalName) {
  const parts = originalName.split('.');
  const ext = parts.length > 1 ? parts.pop() : '';
  const base = parts.join('.');
  let outputExt;
  if (ext === 'pdf') outputExt = 'pdf';
  else if (['txt', 'md'].includes(ext)) outputExt = ext;
  else outputExt = 'txt';
  return `${base}_traducido.${outputExt}`;
}

async function buildPdfBlob(text) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 20;
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const lineHeight = 6;
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text, maxWidth);
  let y = margin;

  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }

  return doc.output('blob');
}

function swapExt(name, newExt) {
  return name.replace(/\.[^.]+$/, '') + '.' + newExt;
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function TranslatorAgent({ file, folderId, onClose, onSuccess }) {
  const [targetLanguage, setTargetLanguage] = useState('Inglés');
  const [step, setStep] = useState('select'); // select | loading | done | error
  const [error, setError] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [loadingMessage, setLoadingMessage] = useState('');
  const [translatedPdfBlob, setTranslatedPdfBlob] = useState(null);

  const sourceExt = file.name.split('.').pop().toLowerCase();

  const handleTranslate = async () => {
    setStep('loading');
    setError('');
    setLoadingMessage('Iniciando…');

    try {
      const blob = await api.getFileBlob(file.id);
      const outputName = buildOutputName(file.name);

      let uploadBlob, mimeType, textForState, pdfBlobForState = null;

      if (sourceExt === 'pdf') {
        const { translatePdfWithLayout } = await import('../../services/pdfTranslationService');
        const result = await translatePdfWithLayout(blob, targetLanguage, setLoadingMessage);
        uploadBlob = result.blob;
        mimeType = 'application/pdf';
        textForState = result.translatedText;
        pdfBlobForState = result.blob;
      } else {
        setLoadingMessage('Extrayendo texto del archivo…');
        const text = await extractTextFromBlob(blob, file.name);
        if (!text.trim()) throw new Error('El archivo está vacío o no se pudo extraer su texto');
        setLoadingMessage(`Traduciendo al ${targetLanguage}…`);
        textForState = await translateText({ text, targetLang: targetLanguage, fileName: file.name });
        uploadBlob = new Blob([textForState], { type: 'text/plain' });
        mimeType = 'text/plain';
      }

      setLoadingMessage('Guardando en la nube…');
      const fileObj = new File([uploadBlob], outputName, { type: mimeType });
      await api.uploadFileAsync(fileObj, folderId);

      setTranslatedText(textForState);
      setTranslatedPdfBlob(pdfBlobForState);
      setNewFileName(outputName);
      setStep('done');
      onSuccess?.();
    } catch (e) {
      setError(e.message || 'Error desconocido durante la traducción');
      setStep('error');
    }
  };

  const handleDownloadPdf = async () => {
    // For PDFs: reuse the layout-preserving blob we already built
    if (translatedPdfBlob) {
      triggerBlobDownload(translatedPdfBlob, swapExt(newFileName, 'pdf'));
      return;
    }
    // For txt/md: generate a clean PDF from the translated text
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 15;
    const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const lineHeight = 7;
    const pageHeight = doc.internal.pageSize.getHeight();
    const lines = doc.splitTextToSize(translatedText, maxWidth);
    let y = margin;
    lines.forEach((line) => {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });
    doc.save(swapExt(newFileName, 'pdf'));
  };

  const handleDownloadDocx = async () => {
    const { Document, Paragraph, TextRun, Packer } = await import('docx');
    const paragraphs = translatedText.split('\n').map(
      (line) => new Paragraph({ children: [new TextRun(line)] })
    );
    const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    triggerBlobDownload(blob, swapExt(newFileName, 'docx'));
  };

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>🌐</span>
          <div className={styles.headerText}>
            <h2>Traducir con IA</h2>
            <p className={styles.fileName}>{file.name}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {step === 'select' && (
          <>
            <div className={styles.body}>
              <label className={styles.label}>Idioma de destino</label>
              <select
                className={styles.select}
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <p className={styles.hint}>
                Se guardará como <strong>{buildOutputName(file.name)}</strong> en esta misma carpeta.
                {sourceExt === 'pdf' &&
                  ' Se preservará la estructura visual del PDF (posiciones, imágenes). Mejor resultado en documentos con fondo blanco y texto en idiomas latinos.'
                }
              </p>
            </div>
            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
              <button className={styles.primaryBtn} onClick={handleTranslate}>
                Traducir →
              </button>
            </div>
          </>
        )}

        {step === 'loading' && (
          <div className={styles.body}>
            <div className={styles.spinnerWrap}>
              <div className={styles.spinner} />
            </div>
            <p className={styles.loadingText}>{loadingMessage || `Traduciendo al ${targetLanguage}…`}</p>
            <p className={styles.hint}>
              {sourceExt === 'pdf'
                ? 'La traducción de PDFs puede tardar 1–3 minutos según el número de páginas.'
                : 'Extrayendo texto y procesando con IA. Puede tomar unos segundos.'}
            </p>
          </div>
        )}

        {step === 'done' && (
          <div className={styles.body}>
            <div className={styles.resultIcon}>✅</div>
            <p className={styles.resultTitle}>¡Traducción completada!</p>
            <p className={styles.hint}>
              El archivo <strong>{newFileName}</strong> ya está disponible en esta carpeta.
            </p>
            <div className={styles.downloadRow}>
              <button className={styles.downloadBtn} onClick={handleDownloadPdf}>
                <span>📄</span> Descargar como PDF
              </button>
              <button className={styles.downloadBtn} onClick={handleDownloadDocx}>
                <span>📝</span> Descargar como Word
              </button>
            </div>
            <div className={styles.footer}>
              <button className={styles.primaryBtn} onClick={onClose}>Cerrar</button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className={styles.body}>
            <div className={styles.resultIcon}>⚠️</div>
            <p className={styles.resultTitle} style={{ color: '#ff7088' }}>Error en la traducción</p>
            <p className={styles.errorDetail}>{error}</p>
            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={onClose}>Cerrar</button>
              <button className={styles.primaryBtn} onClick={() => setStep('select')}>
                Reintentar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
