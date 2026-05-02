// src/components/agents/LawyerAgent.jsx
import { useEffect, useState } from 'react';
import styles from './LawyerAgent.module.css';
import { extractTextFromBlob, analyzeLegalDocument } from '../../services/anthropicService';
import api from '../../services/api';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const blob = await api.getFileBlob(file.id);
        const text = await extractTextFromBlob(blob, file.name);

        if (!text.trim()) throw new Error('El archivo está vacío o no se pudo extraer su texto');

        const result = await analyzeLegalDocument({ text, fileName: file.name });
        if (!cancelled) setAnalysis(result);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Error al analizar el documento');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [file]);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitleWrap}>
            <span className={styles.panelIcon}>⚖️</span>
            <div>
              <h2 className={styles.panelTitle}>Abogado IA</h2>
              <p className={styles.panelFile}>{file.name}</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.disclaimer}>
          ⓘ Solo informativo — no constituye consejo legal profesional.
        </div>

        <div className={styles.panelBody}>
          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>Analizando documento...</p>
              <p className={styles.loadingHint}>Extrayendo texto y procesando con IA</p>
            </div>
          )}

          {error && (
            <div className={styles.errorState}>
              <span className={styles.errorIcon}>⚠️</span>
              <p className={styles.errorText}>{error}</p>
              <button className={styles.retryBtn} onClick={onClose}>Cerrar</button>
            </div>
          )}

          {analysis && (
            <>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>📋 Resumen</h3>
                <p className={styles.summaryText}>{analysis.resumen}</p>
              </section>

              <Section
                title="🔴 Cláusulas de riesgo"
                items={analysis.riesgos}
                cardClass="cardRed"
                titleClass="titleRed"
              />
              <Section
                title="🟡 Puntos de atención"
                items={analysis.atenciones}
                cardClass="cardYellow"
                titleClass="titleYellow"
              />
              <Section
                title="🟢 Puntos favorables"
                items={analysis.favorables}
                cardClass="cardGreen"
                titleClass="titleGreen"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
