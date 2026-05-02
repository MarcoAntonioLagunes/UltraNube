// src/components/agents/CopilotAgent.jsx
import { useState } from 'react';
import styles from './CopilotAgent.module.css';
import { searchFilesWithAI, summarizeFolderWithAI } from '../../services/anthropicService';

export default function CopilotAgent({ items, currentFolderName }) {
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const buildIndex = () =>
    items.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      date: item.createdAt || item.updatedAt || '',
      path: item.name,
    }));

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setError('');
    setResults(null);
    setSummary(null);

    try {
      const index = buildIndex();
      if (index.length === 0) {
        setError('No hay archivos en esta carpeta para buscar.');
        return;
      }
      const result = await searchFilesWithAI({ query: query.trim(), fileIndex: index });
      setResults(result);
    } catch (e) {
      setError(e.message || 'Error en la búsqueda con IA');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSummarize = async () => {
    setSummaryLoading(true);
    setError('');
    setResults(null);
    setSummary(null);

    try {
      const files = items.filter((i) => i.type === 'file');
      if (files.length === 0) {
        setError('No hay archivos en esta carpeta para resumir.');
        setSummaryLoading(false);
        return;
      }
      const result = await summarizeFolderWithAI({
        items: files,
        folderName: currentFolderName || 'Mi Drive',
      });
      setSummary(result);
    } catch (e) {
      setError(e.message || 'Error al generar el resumen');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleClose = () => {
    setResults(null);
    setSummary(null);
    setError('');
  };

  const isLoading = searchLoading || summaryLoading;
  const hasPanel = !!(results || summary || error);

  return (
    <div className={styles.wrapper}>
      <div className={styles.bar}>
        <span className={styles.sparkle}>✨</span>
        <input
          className={styles.input}
          type="text"
          placeholder='Pregunta en lenguaje natural… "contrato de renta 2024", "¿cuánto le cobré al cliente X?"'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          disabled={isLoading}
        />
        <button
          className={styles.askBtn}
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
        >
          {searchLoading ? <span className={styles.btnSpinner} /> : 'Preguntar'}
        </button>
        <button
          className={styles.summaryBtn}
          onClick={handleSummarize}
          disabled={isLoading}
        >
          {summaryLoading ? <span className={styles.btnSpinner} /> : 'Resumir carpeta'}
        </button>
      </div>

      {hasPanel && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelLabel}>
              {results ? '🔍 Resultados de búsqueda IA' : summary ? '📊 Resumen de carpeta' : '⚠️ Error'}
            </span>
            <button className={styles.panelClose} onClick={handleClose}>✕</button>
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          {results && (
            <>
              <p className={styles.aiMessage}>{results.mensaje}</p>
              {results.resultados?.length === 0 && (
                <p className={styles.noResults}>No se encontraron archivos relevantes para esa pregunta.</p>
              )}
              <div className={styles.resultList}>
                {results.resultados?.map((r, i) => (
                  <div key={i} className={styles.resultCard}>
                    <div className={styles.resultName}>📄 {r.name}</div>
                    <div className={styles.resultReason}>{r.razon}</div>
                    <div className={styles.resultFragment}>{r.fragmento}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {summary && (
            <>
              <p className={styles.aiMessage}>{summary.resumen}</p>
              <div className={styles.categoryList}>
                {summary.categorias?.map((cat, i) => (
                  <div key={i} className={styles.categoryCard}>
                    <div className={styles.categoryTop}>
                      <span className={styles.categoryName}>{cat.nombre}</span>
                      <span className={styles.categoryCount}>{cat.cantidad} archivo{cat.cantidad !== 1 ? 's' : ''}</span>
                    </div>
                    <p className={styles.categoryDesc}>{cat.descripcion}</p>
                  </div>
                ))}
              </div>
              {summary.sugerencia && (
                <div className={styles.suggestion}>
                  <span>💡</span>
                  <span>{summary.sugerencia}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
