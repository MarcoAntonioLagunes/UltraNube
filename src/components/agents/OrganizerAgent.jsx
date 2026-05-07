import { useEffect, useRef, useState } from 'react';
import styles from './OrganizerAgent.module.css';
import { suggestOrganization } from '../../services/anthropicService';
import api from '../../services/api';
import Toast from '../Toast';

const THINKING_MSGS = [
  'Analizando tus archivos...',
  'Detectando patrones...',
  'Identificando categorías...',
  'Buscando duplicados...',
  'Generando sugerencias...',
];

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: '📄', doc: '📄', docx: '📄', txt: '📄', md: '📄',
    xls: '📊', xlsx: '📊', csv: '📊',
    ppt: '📊', pptx: '📊',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
    mp4: '🎬', mov: '🎬', avi: '🎬',
    mp3: '🎵', wav: '🎵',
    zip: '🗜️', rar: '🗜️',
  };
  return map[ext] || '📄';
}

export default function OrganizerAgent({ onClose, onSuccess }) {
  const [step, setStep]             = useState('loading');
  const [error, setError]           = useState('');
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [allFiles, setAllFiles]     = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [checked, setChecked]       = useState({});   // { folderName: true/false }
  const [applying, setApplying]     = useState(false);
  const [applyProgress, setApplyProgress] = useState({ done: 0, total: 0, current: '' });
  const [toast, setToast]           = useState(null);
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

  // On mount — fetch files then ask AI
  useEffect(() => {
    (async () => {
      try {
        const files = await api.getAllUserFiles();
        setAllFiles(files);

        if (files.length === 0) {
          setError('No tienes archivos en tu nube para organizar.');
          setStep('error');
          return;
        }

        const normalized = files.map(f => ({
          id: f._id || f.id,
          name: f.originalName || f.name,
          size: f.size,
          folder: f.folder,
          createdAt: f.createdAt,
        }));

        const result = await suggestOrganization({ files: normalized });
        setSuggestion(result);

        // Default all folder suggestions to checked
        const initChecked = {};
        (result.carpetas || []).forEach(c => { initChecked[c.nombre] = true; });
        setChecked(initChecked);

        setStep('preview');
      } catch (e) {
        setError(e.message || 'Error al analizar los archivos');
        setStep('error');
      }
    })();
  }, []);

  // Build name → fileObject map for fast lookup
  const filesByName = {};
  allFiles.forEach(f => {
    const name = f.originalName || f.name;
    if (!filesByName[name]) filesByName[name] = f;
  });

  const checkedFolders = (suggestion?.carpetas || []).filter(c => checked[c.nombre]);

  const totalFilesToMove = checkedFolders.reduce((acc, c) => acc + (c.archivos || []).length, 0);

  const handleApply = async (all = false) => {
    const toApply = all ? (suggestion?.carpetas || []) : checkedFolders;
    if (toApply.length === 0) return;

    setApplying(true);
    const totalFiles = toApply.reduce((acc, c) => acc + (c.archivos || []).length, 0);
    let doneCount = 0;
    let movedCount = 0;
    let errorCount = 0;

    for (const carpeta of toApply) {
      try {
        setApplyProgress({ done: doneCount, total: totalFiles, current: `Creando carpeta "${carpeta.nombre}"...` });

        // Create the folder
        const newFolder = await api.createFolder(carpeta.nombre, null);
        const folderId = newFolder._id || newFolder.id;

        // Move each file
        for (const fileName of (carpeta.archivos || [])) {
          const fileDoc = filesByName[fileName];
          if (!fileDoc) { doneCount++; continue; }
          const fileId = fileDoc._id || fileDoc.id;

          setApplyProgress({ done: doneCount, total: totalFiles, current: `Moviendo "${fileName}"...` });
          try {
            await api.moveFile(fileId, folderId);
            movedCount++;
          } catch {
            errorCount++;
          }
          doneCount++;
          setApplyProgress({ done: doneCount, total: totalFiles, current: `Moviendo "${fileName}"...` });
        }
      } catch {
        // Folder creation failed — skip its files
        doneCount += (carpeta.archivos || []).length;
        errorCount += (carpeta.archivos || []).length;
      }
    }

    setApplying(false);
    const msg = errorCount === 0
      ? `✅ ${movedCount} archivos organizados exitosamente`
      : `✅ ${movedCount} movidos · ⚠️ ${errorCount} sin cambios`;
    setToast({ message: msg, type: errorCount === 0 ? 'success' : 'info' });
    onSuccess?.();
    onClose();
  };

  const toggleCheck = (nombre) => {
    setChecked(prev => ({ ...prev, [nombre]: !prev[nombre] }));
  };

  const allChecked = (suggestion?.carpetas || []).every(c => checked[c.nombre]);
  const toggleAll  = () => {
    const next = !allChecked;
    const newChecked = {};
    (suggestion?.carpetas || []).forEach(c => { newChecked[c.nombre] = next; });
    setChecked(newChecked);
  };

  const dupCount = (suggestion?.duplicados || []).reduce((a, d) => a + (d.archivos || []).length, 0);

  return (
    <>
      <div className={styles.backdrop} onClick={!applying ? onClose : undefined} />
      <div className={styles.panel}>

        {/* Header */}
        <div className={styles.panelHeader}>
          <div className={styles.panelTitleWrap}>
            <span className={styles.panelIcon}>🗂️</span>
            <div>
              <h2 className={styles.panelTitle}>Organizador IA</h2>
              <p className={styles.panelSub}>Análisis inteligente de toda tu nube</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={!applying ? onClose : undefined} disabled={applying}>✕</button>
        </div>

        <div className={styles.panelBody}>

          {/* loading */}
          {step === 'loading' && (
            <div className={styles.loadingState}>
              <div className={styles.pulseWrap}>
                <div className={styles.pulseRing} />
                <div className={styles.pulseRing} style={{ animationDelay: '0.5s' }} />
                <div className={styles.pulseRing} style={{ animationDelay: '1s' }} />
                <div className={styles.pulseCore}>🗂️</div>
              </div>
              <p className={styles.thinkingMsg}>{THINKING_MSGS[thinkingIdx]}</p>
              <div className={styles.typingDots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
              <p className={styles.hint}>Analizando {allFiles.length > 0 ? `${allFiles.length} archivos` : 'tu biblioteca'}...</p>
            </div>
          )}

          {/* applying overlay */}
          {applying && (
            <div className={styles.applyingState}>
              <div className={styles.applyIcon}>⚡</div>
              <p className={styles.applyTitle}>Organizando archivos...</p>
              <p className={styles.applyCurrentFile}>{applyProgress.current}</p>
              <div className={styles.applyTrack}>
                <div
                  className={styles.applyFill}
                  style={{ width: applyProgress.total > 0 ? `${(applyProgress.done / applyProgress.total) * 100}%` : '0%' }}
                />
              </div>
              <p className={styles.applyCount}>{applyProgress.done} / {applyProgress.total}</p>
            </div>
          )}

          {/* preview */}
          {step === 'preview' && suggestion && !applying && (
            <>
              {/* Summary */}
              {suggestion.resumen && (
                <div className={styles.summaryBox}>
                  <p className={styles.summaryText}>{suggestion.resumen}</p>
                  <div className={styles.summaryStats}>
                    <span className={styles.statBadge} style={{ background: 'rgba(255,45,149,0.1)', color: '#ff8eb5' }}>
                      📁 {(suggestion.carpetas || []).length} carpetas
                    </span>
                    {dupCount > 0 && (
                      <span className={styles.statBadge} style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>
                        ⚠️ {dupCount} posibles duplicados
                      </span>
                    )}
                    {(suggestion.sinCategoria || []).length > 0 && (
                      <span className={styles.statBadge} style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
                        📄 {(suggestion.sinCategoria || []).length} sin categoría
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Folder suggestions */}
              {(suggestion.carpetas || []).length > 0 && (
                <section className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>📁 Carpetas sugeridas</h3>
                    <button className={styles.toggleAllBtn} onClick={toggleAll}>
                      {allChecked ? 'Deseleccionar todas' : 'Seleccionar todas'}
                    </button>
                  </div>

                  {(suggestion.carpetas || []).map((carpeta, i) => (
                    <div
                      key={i}
                      className={`${styles.folderCard} ${checked[carpeta.nombre] ? styles.folderCardChecked : ''}`}
                      onClick={() => toggleCheck(carpeta.nombre)}
                    >
                      <div className={styles.folderCardTop}>
                        <div className={styles.folderCardLeft}>
                          <div className={`${styles.checkbox} ${checked[carpeta.nombre] ? styles.checkboxChecked : ''}`}>
                            {checked[carpeta.nombre] && <span>✓</span>}
                          </div>
                          <span className={styles.folderCardIcon}>📁</span>
                          <div>
                            <p className={styles.folderCardName}>{carpeta.nombre}</p>
                            <p className={styles.folderCardDesc}>{carpeta.descripcion}</p>
                          </div>
                        </div>
                        <span className={styles.folderFileCount}>{(carpeta.archivos || []).length} archivo{(carpeta.archivos || []).length !== 1 ? 's' : ''}</span>
                      </div>

                      <div className={styles.folderFiles}>
                        {(carpeta.archivos || []).slice(0, 5).map((fname, j) => (
                          <span key={j} className={styles.filePill}>
                            {getFileIcon(fname)} {fname}
                          </span>
                        ))}
                        {(carpeta.archivos || []).length > 5 && (
                          <span className={styles.filePillMore}>+{(carpeta.archivos || []).length - 5} más</span>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Duplicates */}
              {(suggestion.duplicados || []).length > 0 && (
                <section className={styles.section}>
                  <h3 className={`${styles.sectionTitle} ${styles.sectionTitleYellow}`}>⚠️ Posibles duplicados</h3>
                  {(suggestion.duplicados || []).map((dup, i) => (
                    <div key={i} className={styles.dupCard}>
                      <p className={styles.dupDesc}>{dup.descripcion}</p>
                      <div className={styles.folderFiles}>
                        {(dup.archivos || []).map((fname, j) => (
                          <span key={j} className={`${styles.filePill} ${styles.filePillYellow}`}>
                            {getFileIcon(fname)} {fname}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Uncategorized */}
              {(suggestion.sinCategoria || []).length > 0 && (
                <section className={styles.section}>
                  <h3 className={`${styles.sectionTitle} ${styles.sectionTitleGray}`}>📄 Sin categoría</h3>
                  <div className={`${styles.folderCard} ${styles.folderCardGray}`}>
                    <div className={styles.folderFiles}>
                      {(suggestion.sinCategoria || []).map((fname, i) => (
                        <span key={i} className={`${styles.filePill} ${styles.filePillGray}`}>
                          {getFileIcon(fname)} {fname}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* Action buttons */}
              <div className={styles.applyActions}>
                <button className={styles.cancelBtn} onClick={onClose}>Ignorar</button>
                <button
                  className={styles.applySelectionBtn}
                  onClick={() => handleApply(false)}
                  disabled={checkedFolders.length === 0}
                >
                  ✅ Aplicar selección ({checkedFolders.length})
                </button>
                <button className={styles.applyAllBtn} onClick={() => handleApply(true)}>
                  ⚡ Aplicar todo
                </button>
              </div>
            </>
          )}

          {/* error */}
          {step === 'error' && (
            <div className={styles.errorState}>
              <span className={styles.errorIcon}>⚠️</span>
              <p className={styles.errorText}>{error}</p>
              <button className={styles.cancelBtn} onClick={onClose}>Cerrar</button>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
