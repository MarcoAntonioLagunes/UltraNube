// src/screens/RegisterScreen.jsx
import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// Validaciones
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export default function RegisterScreen() {
  const { register } = useContext(AuthContext);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErrorMsg('');

    const trimmedName = (name || '').trim();
    const trimmedEmail = (email || '').trim();

    if (!trimmedName || !trimmedEmail || !password || !confirm) {
      return setErrorMsg('Todos los campos son obligatorios');
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return setErrorMsg('Ingresa un correo electrónico válido');
    }

    if (password !== confirm) {
      return setErrorMsg('Las contraseñas no coinciden');
    }

    if (!PASSWORD_REGEX.test(password)) {
      return setErrorMsg(
        'La contraseña debe tener mínimo 8 caracteres e incluir letras y números'
      );
    }

    try {
      setLoading(true);
      const result = await register(trimmedName, trimmedEmail.toLowerCase(), password);
      setLoading(false);

      if (!result || !result.ok) {
        setErrorMsg(result?.message || 'Error al registrar');
      }
    } catch (e) {
      setLoading(false);
      setErrorMsg('Error al registrar');
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
          <p>Crea tu cuenta y comienza a usar tu espacio seguro en la nube.</p>
        </div>

        {errorMsg ? (
          <div className="panelCard" style={{ borderColor: 'rgba(255, 75, 110, 0.28)', backgroundColor: 'rgba(255, 75, 110, 0.12)', color: '#ffb8c9' }}>
            {errorMsg}
          </div>
        ) : null}

        <div className="authForm">
          <input
            type="text"
            placeholder="Nombre completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={handleKeyPress}
            className="formField"
          />
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
            placeholder="Contraseña (mín 8 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={handleKeyPress}
            className="formField"
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyPress={handleKeyPress}
            className="formField"
          />
          <button type="button" className="primaryButton" onClick={onSubmit} disabled={loading}>
            {loading ? 'Cargando...' : 'Crear Cuenta'}
          </button>
        </div>

        <div className="authFooter">
          <p>¿Ya tienes cuenta?</p>
          <button type="button" className="secondaryButton" onClick={() => navigate('/login')}>
            Iniciar Sesión
          </button>
        </div>
      </div>
    </div>
  );
}