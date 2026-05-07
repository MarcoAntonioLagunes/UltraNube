import { useEffect, useState, useRef } from 'react';
import styles from './LawyerAgent.module.css';
import { extractTextFromBlob, analyzeLegalDocument } from '../../services/anthropicService';
import api from '../../services/api';
import Toast from '../Toast';

const THINKING_MSGS = [
  'Leyendo documento...',
  'Procesando con IA...',
  'Generando análisis...',
  'Identificando cláusulas...',
  'Evaluando riesgos...',
];

const HISTORY_KEY = 'ultranube_lawyer_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(entry) {
  const h = loadHistory();
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...h].slice(0, 3)));
}

function computeRisk(analysis) {
  const r = (analysis.riesgos || []).length;
  const a = (analysis.atenciones || []).length;
  if (r >= 3) return { label: 'Alto',  color: '#ff4b6e', pct: 90 };
  if (r >= 1 || a >= 3) return { label: 'Medio', color: '#f59e0b', pct: 52 };
  return { label: 'Bajo', color: '#4ade80', pct: 14 };
}

function toBullets(resumen = '') {
  return resumen
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15)
    .slice(0, 3);
}

function Section({ title, items, cardClass, titleClass }) {
  if (!items?.length) return null;
  return (
    <section className={styles.section}>
      <h3 className={`${styles.sectionTitle} ${styles[titleClass]}`}>{title}</h3>
      {items.map((item, i) => (
        <div key={i} className={`${styles.card} ${styles[cardClass]}`}>
          <strong className={styles.cardTitle}>{item.titulo}</strong>
          <p className={styles.cardDesc}>{item.descripcion}</p>
        </div>
      ))}
    </section>
  );
}

