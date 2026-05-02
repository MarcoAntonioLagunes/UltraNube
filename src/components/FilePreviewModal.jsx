// src/components/FilePreviewModal.jsx
import { useEffect, useState } from 'react';
import styles from './FilePreviewModal.module.css';
import api from '../services/api';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
const TEXT_EXTS  = ['txt', 'md', 'csv'];
const PDF_EXTS   = ['pdf'];

function getExt(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

function getPreviewType(name) {
  const ext = getExt(name);
  if (PDF_EXTS.includes(ext))   return 'pdf';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (TEXT_EXTS.includes(ext))  return 'text';
  return 'unsupported';
}

export default function FilePreviewModal({ file, onClose, onDownload }) {
  const [status, setStatus]       = useState('loading'); // loading | ready | error
  const [objectUrl, setObjectUrl] = useState(null);
  const [textContent, setTextContent] = useState('');
  const [errorMsg, setErrorMsg]   = useState('');

  const previewType = getPreviewType(file.name);

  // Escape key closes the modal
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fetch file content
  useEffect(() => {
    if (previewType === 'unsupported') {
      setStatus('ready');
      return;
    }

    let blobUrl = null;

    (async () => {
      try {
        const blob = await api.getFileBlob(file.id);

        if (previewType === 'text') {
          setTextContent(await blob.text());
        } else {
          blobUrl = URL.createObjectURL(blob);
          setObjectUrl(blobUrl);
        }
        setStatus('ready');
      } catch (e) {
        setErrorMsg(e.message || 'No se pudo cargar el archivo');
        setStatus('error');
      }
    })();

    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [file.id, previewType]);

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <span className={styles.fileName} title={file.name}>{file.name}</span>
          <div className={styles.headerActions}>
            <button className={styles.downloadBtn} onClick={onDownload}>
              <span>⬇</span> Descargar
            </button>
            <button className={styles.closeBtn} onClick={onClose} title="Cerrar (Esc)">✕</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className={styles.body}>
          {status === 'loading' && (
            <div className={styles.center}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>Cargando vista previa…</p>
            </div>
          )}

          {status === 'error' && (
            <div className={styles.center}>
              <p className={styles.errorText}>⚠️ {errorMsg}</p>
            </div>
          )}

          {status === 'ready' && previewType === 'pdf' && (
            <iframe
              src={objectUrl}
              className={styles.pdfFrame}
              title={file.name}
            />
          )}

          {status === 'ready' && previewType === 'image' && (
            <div className={styles.imageWrap}>
              <img src={objectUrl} alt={file.name} className={styles.previewImage} />
            </div>
          )}

          {status === 'ready' && previewType === 'text' && (
            <pre className={styles.textContent}>{textContent}</pre>
          )}

          {status === 'ready' && previewType === 'unsupported' && (
            <div className={styles.center}>
              <div className={styles.unsupportedIcon}>🔍</div>
              <p className={styles.unsupportedTitle}>Vista previa no disponible</p>
              <p className={styles.unsupportedHint}>
                Este tipo de archivo no se puede previsualizar directamente.<br />
                Descárgalo para abrirlo con la aplicación correspondiente.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
