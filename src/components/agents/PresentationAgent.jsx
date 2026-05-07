import { useEffect, useRef, useState } from 'react';
import styles from './PresentationAgent.module.css';
import { extractTextFromBlob, generatePresentationContent } from '../../services/anthropicService';
import api from '../../services/api';
import Toast from '../Toast';

const SLIDE_COUNTS = [5, 10, 15, 20];

const STYLES = [
  { id: 'Profesional', label: 'Profesional', icon: '💼', desc: 'Formal, estructurado, datos precisos' },
  { id: 'Creativo',    label: 'Creativo',    icon: '🎨', desc: 'Dinámico, visual, ejemplos vivos' },
  { id: 'Minimalista', label: 'Minimalista', icon: '⬜', desc: 'Simple, directo, máximo impacto' },
];

const LANGUAGES = [
  { name: 'Español',   flag: '🇲🇽' },
  { name: 'Inglés',    flag: '🇺🇸' },
  { name: 'Portugués', flag: '🇧🇷' },
  { name: 'Francés',   flag: '🇫🇷' },
  { name: 'Alemán',    flag: '🇩🇪' },
  { name: 'Italiano',  flag: '🇮🇹' },
];

const THINKING_MSGS = [
  'Analizando documento...',
  'Estructurando contenido...',
  'Generando diapositivas...',
  'Aplicando diseño...',
  'Guardando presentación...',
];

const HISTORY_KEY = 'ultranube_presentation_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(entry) {
  const h = loadHistory();
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...h].slice(0, 3)));
}

// pptxgenjs hex colors (no # prefix)
const THEMES = {
  Profesional: { bg: '0D0D22', title: 'FFFFFF', bullet: 'CCCCEE', accent: 'FF2D95', number: 'FF2D95' },
  Creativo:    { bg: '130820', title: 'FF2D95', bullet: 'E0E0FF', accent: '4ADE80', number: '4ADE80' },
  Minimalista: { bg: 'F8F8FC', title: '111122', bullet: '444466', accent: 'FF2D95', number: 'FF2D95' },
};

async function buildPptxBlob(data, style) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const prs = new PptxGenJS();
  prs.layout = 'LAYOUT_WIDE';

  const t = THEMES[style] || THEMES.Profesional;

  // ── Title slide ──
  const titleSlide = prs.addSlide();
  titleSlide.background = { fill: t.bg };
  titleSlide.addText(data.titulo || 'Presentación', {
    x: 0.5, y: 1.8, w: 12.3, h: 1.5,
    fontSize: 40, bold: true, color: t.title, align: 'center', fontFace: 'Calibri',
  });
  if (data.subtitulo) {
    titleSlide.addText(data.subtitulo, {
      x: 0.5, y: 3.5, w: 12.3, h: 0.8,
      fontSize: 22, color: t.accent, align: 'center', fontFace: 'Calibri',
    });
  }
  // Accent bar
  titleSlide.addShape(prs.ShapeType.rect, {
    x: 4.5, y: 5.6, w: 4.3, h: 0.06,
    fill: { color: t.accent },
    line: { color: t.accent },
  });

  // ── Content slides ──
  for (const slide of data.diapositivas || []) {
    const s = prs.addSlide();
    s.background = { fill: t.bg };

    // Title
    s.addText(slide.titulo || '', {
      x: 0.5, y: 0.25, w: 11.8, h: 0.85,
      fontSize: 28, bold: true, color: t.title, fontFace: 'Calibri',
    });

    // Accent line under title
    s.addShape(prs.ShapeType.rect, {
      x: 0.5, y: 1.15, w: 12.3, h: 0.04,
      fill: { color: t.accent },
      line: { color: t.accent },
    });

    // Bullets
    if (slide.bullets?.length) {
      const bulletRows = slide.bullets.map(b => ({
        text: b,
        options: { bullet: { code: '25CF' }, color: t.bullet, fontSize: 17, fontFace: 'Calibri', paraSpaceBefore: 6 },
      }));
      s.addText(bulletRows, {
        x: 0.7, y: 1.35, w: 11.8, h: 5.2,
        valign: 'top',
      });
    }

    // Slide number
    s.addText(String(slide.numero || ''), {
      x: 12.2, y: 6.8, w: 0.8, h: 0.3,
      fontSize: 11, color: t.number, align: 'right',
    });
  }

  return prs.write({ outputType: 'blob' });
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