export default function LawyerAgent({ file, onClose }) {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [analysis, setAnalysis]     = useState(null);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [toast, setToast]           = useState(null);
  const [history, setHistory]       = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const intervalRef = useRef(null);

  // Rotate thinking messages every 2 s while loading
  useEffect(() => {
    if (loading) {
      intervalRef.current = setInterval(
        () => setThinkingIdx(i => (i + 1) % THINKING_MSGS.length),
        2000
      );
    }
    return () => clearInterval(intervalRef.current);
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const blob   = await api.getFileBlob(file.id);
        const text   = await extractTextFromBlob(blob, file.name);
        if (!text.trim()) throw new Error('El archivo está vacío o no se pudo extraer su texto');
        const result = await analyzeLegalDocument({ text, fileName: file.name });
        if (cancelled) return;
        setAnalysis(result);
        const risk = computeRisk(result);
        const entry = { fileName: file.name, date: new Date().toLocaleDateString('es-MX'), risk: risk.label };
        saveHistory(entry);
        setHistory(loadHistory());
        api.logActivity('analyze', file.name);
        setToast({ message: '⚖️ Análisis legal completado', type: 'success' });
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error al analizar el documento');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  const handleExportPdf = async () => {
    if (!analysis) return;
    const { default: jsPDF } = await import('jspdf');
    const doc    = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 18;
    const maxW   = doc.internal.pageSize.getWidth() - margin * 2;
    const pageH  = doc.internal.pageSize.getHeight();
    let y = margin;

    const ln = (text, size = 10, color = [220, 220, 235]) => {
      const lines = doc.splitTextToSize(String(text), maxW);
      doc.setFontSize(size);
      doc.setTextColor(...color);
      if (y + lines.length * 6 > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(lines, margin, y);
      y += lines.length * 7;
    };

    doc.setFillColor(5, 5, 9);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), pageH, 'F');

    ln('Análisis Legal — UltraNube', 18, [255, 45, 149]);
    ln(`Archivo: ${file.name}`, 10, [170, 170, 200]);
    ln(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, 10, [140, 140, 175]);
    y += 3;

    ln('RESUMEN EJECUTIVO', 13, [255, 255, 255]);
    ln(analysis.resumen, 10, [200, 200, 225]);
    y += 4;

    if (analysis.riesgos?.length) {
      ln('CLÁUSULAS DE RIESGO', 12, [255, 75, 110]);
      analysis.riesgos.forEach(r => {
        ln(`• ${r.titulo}`, 10, [255, 160, 175]);
        ln(`  ${r.descripcion}`, 9, [200, 180, 185]);
      });
      y += 2;
    }
    if (analysis.atenciones?.length) {
      ln('PUNTOS DE ATENCIÓN', 12, [245, 158, 11]);
      analysis.atenciones.forEach(a => {
        ln(`• ${a.titulo}`, 10, [250, 200, 110]);
        ln(`  ${a.descripcion}`, 9, [200, 190, 160]);
      });
      y += 2;
    }
    if (analysis.favorables?.length) {
      ln('PUNTOS FAVORABLES', 12, [74, 222, 128]);
      analysis.favorables.forEach(f => {
        ln(`• ${f.titulo}`, 10, [150, 230, 170]);
        ln(`  ${f.descripcion}`, 9, [180, 215, 185]);
      });
    }

    doc.save(`analisis-legal-${file.name.replace(/\.[^.]+$/, '')}.pdf`);
    setToast({ message: 'PDF exportado correctamente', type: 'success' });
  };

  const risk    = analysis ? computeRisk(analysis) : null;
  const bullets = analysis ? toBullets(analysis.resumen) : [];

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>

        {/* Header */}
        <div className={styles.panelHeader}>
          <div className={styles.panelTitleWrap}>
            <span className={styles.panelIcon}>⚖️</span>
            <div>
              <h2 className={styles.panelTitle}>Abogado IA</h2>
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
            <p className={styles.historyTitle}>Últimos análisis</p>
            {history.length === 0
              ? <p className={styles.historyEmpty}>Sin historial aún</p>
              : history.map((h, i) => (
                <div key={i} className={styles.historyItem}>
                  <span className={styles.historyFile}>📄 {h.fileName}</span>
                  <div className={styles.historyMeta}>
                    <span className={styles.historyDate}>{h.date}</span>
                    <span
                      className={styles.historyRisk}
                      style={{ color: h.risk === 'Alto' ? '#ff4b6e' : h.risk === 'Medio' ? '#f59e0b' : '#4ade80' }}
                    >{h.risk}</span>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        <div className={styles.disclaimer}>
          ⓘ Solo informativo — no constituye consejo legal profesional.
        </div>

        <div className={styles.panelBody}>
          {/* Loading */}
          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.pulseWrap}>
                <div className={styles.pulseRing} />
                <div className={styles.pulseRing} style={{ animationDelay: '0.5s' }} />
                <div className={styles.pulseRing} style={{ animationDelay: '1s' }} />
                <div className={styles.pulseCore}>⚖️</div>
              </div>
              <p className={styles.thinkingMsg}>{THINKING_MSGS[thinkingIdx]}</p>
              <div className={styles.typingDots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className={styles.errorState}>
              <span className={styles.errorIcon}>⚠️</span>
              <p className={styles.errorText}>{error}</p>
              <button className={styles.retryBtn} onClick={onClose}>Cerrar</button>
            </div>
          )}

          {/* Results */}
          {analysis && risk && (
            <>
              {/* Semáforo de riesgo */}
              <div className={styles.riskCard}>
                <div className={styles.riskHeader}>
                  <span className={styles.riskLabel}>Nivel de riesgo general</span>
                  <span
                    className={styles.riskBadge}
                    style={{ background: `${risk.color}22`, color: risk.color, borderColor: `${risk.color}44` }}
                  >{risk.label}</span>
                </div>
                <div className={styles.riskBarTrack}>
                  <div
                    className={styles.riskBarFill}
                    style={{ width: `${risk.pct}%`, background: `linear-gradient(90deg, ${risk.color}aa, ${risk.color})` }}
                  />
                </div>
                <div className={styles.riskCounts}>
                  <span style={{ color: '#ff4b6e' }}>🔴 {(analysis.riesgos || []).length} riesgos</span>
                  <span style={{ color: '#f59e0b' }}>🟡 {(analysis.atenciones || []).length} atenciones</span>
                  <span style={{ color: '#4ade80' }}>🟢 {(analysis.favorables || []).length} favorables</span>
                </div>
              </div>

              {/* Resumen ejecutivo */}
              {bullets.length > 0 && (
                <section className={styles.summarySection}>
                  <h3 className={styles.summaryTitle}>📋 Resumen ejecutivo</h3>
                  <ul className={styles.bulletList}>
                    {bullets.map((b, i) => <li key={i} className={styles.bulletItem}>{b}</li>)}
                  </ul>
                </section>
              )}

              <Section title="🔴 Cláusulas de riesgo"  items={analysis.riesgos}    cardClass="cardRed"    titleClass="titleRed" />
              <Section title="🟡 Puntos de atención"   items={analysis.atenciones} cardClass="cardYellow" titleClass="titleYellow" />
              <Section title="🟢 Puntos favorables"    items={analysis.favorables} cardClass="cardGreen"  titleClass="titleGreen" />

              <button className={styles.exportBtn} onClick={handleExportPdf}>
                📄 Exportar análisis como PDF
              </button>
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
