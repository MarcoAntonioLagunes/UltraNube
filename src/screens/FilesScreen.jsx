// src/screens/FilesScreen.jsx
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { DriveContext } from '../context/DriveContext';
import styles from './FilesScreen.module.css';
import api from '../services/api';
import { getStarredItems, toggleStarItem } from '../utils/starred';
import ContextMenu from '../components/ContextMenu';
import TranslatorAgent from '../components/agents/TranslatorAgent';
import LawyerAgent from '../components/agents/LawyerAgent';
import CopilotAgent from '../components/agents/CopilotAgent';
import FilePreviewModal from '../components/FilePreviewModal';

const ANALYZABLE_EXTS = ['txt', 'pdf', 'docx', 'md'];

function getExt(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

function normalizeItem(item, type) {
  return {
    ...item,
    type,
    id: item._id || item.id,
    name: type === 'file' ? item.originalName || item.name : item.name,
  };
}

function getFileTypeLabel(name) {
  const extension = String(name || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(extension)) return 'Imagen';
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'ppt', 'pptx', 'xls', 'xlsx'].includes(extension)) return 'Documento';
  if (['mp4', 'mov', 'wmv', 'avi', 'mkv'].includes(extension)) return 'Video';
  if (['mp3', 'wav', 'flac'].includes(extension)) return 'Audio';
  if (['zip', 'rar', '7z'].includes(extension)) return 'Comprimido';
  return extension ? extension.toUpperCase() : 'Archivo';
}

function getItemIcon(item) {
  if (item.type === 'folder') return '📁';
  const extension = String(item.name || '').split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄', doc: '📄', docx: '📄', txt: '📄', md: '📄',
    xls: '📊', xlsx: '📊', ppt: '📈', pptx: '📈',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
    mp4: '🎬', mov: '🎬', mp3: '🎵',
    zip: '🗜️', rar: '🗜️',
  };
  return icons[extension] || '📄';
}

