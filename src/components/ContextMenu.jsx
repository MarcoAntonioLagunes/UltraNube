// src/components/ContextMenu.jsx
import styles from './ContextMenu.module.css';

const AI_SUPPORTED = ['txt', 'pdf', 'docx', 'md'];

function getExt(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

export default function ContextMenu({
  x, y, item, onClose,
  onRename, onDownload, onDelete, onTranslate, onAnalyze,
}) {
  const isFile = item.type === 'file';
  const ext = getExt(item.name);
  const aiSupported = isFile && AI_SUPPORTED.includes(ext);

  const handle = (fn) => (e) => {
    e.stopPropagation();
    fn();
    onClose();
  };

  // Keep the menu inside the viewport
  const menuHeight = isFile ? (aiSupported ? 310 : 160) : 120;
  const style = {
    top: Math.min(y, window.innerHeight - menuHeight - 10),
    left: Math.min(x, window.innerWidth - 230),
  };

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.menu} style={style} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.itemName} title={item.name}>{item.name}</div>
        <div className={styles.divider} />

        <button className={styles.option} onClick={handle(onRename)}>
          <span className={styles.optionIcon}>✏️</span> Renombrar
        </button>

        {isFile && (
          <button className={styles.option} onClick={handle(onDownload)}>
            <span className={styles.optionIcon}>⬇️</span> Descargar
          </button>
        )}

        {isFile && (
          <>
            <div className={styles.divider} />
            <div className={styles.groupLabel}>Agentes IA</div>

            {aiSupported ? (
              <>
                <button className={styles.optionAi} onClick={handle(onTranslate)}>
                  <span className={styles.optionIcon}>🌐</span> Traducir con IA
                </button>
                <button className={styles.optionAi} onClick={handle(onAnalyze)}>
                  <span className={styles.optionIcon}>⚖️</span> Analizar con Abogado IA
                </button>
              </>
            ) : (
              <div className={styles.aiUnsupported}>
                Solo disponible para .txt, .pdf, .docx, .md
              </div>
            )}
          </>
        )}

        <div className={styles.divider} />
        <button className={styles.optionDanger} onClick={handle(onDelete)}>
          <span className={styles.optionIcon}>🗑️</span> Eliminar
        </button>
      </div>
    </div>
  );
}
