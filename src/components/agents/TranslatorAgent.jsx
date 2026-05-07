import { useEffect, useState, useRef } from 'react';
import styles from './TranslatorAgent.module.css';
import { extractTextFromBlob, translateText } from '../../services/anthropicService';
import api from '../../services/api';
import Toast from '../Toast';

const LANGUAGES = [
  { name: 'Inglés',    flag: '🇺🇸' },
  { name: 'Español',   flag: '🇲🇽' },
  { name: 'Portugués', flag: '🇧🇷' },
  { name: 'Francés',   flag: '🇫🇷' },
  { name: 'Alemán',    flag: '🇩🇪' },
  { name: 'Italiano',  flag: '🇮🇹' },
  { name: 'Holandés',  flag: '🇳🇱' },
];

const THINKING_MSGS = [
  'Extrayendo texto...',
  'Procesando con IA...',
  'Traduciendo...',
  'Revisando calidad...',
  'Guardando en la nube...',
];

const HISTORY_KEY = 'ultranube_translator_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(entry) {
  const h = loadHistory();
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...h].slice(0, 3)));
}

function buildOutputName(originalName) {
  const parts = originalName.split('.');
  const ext = parts.length > 1 ? parts.pop() : '';
  const base = parts.join('.');
  const outputExt = ext === 'pdf' ? 'pdf' : ['txt', 'md'].includes(ext) ? ext : 'txt';
  return `${base}_traducido.${outputExt}`;
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
  const [step, setStep]                     = useState('select');
  const [error, setError]                   = useState('');
  const [newFileName, setNewFileName]       = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [translatedPdfBlob, setTranslatedPdfBlob] = useState(null);
  const [progress, setProgress]             = useState(0);
  const [thinkingIdx, setThinkingIdx]       = useState(0);
  const [copied, setCopied]                 = useState(false);
  const [toast, setToast]                   = useState(null);
  const [history, setHistory]               = useState(loadHistory);
  const [showHistory, setShowHistory]       = useState(false);
  const intervalRef  = useRef(null);
  const progressRef  = useRef(null);

  const sourceExt = file.name.split('.').pop().toLowerCase();

  useEffect(() => {
    if (step === 'loading') {
      intervalRef.current = setInterval(
        () => setThinkingIdx(i => (i + 1) % THINKING_MSGS.length),
        2000
      );
      setProgress(8);
      progressRef.current = setInterval(() => {
        setProgress(p => (p < 85 ? p + Math.random() * 4 : p));
      }, 600);
    }
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(progressRef.current);
    };
  }, [step]);

  const handleTranslate = async () => {
    setStep('loading');
    setError('');
    setProgress(0);
    setThinkingIdx(0);

    try {
      const blob = await api.getFileBlob(file.id);
      const outputName = buildOutputName(file.name);
      let uploadBlob, mimeType, textForState, pdfBlobForState = null;

      if (sourceExt === 'pdf') {
        const { translatePdfWithLayout } = await import('../../services/pdfTranslationService');
        const result = await translatePdfWithLayout(blob, targetLanguage, () => {});
        uploadBlob = result.blob;
        mimeType = 'application/pdf';
        textForState = result.translatedText;
        pdfBlobForState = result.blob;
      } else {
        const text = await extractTextFromBlob(blob, file.name);
        if (!text.trim()) throw new Error('El archivo está vacío o no se pudo extraer su texto');
        textForState = await translateText({ text, targetLang: targetLanguage, fileName: file.name });
        uploadBlob = new Blob([textForState], { type: 'text/plain' });
        mimeType = 'text/plain';
      }

      await api.uploadFileAsync(new File([uploadBlob], outputName, { type: mimeType }), folderId);

      setProgress(100);
      setTranslatedText(textForState);
      setTranslatedPdfBlob(pdfBlobForState);
      setNewFileName(outputName);

      const lang = LANGUAGES.find(l => l.name === targetLanguage);
      saveHistory({ fileName: file.name, targetLanguage, flag: lang?.flag || '🌐', date: new Date().toLocaleDateString('es-MX') });
      setHistory(loadHistory());
      api.logActivity('translate', file.name, { language: targetLanguage });
      setToast({ message: `${lang?.flag || '🌐'} Traducción completada`, type: 'success' });
      setStep('done');
      onSuccess?.();
    } catch (e) {
      setError(e.message || 'Error desconocido durante la traducción');
      setToast({ message: 'Error en la traducción', type: 'error' });
      setStep('error');
    }
  };

  const handleCopy = async () => {
    if (!translatedText) return;
    await navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = async () => {
    if (translatedPdfBlob) {
      triggerBlobDownload(translatedPdfBlob, swapExt(newFileName, 'pdf'));
      setToast({ message: 'PDF descargado', type: 'success' });
      return;
    }
    // Use pdf-lib + Noto Sans (same Unicode font used by the PDF translator)
    // so non-Latin scripts render correctly in the output PDF.
    const { buildTextPdf } = await import('../../services/pdfTranslationService');
    const pdfBlob = await buildTextPdf(translatedText, targetLanguage);
    triggerBlobDownload(pdfBlob, swapExt(newFileName, 'pdf'));
    setToast({ message: 'PDF descargado', type: 'success' });
  };

  const handleDownloadDocx = async () => {
    const { Document, Paragraph, TextRun, Packer } = await import('docx');
    const paragraphs = translatedText.split('\n').map(line => new Paragraph({ children: [new TextRun(line)] }));
    const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    triggerBlobDownload(blob, swapExt(newFileName, 'docx'));
    setToast({ message: 'Word descargado', type: 'success' });
  };

  const selectedLang = LANGUAGES.find(l => l.name === targetLanguage);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>

        {/* Header */}
        <div className={styles.panelHeader}>
          <div className={styles.panelTitleWrap}>
            <span className={styles.panelIcon}>🌐</span>
            <div>
              <h2 className={styles.panelTitle}>Traductor IA</h2>
              <p className={styles.panelFile} title={file.name}>{file.name}</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button
              className={`${styles.iconBtn} ${showHistory ? styles.iconBtnActive : ''}`}
              onClick={() => setShowHistory(v => !v)}
              title="Historial"
            >🕐</button>
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* History drawer */}
        {showHistory && (
          <div className={styles.historyPanel}>
            <p className={styles.historyTitle}>Últimas traducciones</p>
            {history.length === 0
              ? <p className={styles.historyEmpty}>Sin historial aún</p>
              : history.map((h, i) => (
                <div key={i} className={styles.historyItem}>
                  <span className={styles.historyFile}>📄 {h.fileName}</span>
                  <div className={styles.historyMeta}>
                    <span className={styles.historyFlag}>{h.flag}</span>
                    <span className={styles.historyLang}>{h.targetLanguage}</span>
                    <span className={styles.historyDate}>{h.date}</span>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        <div className={styles.panelBody}>

          {/* select */}
          {step === 'select' && (
            <>
              <p className={styles.stepLabel}>Selecciona el idioma de destino</p>
              <div className={styles.langGrid}>
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.name}
                    className={`${styles.langCard} ${targetLanguage === lang.name ? styles.langCardActive : ''}`}
                    onClick={() => setTargetLanguage(lang.name)}
                  >
                    <span className={styles.langFlag}>{lang.flag}</span>
                    <span className={styles.langName}>{lang.name}</span>
                  </button>
                ))}
              </div>
              <p className={styles.hint}>
                Se guardará como <strong>{buildOutputName(file.name)}</strong> en esta carpeta.
                {sourceExt === 'pdf' && ' Se preservará la estructura visual del PDF.'}
              </p>
              <div className={styles.actions}>
                <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
                <button className={styles.primaryBtn} onClick={handleTranslate}>
                  {selectedLang?.flag} Traducir al {targetLanguage}
                </button>
              </div>
            </>
          )}

          {/* loading */}
          {step === 'loading' && (
            <div className={styles.loadingState}>
              <div className={styles.pulseWrap}>
                <div className={styles.pulseRing} />
                <div className={styles.pulseRing} style={{ animationDelay: '0.5s' }} />
                <div className={styles.pulseRing} style={{ animationDelay: '1s' }} />
                <div className={styles.pulseCore}>{selectedLang?.flag || '🌐'}</div>
              </div>
              <p className={styles.thinkingMsg}>{THINKING_MSGS[thinkingIdx]}</p>
              <div className={styles.typingDots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
              <p className={styles.progressLabel}>{Math.round(progress)}%</p>
              <p className={styles.hint}>
                {sourceExt === 'pdf'
                  ? 'La traducción de PDFs puede tardar 1–3 minutos.'
                  : 'Procesando con IA. Puede tomar unos segundos.'}
              </p>
            </div>
          )}

          {/* done */}
          {step === 'done' && (
            <div className={styles.doneState}>
              <div className={styles.doneIcon}>✅</div>
              <p className={styles.doneTitle}>¡Traducción completada!</p>
              <p className={styles.hint}>
                El archivo <strong>{newFileName}</strong> ya está disponible en esta carpeta.
              </p>
              {translatedText && (
                <div className={styles.previewBox}>
                  <div className={styles.previewHeader}>
                    <span className={styles.previewLabel}>Vista previa</span>
                    <button className={styles.copyBtn} onClick={handleCopy}>
                      {copied ? '✅ Copiado' : '📋 Copiar'}
                    </button>
                  </div>
                  <p className={styles.previewText}>
                    {translatedText.slice(0, 320)}{translatedText.length > 320 ? '…' : ''}
                  </p>
                </div>
              )}
              <div className={styles.downloadRow}>
                <button className={styles.downloadBtn} onClick={handleDownloadPdf}>📄 PDF</button>
                <button className={styles.downloadBtn} onClick={handleDownloadDocx}>📝 Word</button>
              </div>
              <button className={styles.primaryBtn} style={{ width: '100%' }} onClick={onClose}>Cerrar</button>
            </div>
          )}

          {/* error */}
          {step === 'error' && (
            <div className={styles.errorState}>
              <span className={styles.errorIcon}>⚠️</span>
              <p className={styles.errorText}>{error}</p>
              <div className={styles.actions}>
                <button className={styles.cancelBtn} onClick={onClose}>Cerrar</button>
                <button className={styles.primaryBtn} onClick={() => { setStep('select'); setProgress(0); }}>
                  Reintentar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
