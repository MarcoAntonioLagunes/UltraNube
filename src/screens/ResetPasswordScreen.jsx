import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

export default function ResetPasswordScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [status, setStatus] = useState(null); // null | 'loading' | 'ok' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!newPw || !confirmPw) { setErrorMsg('Completa todos los campos'); return; }
    if (newPw !== confirmPw) { setErrorMsg('Las contraseñas no coinciden'); return; }
    if (newPw.length < 8) { setErrorMsg('Mínimo 8 caracteres con letras y números'); return; }
    if (!token) { setErrorMsg('Token inválido o expirado'); return; }

    setStatus('loading');
    try {
      await api.resetPassword(token, newPw);
      setStatus('ok');
      setTimeout(() => navigate('/login'), 2500);
    } catch (e) {
      setErrorMsg(e.message || 'Error al restablecer la contraseña');
      setStatus('error');
    }
  };

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authHeader">
          <h1>UltraNube</h1>
          <p>Nueva contraseña</p>
        </div>

        {status === 'ok' ? (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
            <p style={{ color: 'var(--text-soft)', margin: 0 }}>
              ¡Contraseña actualizada! Redirigiendo al inicio de sesión...
            </p>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: 20, fontSize: '0.95rem' }}>
              Ingresa tu nueva contraseña. Mínimo 8 caracteres con letras y números.
            </p>

            {errorMsg && (
              <div className="panelCard" style={{ borderColor: 'rgba(255,75,110,0.28)', backgroundColor: 'rgba(255,75,110,0.12)', color: '#ffb8c9', marginBottom: 16 }}>
                {errorMsg}
              </div>
            )}

            <div className="authForm">
              <input
                type="password"
                placeholder="Nueva contraseña"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="formField"
              />
              <input
                type="password"
                placeholder="Confirmar nueva contraseña"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="formField"
              />
              <button
                type="button"
                className="primaryButton"
                onClick={handleSubmit}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? 'Guardando...' : 'Restablecer contraseña'}
              </button>
            </div>

            <div className="authFooter">
              <button type="button" className="ghostButton" onClick={() => navigate('/login')}>
                ← Volver al inicio de sesión
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
