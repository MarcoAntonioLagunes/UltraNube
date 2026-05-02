// src/screens/StarredScreen.jsx
import { useState, useEffect } from 'react';
import { getStarredItems, toggleStarItem } from '../utils/starred';
import styles from './StarredScreen.module.css';

function getIcon(item) {
  if (item.type === 'folder') return '📁';
  const ext = item.extension || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return '📄';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📈';
  if (['mp4', 'mov', 'avi'].includes(ext)) return '🎬';
  if (['mp3', 'wav'].includes(ext)) return '🎵';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  return '📄';
}

export default function StarredScreen() {
  const [starred, setStarred] = useState([]);

  useEffect(() => {
    setStarred(getStarredItems());
  }, []);

  const handleUnstar = (item) => {
    const next = toggleStarItem({ id: item.itemId, type: item.type, name: item.name });
    setStarred(next);
  };

  const folders = starred.filter((i) => i.type === 'folder');
  const files = starred.filter((i) => i.type === 'file');

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Destacados</h1>
          <p>
            {starred.length === 0
              ? 'No tienes archivos destacados aún.'
              : `${starred.length} elemento${starred.length !== 1 ? 's' : ''} guardado${starred.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {starred.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>☆</span>
          <h2>Sin favoritos todavía</h2>
          <p>Abre la sección de Archivos y presiona la estrella ☆ junto a cualquier archivo o carpeta para guardarlo aquí.</p>
        </div>
      ) : (
        <div className={styles.sections}>
          {folders.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Carpetas</h2>
              <div className={styles.grid}>
                {folders.map((item) => (
                  <StarredCard key={item.id} item={item} onUnstar={handleUnstar} />
                ))}
              </div>
            </section>
          )}

          {files.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Archivos</h2>
              <div className={styles.grid}>
                {files.map((item) => (
                  <StarredCard key={item.id} item={item} onUnstar={handleUnstar} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function StarredCard({ item, onUnstar }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardIcon}>{getIcon(item)}</div>
      <div className={styles.cardInfo}>
        <span className={styles.cardName}>{item.name}</span>
        <span className={styles.cardMeta}>
          {item.type === 'folder' ? 'Carpeta' : item.extension?.toUpperCase() || 'Archivo'}
          {' · '}
          {new Date(item.addedAt).toLocaleDateString()}
        </span>
      </div>
      <button
        type="button"
        className={styles.unstarButton}
        onClick={() => onUnstar(item)}
        title="Quitar de destacados"
      >
        ★
      </button>
    </div>
  );
}
