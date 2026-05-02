// src/screens/LoginScreen.jsx
import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// Validación de correo
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErrorMsg('');

    const trimmedEmail = (email || '').trim();

    if (!trimmedEmail || !password) {
      return setErrorMsg('Ingresa correo y contraseña');
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return setErrorMsg('Ingresa un correo electrónico válido');
    }

    try {
      setLoading(true);
      const result = await login(trimmedEmail.toLowerCase(), password);
      setLoading(false);

      if (!result || !result.ok) {
        setErrorMsg(result?.message || 'Error en login');
      }
    } catch (e) {
      setLoading(false);
      setErrorMsg('Error en login');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authHeader">
          <h1>UltraNube</h1>
          <p>Ingresa para continuar con tu espacio seguro en la nube.</p>
        </div>

        {errorMsg ? (
          <div className="panelCard" style={{ borderColor: 'rgba(255, 75, 110, 0.28)', backgroundColor: 'rgba(255, 75, 110, 0.12)', color: '#ffb8c9' }}>
            {errorMsg}
          </div>
        ) : null}

        <div className="authForm">
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={handleKeyPress}
            className="formField"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            className="formField"
          />
          <button type="button" className="primaryButton" onClick={onSubmit} disabled={loading}>
            {loading ? 'Cargando...' : 'Iniciar Sesión'}
          </button>
        </div>

        <div className="authFooter">
          <p>¿No tienes cuenta?</p>
          <button type="button" className="secondaryButton" onClick={() => navigate('/register')}>
            Crear Cuenta
          </button>
        </div>
      </div>
    </div>
  );
}