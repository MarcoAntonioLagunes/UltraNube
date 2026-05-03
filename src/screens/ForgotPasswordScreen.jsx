import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null); // null | 'loading' | 'sent' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setStatus('loading');
    try {
      await api.forgotPassword(trimmed);
      setStatus('sent');
    } catch (e) {
      setErrorMsg(e.message || 'Error al enviar el correo');
      setStatus('error');
    }
  };

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authHeader">
          <h1>UltraNube</h1>
          <p>Recuperar contraseña</p>
        </div>

        {status === 'sent' ? (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📬</div>
            <p style={{ color: 'var(--text-soft)', margin: '0 0 20px' }}>
              Si ese correo está registrado, recibirás un enlace en minutos.
            </p>
            <button type="button" className="secondaryButton" onClick={() => navigate('/login')}>
              Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', marginTop: 0, marginBottom: 20, fontSize: '0.95rem' }}>
              Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
            </p>

            {status === 'error' && (
              <div className="panelCard" style={{ borderColor: 'rgba(255,75,110,0.28)', backgroundColor: 'rgba(255,75,110,0.12)', color: '#ffb8c9', marginBottom: 16 }}>
                {errorMsg}
              </div>
            )}

            <div className="authForm">
              <input
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="formField"
              />
              <button
                type="button"
                className="primaryButton"
                onClick={handleSubmit}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? 'Enviando...' : 'Enviar enlace'}
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
