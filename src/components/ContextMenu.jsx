// src/components/ContextMenu.jsx
import styles from './ContextMenu.module.css';

const AI_SUPPORTED = ['txt', 'pdf', 'docx', 'md'];

function getExt(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

export default function ContextMenu({
  x, y, item, onClose,
  onRename, onDownload, onDelete,
  onTranslate, onAnalyze, onPresent, onOrganize,
}) {
  const isFile = item.type === 'file';
  const ext = getExt(item.name);
  const aiSupported = isFile && AI_SUPPORTED.includes(ext);

  const handle = (fn) => (e) => {
    e.stopPropagation();
    fn();
    onClose();
  };

  // Compute menu height for viewport clamping
  const aiFileItems = aiSupported ? 3 : 0; // translate + analyze + present
  const menuHeight  = isFile
    ? 80 + (aiFileItems * 38) + (aiSupported ? 0 : 24) + 38 + 38 + 38 + 38
    : 160;

  const style = {
    top:  Math.min(y, window.innerHeight - menuHeight - 10),
    left: Math.min(x, window.innerWidth - 240),
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
                <button className={styles.optionAi} onClick={handle(onPresent)}>
                  <span className={styles.optionIcon}>📊</span> Generar presentación
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
        <button className={styles.optionOrganize} onClick={handle(onOrganize)}>
          <span className={styles.optionIcon}>🗂️</span> Organizar con IA
        </button>

        <div className={styles.divider} />
        <button className={styles.optionDanger} onClick={handle(onDelete)}>
          <span className={styles.optionIcon}>🗑️</span> Eliminar
        </button>
      </div>
    </div>
  );
}
