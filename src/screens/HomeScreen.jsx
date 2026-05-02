// src/screens/HomeScreen.jsx
import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { API_URL } from '../config/api';

export default function HomeScreen() {
  const { user, token } = useContext(AuthContext);
  const navigate = useNavigate();
  const [stats, setStats] = useState({ files: 0, folders: 0 });
  const [search, setSearch] = useState('');

  const fetchStats = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setStats({ files: data.files || 0, folders: data.folders || 0 });
    } catch {
      // stats are non-critical, fail silently
    }
  };

  useEffect(() => {
    fetchStats();
  }, [token]);

  const runGlobalSearchFromHome = () => {
    const q = (search || '').trim();
    navigate('/files', { state: { initialSearch: q } });
  };

  const displayName = user?.name || user?.email || 'Usuario';

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Bienvenido, {displayName}</h1>
          <p>Tu nube privada UltraNube con diseño IA, controles más claros y una experiencia web superior.</p>
        </div>
        <button type="button" className="primaryButton" onClick={fetchStats}>
          Actualizar
        </button>
      </div>

      <div className="panelCard">
        <div className="searchBarRow">
          <input
            type="text"
            placeholder="Buscar en toda tu UltraNube"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && runGlobalSearchFromHome()}
            className="formField"
          />
          <button type="button" className="primaryButton" onClick={runGlobalSearchFromHome}>
            Buscar
          </button>
        </div>

        <div className="sectionGrid" style={{ marginTop: '20px' }}>
          <div className="statusCard">
            <h3>Archivos</h3>
            <p style={{ fontSize: '2.6rem', margin: '12px 0 0', color: 'var(--accent)' }}>{stats.files}</p>
          </div>
          <div className="statusCard">
            <h3>Carpetas</h3>
            <p style={{ fontSize: '2.6rem', margin: '12px 0 0', color: 'var(--accent)' }}>{stats.folders}</p>
          </div>
        </div>
      </div>

      <div className="sectionGrid">
        <div className="panelCard gradientCard">
          <h3>Visión rápida</h3>
          <p>Usa el asistente IA para buscar entre tus archivos, guardar conversaciones y adjuntar fotos o documentos.</p>
        </div>
        <div className="panelCard">
          <h3>Diseño profesional</h3>
          <p>La interfaz ahora es más ordenada, todo se ajusta al tamaño y los botones ya no están apilados en pantallas grandes.</p>
        </div>
      </div>
    </div>
  );
}