export default function FilesScreen() {
  const { token } = useContext(AuthContext);
  const { currentFolderId, setCurrentFolderId, breadcrumbs, setBreadcrumbs } = useContext(DriveContext);
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(location.state?.initialSearch || '');
  const [uploading, setUploading] = useState(false);
  const [folderChildren, setFolderChildren] = useState({});
  const [expandedFolders, setExpandedFolders] = useState({});
  const [treeLoading, setTreeLoading] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalInput, setModalInput] = useState('');
  const [starredIds, setStarredIds] = useState(new Set(getStarredItems().map((item) => item.id)));

  // ── Agent state ──────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState(null); // { x, y, item }
  const [translatorFile, setTranslatorFile] = useState(null);
  const [lawyerFile, setLawyerFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);

  // Close context menu when Escape is pressed
  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  const handleContextMenu = useCallback((e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  // ── Drive operations ─────────────────────────────────────────────────────
  const loadItems = async (folderId = null) => {
    try {
      setLoading(true);
      const data = await api.listDrive(folderId);
      const normalized = [
        ...(data.folders || []).map((folder) => normalizeItem(folder, 'folder')),
        ...(data.files || []).map((file) => normalizeItem(file, 'file')),
      ];
      setItems(normalized);
      setCurrentFolderId(folderId);
      setBreadcrumbs([
        { id: null, name: 'Inicio' },
        ...(data.breadcrumbs || []).map((crumb) => ({ id: crumb._id || crumb.id, name: crumb.name })),
      ]);
    } catch {
      alert('Error al cargar archivos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems(currentFolderId);
  }, [currentFolderId, token]);

  const runGlobalSearch = async () => {
    const query = search.trim();
    if (!query) { handleGoHome(); return; }
    try {
      setLoading(true);
      const data = await api.searchItems(query);
      const normalized = [
        ...(data.folders || []).map((folder) => normalizeItem(folder, 'folder')),
        ...(data.files || []).map((file) => normalizeItem(file, 'file')),
      ];
      setItems(normalized);
      setCurrentFolderId(null);
      setBreadcrumbs([{ id: null, name: `Resultados: "${query}"` }]);
    } catch {
      alert('Error al buscar en UltraNube.');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = async (folder) => { await loadItems(folder.id); };
  const handleGoHome = async () => { setSearch(''); await loadItems(null); };
  const handleRefresh = async () => {
    if (breadcrumbs.length === 1 && breadcrumbs[0].name.startsWith('Resultados:')) {
      await runGlobalSearch(); return;
    }
    await loadItems(currentFolderId);
  };
  const handleGoBack = async () => {
    if (breadcrumbs.length <= 1) return;
    if (breadcrumbs[0].name.startsWith('Resultados:')) { await handleGoHome(); return; }
    const previous = breadcrumbs[breadcrumbs.length - 2];
    await loadItems(previous?.id || null);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      setUploading(true);
      await api.uploadFileAsync(file, currentFolderId);
      await loadItems(currentFolderId);
    } catch (err) {
      alert(err?.message || 'Error al subir archivo');
    } finally {
      setUploading(false);
    }
  };

  const loadFolderChildren = async (folderId) => {
    if (folderChildren[folderId]) return;
    try {
      setTreeLoading((prev) => ({ ...prev, [folderId]: true }));
      const data = await api.listDrive(folderId);
      setFolderChildren((prev) => ({
        ...prev,
        [folderId]: {
          folders: (data.folders || []).map((folder) => normalizeItem(folder, 'folder')),
          files: (data.files || []).map((file) => normalizeItem(file, 'file')),
        },
      }));
    } catch {
      // tree load failure is non-critical
    } finally {
      setTreeLoading((prev) => ({ ...prev, [folderId]: false }));
    }
  };

  const toggleFolderExpand = async (folder) => {
    const folderId = folder.id;
    const willExpand = !expandedFolders[folderId];
    setExpandedFolders((prev) => ({ ...prev, [folderId]: willExpand }));
    if (willExpand) await loadFolderChildren(folderId);
  };

  const renderTree = (nodes, level = 0) => nodes.map((item) => {
    const expanded = !!expandedFolders[item.id];
    const children = folderChildren[item.id];
    return (
      <div key={item.id} className={styles.treeItem} style={{ marginLeft: level * 18 }}>
        <div className={styles.treeItemRow}>
          <button type="button" className={styles.treeToggle} onClick={() => toggleFolderExpand(item)}>
            {expanded ? '▼' : '▶'}
          </button>
          <button type="button" className={styles.treeItemButton} onClick={() => handleFolderClick(item)}>
            <span className={styles.treeItemIcon}>📁</span>
            <span>{item.name}</span>
          </button>
        </div>
        {expanded && (
          <div className={styles.treeItemChildren}>
            {treeLoading[item.id] ? (
              <div className={styles.treeLoading}>Cargando...</div>
            ) : children?.folders?.length ? (
              renderTree(children.folders, level + 1)
            ) : (
              <div className={styles.emptyState}>Sin subcarpetas</div>
            )}
          </div>
        )}
      </div>
    );
  });

  const openCreateModal = () => { setModalType('create'); setModalInput(''); setModalVisible(true); };
  const openRenameModal = (item) => { setModalType('rename'); setSelectedItem(item); setModalInput(item.name); setModalVisible(true); };
  const closeModal = () => { setModalVisible(false); setModalType(''); setSelectedItem(null); setModalInput(''); };

  const handleModalSubmit = async () => {
    const trimmedInput = modalInput.trim();
    if (!trimmedInput) return;
    try {
      if (modalType === 'create') {
        await api.createFolder(trimmedInput, currentFolderId);
      } else if (modalType === 'rename') {
        if (selectedItem.type === 'folder') await api.renameFolder(selectedItem.id, trimmedInput);
        else await api.renameFile(selectedItem.id, trimmedInput);
      }
      await loadItems(currentFolderId);
      closeModal();
    } catch (err) {
      alert(err?.message || `Error al ${modalType === 'create' ? 'crear' : 'renombrar'}`);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(`¿Seguro que quieres eliminar "${item.name}"?`)) return;
    try {
      if (item.type === 'folder') await api.deleteFolder(item.id);
      else await api.deleteFile(item.id);
      await loadItems(currentFolderId);
    } catch (err) {
      alert(err?.message || 'Error al eliminar.');
    }
  };

  const handleDownload = async (file) => {
    try { await api.downloadFile(file.id, file.name); }
    catch { alert('Error al descargar archivo.'); }
  };

  const toggleItemStar = (item) => {
    const next = toggleStarItem(item);
    setStarredIds(new Set(next.map((star) => star.id)));
  };

  const isItemStarred = (item) => starredIds.has(`${item.id}-${item.type}`);

  const filteredItems = useMemo(
    () => items.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) || breadcrumbs[0]?.name?.startsWith('Resultados:')
    ),
    [items, search, breadcrumbs]
  );

  const currentFolderName = breadcrumbs[breadcrumbs.length - 1]?.name || 'Mi Drive';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h1>Archivos</h1>
          <p>
            Navegando en: {breadcrumbs.map((crumb, index) => `${crumb.name}${index < breadcrumbs.length - 1 ? ' / ' : ''}`)}
          </p>
        </div>
        <div className={styles.actionButtons}>
          <button onClick={handleGoBack} className={styles.secondaryButton} disabled={breadcrumbs.length <= 1}>
            Regresar
          </button>
          <button onClick={handleGoHome} className={styles.secondaryButton}>Inicio</button>
          <button onClick={handleRefresh} className={styles.primaryButton}>Recargar</button>
        </div>
      </div>

      {/* ── Copiloto IA ── */}
      <CopilotAgent items={items} currentFolderName={currentFolderName} />

      <div className={styles.searchRow}>
        <input
          type="text"
          placeholder="Buscar archivos y carpetas"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runGlobalSearch(); }}
          className={styles.folderInput}
        />
        <button onClick={runGlobalSearch} className={styles.primaryButton}>Buscar</button>
        <button onClick={handleGoHome} className={styles.secondaryButton}>Limpiar</button>
      </div>

      <div className={styles.actionsRow}>
        <label className={styles.uploadButton}>
          <span>{uploading ? 'Subiendo...' : 'Subir archivo'}</span>
          <input type="file" onChange={handleFileUpload} disabled={uploading} />
        </label>
        <button onClick={openCreateModal} className={styles.primaryButton}>Crear carpeta</button>
      </div>

      {loading ? (
        <div className={styles.messageBox}>Cargando...</div>
      ) : (
        <div className={styles.filesBody}>
          <aside className={styles.treePanel}>
            <div className={styles.treeHeader}>
              <h2>Explorador</h2>
              <p>Jerarquía de carpetas con navegación rápida.</p>
            </div>
            <div className={styles.treeList}>
              {items.filter((item) => item.type === 'folder').length === 0 ? (
                <div className={styles.emptyState}>No hay carpetas para explorar aquí.</div>
              ) : (
                renderTree(items.filter((item) => item.type === 'folder'))
              )}
            </div>
          </aside>

          <main className={styles.mainPanel}>
            {filteredItems.length === 0 ? (
              <div className={styles.messageBox}>No hay archivos ni carpetas aquí.</div>
            ) : (
              <div className={styles.itemGrid}>
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={styles.itemCard}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                    onDoubleClick={(e) => {
                      if (item.type !== 'file') return;
                      if (e.target.closest('button')) return;
                      setPreviewFile(item);
                    }}
                  >
                    {/* Always-visible top section */}
                    <div className={styles.itemTop}>
                      <div className={styles.itemMain}>
                        <span className={styles.itemIcon}>{getItemIcon(item)}</span>
                        <div className={styles.itemInfo}>
                          {item.type === 'folder' ? (
                            <button onClick={() => handleFolderClick(item)} className={styles.itemNameButton}>{item.name}</button>
                          ) : (
                            <span className={styles.itemName}>{item.name}</span>
                          )}
                          <span className={styles.itemBadge}>{item.type === 'folder' ? 'Carpeta' : getFileTypeLabel(item.name)}</span>
                        </div>
                      </div>
                      <div className={styles.itemTopRight}>
                        <button type="button" onClick={() => toggleItemStar(item)} className={styles.starButton}>
                          {isItemStarred(item) ? '★' : '☆'}
                        </button>
                      </div>
                    </div>

                    {/* Action bar — appears on hover */}
                    <div className={styles.itemActions}>
                      <button onClick={() => openRenameModal(item)} className={styles.actionBtn}>Renombrar</button>
                      {item.type === 'file' && (
                        <button onClick={() => handleDownload(item)} className={styles.actionBtn}>Descargar</button>
                      )}
                      {item.type === 'file' && ANALYZABLE_EXTS.includes(getExt(item.name)) && (
                        <button onClick={() => setLawyerFile(item)} className={styles.actionBtnAi}>Analizar</button>
                      )}
                      <button onClick={() => handleDelete(item)} className={styles.actionBtnDanger}>Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── Modals ── */}
      {modalVisible && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <h2>{modalType === 'create' ? 'Crear nueva carpeta' : 'Renombrar'}</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleModalSubmit(); }}>
              <input
                type="text"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                placeholder={modalType === 'create' ? 'Nombre de la carpeta' : 'Nuevo nombre'}
                className={styles.modalInput}
                autoFocus
              />
              <div className={styles.modalActions}>
                <button type="button" onClick={closeModal} className={styles.secondaryButton}>Cancelar</button>
                <button type="submit" className={styles.primaryButton}>{modalType === 'create' ? 'Crear' : 'Renombrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Context menu (click derecho) ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onRename={() => openRenameModal(contextMenu.item)}
          onDownload={() => handleDownload(contextMenu.item)}
          onDelete={() => handleDelete(contextMenu.item)}
          onTranslate={() => setTranslatorFile(contextMenu.item)}
          onAnalyze={() => setLawyerFile(contextMenu.item)}
        />
      )}

      {/* ── Agente 1: Traductor ── */}
      {translatorFile && (
        <TranslatorAgent
          file={translatorFile}
          folderId={currentFolderId}
          onClose={() => setTranslatorFile(null)}
          onSuccess={() => loadItems(currentFolderId)}
        />
      )}

      {/* ── Agente 2: Abogado ── */}
      {lawyerFile && (
        <LawyerAgent
          file={lawyerFile}
          onClose={() => setLawyerFile(null)}
        />
      )}

      {/* ── Vista previa (doble clic) ── */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={() => handleDownload(previewFile)}
        />
      )}
    </div>
  );
}
