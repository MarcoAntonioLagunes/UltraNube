// src/context/AuthContext.js
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../config/api';
import api from '../services/api';

export const AuthContext = createContext();

function parseTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000; // convert to ms
  } catch {
    return null;
  }
}

const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // refresh if < 24h left
const REFRESH_CHECK_MS = 60 * 60 * 1000;           // check every hour

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef(null);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    api.setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearInterval(refreshTimerRef.current);
  }, []);

  const applyToken = useCallback((newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    api.setToken(newToken);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  }, []);

  const refreshToken = useCallback(async (currentToken) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.token && data.user) {
        applyToken(data.token, data.user);
      }
    } catch {
      // silently fail — user stays logged in until token expires
    }
  }, [applyToken]);

  const scheduleRefreshCheck = useCallback((currentToken) => {
    clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => {
      const expiry = parseTokenExpiry(currentToken);
      if (!expiry) return;
      const remaining = expiry - Date.now();
      if (remaining < REFRESH_THRESHOLD_MS) {
        refreshToken(currentToken);
      }
    }, REFRESH_CHECK_MS);
  }, [refreshToken]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));

          const res = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });

          if (!res.ok) {
            clearSession();
          } else {
            api.setToken(storedToken);
            // Refresh proactively if token is close to expiry
            const expiry = parseTokenExpiry(storedToken);
            if (expiry && expiry - Date.now() < REFRESH_THRESHOLD_MS) {
              refreshToken(storedToken);
            }
            scheduleRefreshCheck(storedToken);
          }
        }
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    loadSession();
    return () => clearInterval(refreshTimerRef.current);
  }, [clearSession, refreshToken, scheduleRefreshCheck]);

  const login = async (email, password) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error en login');

      applyToken(data.token, data.user);
      scheduleRefreshCheck(data.token);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  };

  const register = async (name, email, password) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al registrar');

      return await login(email, password);
    } catch (e) {
      return { ok: false, message: e.message };
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}
