import { useState } from 'react';
import styles from './CopilotAgent.module.css';
import { searchFilesWithAI, summarizeFolderWithAI } from '../../services/anthropicService';
import Toast from '../Toast';

const HISTORY_KEY = 'ultranube_copilot_history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(query) {
  const h = loadHistory().filter(q => q !== query);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([query, ...h].slice(0, 5)));
}

export default function CopilotAgent({ items, currentFolderName }) {
  const [query, setQuery]               = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [results, setResults]           = useState(null);
  const [summary, setSummary]           = useState(null);
  const [error, setError]               = useState('');
  const [toast, setToast]               = useState(null);
  const [history, setHistory]           = useState(loadHistory);
  const [showHistory, setShowHistory]   = useState(false);

  const buildIndex = () =>
    items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      date: item.createdAt || item.updatedAt || '',
      path: item.name,
    }));

  const handleSearch = async (q = query) => {
    const term = (typeof q === 'string' ? q : query).trim();
    if (!term) return;
    setSearchLoading(true);
    setError('');
    setResults(null);
    setSummary(null);
    setShowHistory(false);

    try {
      const index = buildIndex();
      if (index.length === 0) {
        setError('No hay archivos en esta carpeta para buscar.');
        setSearchLoading(false);
        return;
      }
      saveHistory(term);
      setHistory(loadHistory());
      const result = await searchFilesWithAI({ query: term, fileIndex: index });
      setResults(result);
      const count = result.resultados?.length || 0;
      setToast({ message: `🔍 ${count} resultado${count !== 1 ? 's' : ''} encontrado${count !== 1 ? 's' : ''}`, type: count ? 'success' : 'info' });
    } catch (e) {
      setError(e.message || 'Error en la búsqueda con IA');
      setToast({ message: 'Error en la búsqueda', type: 'error' });
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
      const files = items.filter(i => i.type === 'file');
      if (files.length === 0) {
        setError('No hay archivos en esta carpeta para resumir.');
        setSummaryLoading(false);
        return;
      }
      const result = await summarizeFolderWithAI({ items: files, folderName: currentFolderName || 'Mi Drive' });
      setSummary(result);
      setToast({ message: '📊 Resumen generado', type: 'success' });
    } catch (e) {
      setError(e.message || 'Error al generar el resumen');
      setToast({ message: 'Error al resumir', type: 'error' });
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
  const hasPanel  = !!(results || summary || error);

  return (
    <>
      <div className={styles.wrapper}>
        {/* Search bar */}
        <div className={styles.bar}>
          <span className={`${styles.starIcon} ${isLoading ? styles.starPulsing : ''}`}>✨</span>
          <input
            className={styles.input}
            type="text"
            placeholder='Pregunta en lenguaje natural… "contrato de renta 2024"'
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 150)}
            disabled={isLoading}
          />
          <button
            className={styles.askBtn}
            onClick={() => handleSearch()}
            disabled={isLoading || !query.trim()}
          >
            {searchLoading ? <span className={styles.btnSpinner} /> : 'Preguntar'}
          </button>
          <button
            className={styles.summaryBtn}
            onClick={handleSummarize}
            disabled={isLoading}
          >
            {summaryLoading ? <span className={styles.btnSpinner} /> : '📊 Resumir'}
          </button>
        </div>

        {/* Query history dropdown */}
        {showHistory && history.length > 0 && (
          <div className={styles.historyDropdown}>
            {history.map((h, i) => (
              <button
                key={i}
                className={styles.historyItem}
                onMouseDown={() => {
                  setQuery(h);
                  handleSearch(h);
                }}
              >
                <span className={styles.historyIcon}>🕐</span>
                <span className={styles.historyQuery}>{h}</span>
              </button>
            ))}
          </div>
        )}

        {/* Results panel */}
        {hasPanel && (
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelLabel}>
                {results ? '🔍 Resultados IA' : summary ? '📊 Resumen de carpeta' : '⚠️ Error'}
              </span>
              <button className={styles.panelClose} onClick={handleClose}>✕</button>
            </div>

            {error && <p className={styles.errorMsg}>{error}</p>}

            {results && (
              <>
                <p className={styles.aiMessage}>{results.mensaje}</p>
                {results.resultados?.length === 0 && (
                  <p className={styles.noResults}>No se encontraron archivos relevantes.</p>
                )}
                <div className={styles.resultList}>
                  {results.resultados?.map((r, i) => (
                    <div key={i} className={styles.resultCard}>
                      <div className={styles.resultTop}>
                        <span className={styles.resultFileIcon}>📄</span>
                        <span className={styles.resultName}>{r.name}</span>
                        <span className={styles.resultRank}>#{i + 1}</span>
                      </div>
                      <p className={styles.resultReason}>{r.razon}</p>
                      {r.fragmento && <p className={styles.resultFragment}>"{r.fragmento}"</p>}
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

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
