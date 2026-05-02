// src/screens/SettingsScreen.jsx
import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export default function SettingsScreen() {
  const { clearSession } = useContext(AuthContext);

  return (
    <div className="pageHeader">
      <div>
        <h1>Configuración</h1>
        <p>Gestiona tu sesión y vuelve cuando quieras.</p>
      </div>
      <button type="button" className="dangerButton" onClick={clearSession}>
        Cerrar sesión
      </button>
    </div>
  );
}