export default function PresentationAgent({ file, folderId, onClose, onSuccess }) {
  const [slideCount, setSlideCount]   = useState(10);
  const [style, setStyle]             = useState('Profesional');
  const [language, setLanguage]       = useState('Español');
  const [step, setStep]               = useState('select');
  const [error, setError]             = useState('');
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [presentation, setPresentation] = useState(null);
  const [pptxBlob, setPptxBlob]       = useState(null);
  const [outputName, setOutputName]   = useState('');
  const [toast, setToast]             = useState(null);
  const [history, setHistory]         = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (step === 'loading') {
      intervalRef.current = setInterval(
        () => setThinkingIdx(i => (i + 1) % THINKING_MSGS.length),
        2000
      );
    }
    return () => clearInterval(intervalRef.current);
  }, [step]);

  const handleGenerate = async () => {
    setStep('loading');
    setError('');
    setThinkingIdx(0);

    try {
      const blob = await api.getFileBlob(file.id);
      const text = await extractTextFromBlob(blob, file.name);
      if (!text.trim()) throw new Error('El archivo está vacío o no se pudo extraer su texto');

      const data = await generatePresentationContent({
        text, fileName: file.name, slideCount, style, language,
      });

      const pptx = await buildPptxBlob(data, style);
      const name  = `${file.name.replace(/\.[^.]+$/, '')}_presentacion.pptx`;

      // Auto-save to cloud
      const fileObj = new File([pptx], name, {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      await api.uploadFileAsync(fileObj, folderId);

      setPresentation(data);
      setPptxBlob(pptx);
      setOutputName(name);

      saveHistory({ fileName: file.name, style, slideCount, date: new Date().toLocaleDateString('es-MX') });
      setHistory(loadHistory());
      setToast({ message: '📊 Presentación generada y guardada', type: 'success' });
      setStep('preview');
      onSuccess?.();
    } catch (e) {
      setError(e.message || 'Error al generar la presentación');
      setToast({ message: 'Error al generar presentación', type: 'error' });
      setStep('error');
    }
  };

  const handleDownload = () => {
    if (!pptxBlob) return;
    triggerBlobDownload(pptxBlob, outputName);
    setToast({ message: 'PPTX descargado', type: 'success' });
  };

  const selectedLang = LANGUAGES.find(l => l.name === language);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>

        {/* Header */}
        <div className={styles.panelHeader}>
          <div className={styles.panelTitleWrap}>
            <span className={styles.panelIcon}>📊</span>
            <div>
              <h2 className={styles.panelTitle}>Presentación IA</h2>
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
            <p className={styles.historyTitle}>Últimas presentaciones</p>
            {history.length === 0
              ? <p className={styles.historyEmpty}>Sin historial aún</p>
              : history.map((h, i) => (
                <div key={i} className={styles.historyItem}>
                  <span className={styles.historyFile}>📄 {h.fileName}</span>
                  <div className={styles.historyMeta}>
                    <span className={styles.historyStyle}>{h.style}</span>
                    <span className={styles.historySlides}>{h.slideCount} slides</span>
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
              {/* Slide count */}
              <div className={styles.optionGroup}>
                <p className={styles.optionLabel}>Número de diapositivas</p>
                <div className={styles.countGrid}>
                  {SLIDE_COUNTS.map(n => (
                    <button
                      key={n}
                      className={`${styles.countCard} ${slideCount === n ? styles.countCardActive : ''}`}
                      onClick={() => setSlideCount(n)}
                    >
                      <span className={styles.countNum}>{n}</span>
                      <span className={styles.countLabel}>slides</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div className={styles.optionGroup}>
                <p className={styles.optionLabel}>Estilo</p>
                <div className={styles.styleGrid}>
                  {STYLES.map(s => (
                    <button
                      key={s.id}
                      className={`${styles.styleCard} ${style === s.id ? styles.styleCardActive : ''}`}
                      onClick={() => setStyle(s.id)}
                    >
                      <span className={styles.styleIcon}>{s.icon}</span>
                      <span className={styles.styleName}>{s.label}</span>
                      <span className={styles.styleDesc}>{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className={styles.optionGroup}>
                <p className={styles.optionLabel}>Idioma</p>
                <div className={styles.langGrid}>
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.name}
                      className={`${styles.langCard} ${language === lang.name ? styles.langCardActive : ''}`}
                      onClick={() => setLanguage(lang.name)}
                    >
                      <span className={styles.langFlag}>{lang.flag}</span>
                      <span className={styles.langName}>{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <p className={styles.hint}>
                Se generará <strong>{slideCount} diapositivas</strong> en estilo <strong>{style}</strong> en <strong>{selectedLang?.flag} {language}</strong> y se guardará automáticamente en tu nube.
              </p>

              <div className={styles.actions}>
                <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
                <button className={styles.primaryBtn} onClick={handleGenerate}>
                  📊 Generar presentación
                </button>
              </div>
            </>
          )}

          {/* loading */}
          {step === 'loading' && (
            <div className={styles.loadingState}>
              <div className={styles.slideAnim}>
                {[0, 1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    className={styles.slideMini}
                    style={{ animationDelay: `${i * 0.18}s` }}
                  />
                ))}
              </div>
              <div className={styles.pulseWrap}>
                <div className={styles.pulseRing} />
                <div className={styles.pulseRing} style={{ animationDelay: '0.5s' }} />
                <div className={styles.pulseRing} style={{ animationDelay: '1s' }} />
                <div className={styles.pulseCore}>📊</div>
              </div>
              <p className={styles.thinkingMsg}>{THINKING_MSGS[thinkingIdx]}</p>
              <div className={styles.typingDots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
              <p className={styles.hint}>Esto puede tardar entre 30 y 60 segundos según el tamaño del documento.</p>
            </div>
          )}

          {/* preview */}
          {step === 'preview' && presentation && (
            <div className={styles.previewState}>
              <div className={styles.previewHeader}>
                <div className={styles.savedBadge}>✅ Guardado en tu nube</div>
                <p className={styles.previewTitle}>{presentation.titulo}</p>
                {presentation.subtitulo && (
                  <p className={styles.previewSubtitle}>{presentation.subtitulo}</p>
                )}
                <div className={styles.previewMeta}>
                  <span>{presentation.diapositivas?.length} diapositivas</span>
                  <span>·</span>
                  <span>{style}</span>
                  <span>·</span>
                  <span>{selectedLang?.flag} {language}</span>
                </div>
              </div>

              <div className={styles.slidesPreview}>
                {/* Title card */}
                <div className={`${styles.slideCard} ${styles.slideCardTitle}`}>
                  <div className={styles.slideNum}>Portada</div>
                  <p className={styles.slideTitleText}>{presentation.titulo}</p>
                  {presentation.subtitulo && (
                    <p className={styles.slideSubtitleText}>{presentation.subtitulo}</p>
                  )}
                </div>

                {/* Content slides */}
                {(presentation.diapositivas || []).map((slide, i) => (
                  <div key={i} className={styles.slideCard}>
                    <div className={styles.slideNum}>#{slide.numero}</div>
                    <p className={styles.slideTitleText}>{slide.titulo}</p>
                    <ul className={styles.slideBullets}>
                      {(slide.bullets || []).map((b, j) => (
                        <li key={j} className={styles.slideBullet}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <button className={styles.downloadBtn} onClick={handleDownload}>
                ⬇️ Descargar PPTX
              </button>
              <button className={styles.closeActionBtn} onClick={onClose}>Cerrar</button>
            </div>
          )}

          {/* error */}
          {step === 'error' && (
            <div className={styles.errorState}>
              <span className={styles.errorIcon}>⚠️</span>
              <p className={styles.errorText}>{error}</p>
              <div className={styles.actions}>
                <button className={styles.cancelBtn} onClick={onClose}>Cerrar</button>
                <button className={styles.primaryBtn} onClick={() => setStep('select')}>
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
