// src/screens/HomeScreen.jsx
import { useEffect, useState, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import styles from './HomeScreen.module.css';

const TYPE_COLORS = {
  PDFs:       '#ff2d95',
  Imágenes:   '#a855f7',
  Documentos: '#3b82f6',
  Videos:     '#f59e0b',
  Audio:      '#10b981',
  Otros:      '#6b7280',
};

const ACTION_META = {
  upload:        { icon: '⬆️', label: 'Subió' },
  download:      { icon: '⬇️', label: 'Descargó' },
  delete_file:   { icon: '🗑️', label: 'Eliminó' },
  move:          { icon: '📦', label: 'Movió' },
  create_folder: { icon: '📁', label: 'Creó carpeta' },
  delete_folder: { icon: '🗑️', label: 'Eliminó carpeta' },
  rename:        { icon: '✏️', label: 'Renombró' },
  translate:     { icon: '🌐', label: 'Tradujo' },
  analyze:       { icon: '⚖️', label: 'Analizó' },
  present:       { icon: '📊', label: 'Presentó' },
  organize:      { icon: '🗂️', label: 'Organizó' },
};

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

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return 'hace un momento';
  const m = Math.floor(s / 60);
  if (m < 60)  return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

export default function HomeScreen() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [stats,    setStats]    = useState({ files: 0, folders: 0 });
  const [storage,  setStorage]  = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [recentFiles, setRecentFiles] = useState([]);
  const [activity,  setActivity]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [clearingActivity, setClearingActivity] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, storageRes, breakdownRes, recentRes, activityRes] = await Promise.allSettled([
        api.getDashboardStats(),
        api.getStorageStats(),
        api.getTypeBreakdown(),
        api.getRecentFiles(),
        api.getRecentActivity(),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (storageRes.status === 'fulfilled') setStorage(storageRes.value);
      if (breakdownRes.status === 'fulfilled') setBreakdown(breakdownRes.value || []);
      if (recentRes.status === 'fulfilled') setRecentFiles((recentRes.value || []).slice(0, 5));
      if (activityRes.status === 'fulfilled') setActivity(activityRes.value || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const storagePct = storage
    ? Math.min(100, Math.round((storage.used / storage.limit) * 100))
    : 0;

  const displayName = user?.name || user?.email || 'Usuario';

  const runSearch = () => {
    const q = search.trim();
    navigate('/files', { state: { initialSearch: q } });
  };

  const handleClearActivity = async () => {
    if (!confirm('¿Borrar todo el historial de actividad?')) return;
    setClearingActivity(true);
    try {
      await api.clearActivity();
      setActivity([]);
    } catch { /* non-critical */ }
    finally { setClearingActivity(false); }
  };

  const handleDeleteActivity = async (id) => {
    try {
      await api.deleteActivity(id);
      setActivity(prev => prev.filter(a => a._id !== id));
    } catch { /* non-critical */ }
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Bienvenido, {displayName} 👋</h1>
          <p>Tu nube privada con IA integrada — aquí tienes un resumen de tu actividad.</p>
        </div>
        <button className={styles.refreshBtn} onClick={loadAll}>↻ Actualizar</button>
      </div>

      {/* Search */}
      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Buscar en toda tu UltraNube..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch()}
        />
        <button className={styles.searchBtn} onClick={runSearch}>🔍 Buscar</button>
      </div>

      {/* Stats row */}
      <div className={styles.topGrid}>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>📄</span>
          <div>
            <p className={styles.statLabel}>Archivos</p>
            <p className={styles.statValue}>{loading ? '—' : stats.files}</p>
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statIcon}>📁</span>
          <div>
            <p className={styles.statLabel}>Carpetas</p>
            <p className={styles.statValue}>{loading ? '—' : stats.folders}</p>
          </div>
        </div>
        <div className={styles.statCard} style={{ gridColumn: 'span 2' }}>
          <span className={styles.statIcon}>💾</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className={styles.statLabel}>Almacenamiento</p>
            <div className={styles.storageRow}>
              <p className={styles.storageUsed}>{storage ? formatBytes(storage.used) : '—'}</p>
              <span className={styles.storageLimit}>/ {storage ? `${storage.limitGB} GB` : '2 GB'}</span>
            </div>
            <div className={styles.storageTrack} style={{ margin: '8px 0 4px' }}>
              <div className={styles.storageFill} style={{ width: `${storagePct}%` }} />
            </div>
            <p className={styles.storagePercent}>{storagePct}% usado</p>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className={styles.mainGrid}>
        {/* Type breakdown donut */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>📊 Tipos de archivo</h3>
          {loading ? (
            <div className={styles.emptyChart}>Cargando...</div>
          ) : breakdown.length === 0 ? (
            <div className={styles.emptyChart}>No hay archivos todavía</div>
          ) : (
            <div className={styles.chartWrap}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={breakdown}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={66}
                    strokeWidth={0}
                  >
                    {breakdown.map(entry => (
                      <Cell
                        key={entry.name}
                        fill={TYPE_COLORS[entry.name] || '#6b7280'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(18,18,40,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10,
                      color: '#f0f0ff',
                      fontSize: '0.82rem',
                    }}
                    formatter={(val, name) => [`${val} archivos`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.legendList}>
                {breakdown.map(entry => (
                  <div key={entry.name} className={styles.legendItem}>
                    <span
                      className={styles.legendDot}
                      style={{ background: TYPE_COLORS[entry.name] || '#6b7280' }}
                    />
                    <span>{entry.name}</span>
                    <span className={styles.legendCount}>{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activity timeline */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>⚡ Actividad reciente</h3>
            {activity.length > 0 && (
              <button
                className={styles.clearBtn}
                onClick={handleClearActivity}
                disabled={clearingActivity}
                title="Borrar todo el historial"
              >
                🗑️ Limpiar
              </button>
            )}
          </div>
          {loading ? (
            <div className={styles.emptyTimeline}>Cargando...</div>
          ) : activity.length === 0 ? (
            <div className={styles.emptyTimeline}>Sin actividad reciente</div>
          ) : (
            <div className={styles.timeline}>
              {activity.map((item) => {
                const meta = ACTION_META[item.action] || { icon: '📌', label: item.action };
                return (
                  <div key={item._id} className={styles.timelineItem}>
                    <div className={styles.timelineIcon}>{meta.icon}</div>
                    <div className={styles.timelineContent}>
                      <p className={styles.timelineLabel}>{item.label}</p>
                      <p className={styles.timelineAction}>{meta.label}</p>
                    </div>
                    <span className={styles.timelineTime}>{relativeTime(item.createdAt)}</span>
                    <button
                      className={styles.deleteItemBtn}
                      onClick={() => handleDeleteActivity(item._id)}
                      title="Eliminar este registro"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent files */}
      {!loading && recentFiles.length > 0 && (
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>🕐 Archivos recientes</h3>
          <div className={styles.recentList}>
            {recentFiles.map((file, i) => (
              <div
                key={i}
                className={styles.recentItem}
                onClick={() => navigate('/files')}
              >
                <span className={styles.recentIcon}>{getFileIcon(file.originalName || file.name)}</span>
                <p className={styles.recentName}>{file.originalName || file.name}</p>
                <span className={styles.recentDate}>{relativeTime(file.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
