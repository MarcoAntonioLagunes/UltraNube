import React, { useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet } from "react-router-dom";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import { DriveProvider } from "./context/DriveContext";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import HomeScreen from "./screens/HomeScreen";
import FilesScreen from "./screens/FilesScreen";
import StarredScreen from "./screens/StarredScreen";
import AIAssistantScreen from "./screens/AIAssistantScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { colors } from "./utils/theme";
import ErrorBoundary from "./components/ErrorBoundary";

function MainApp() {
  return (
    <div className="appLayout">
      <nav className="appSidebar">
        <h2>UltraNube</h2>
        <ul>
          <li>
            <NavLink to="/home" className={({ isActive }) => isActive ? 'sidebarLink active' : 'sidebarLink'}>Inicio</NavLink>
          </li>
          <li>
            <NavLink to="/files" className={({ isActive }) => isActive ? 'sidebarLink active' : 'sidebarLink'}>Archivos</NavLink>
          </li>
          <li>
            <NavLink to="/starred" className={({ isActive }) => isActive ? 'sidebarLink active' : 'sidebarLink'}>Destacados</NavLink>
          </li>
          <li>
            <NavLink to="/ai" className={({ isActive }) => isActive ? 'sidebarLink active' : 'sidebarLink'}>IA</NavLink>
          </li>
          <li>
            <NavLink to="/settings" className={({ isActive }) => isActive ? 'sidebarLink active' : 'sidebarLink'}>Configuración</NavLink>
          </li>
        </ul>
      </nav>
      <main className="appMain">
        <Outlet />
      </main>
    </div>
  );
}

function AppContent() {
  const { token, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        backgroundColor: colors.bg,
        color: colors.text,
      }}>
        Cargando...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/home" /> : <LoginScreen />} />
      <Route path="/register" element={token ? <Navigate to="/home" /> : <RegisterScreen />} />
      <Route path="/" element={token ? <Navigate to="/home" /> : <Navigate to="/login" />} />
      {token ? (
        <Route path="/" element={<MainApp />}>
          <Route path="home" element={<ErrorBoundary title="Error en Inicio"><HomeScreen /></ErrorBoundary>} />
          <Route path="files" element={<ErrorBoundary title="Error en Archivos"><FilesScreen /></ErrorBoundary>} />
          <Route path="starred" element={<ErrorBoundary title="Error en Destacados"><StarredScreen /></ErrorBoundary>} />
          <Route path="ai" element={<ErrorBoundary title="Error en Asistente IA"><AIAssistantScreen /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary title="Error en Configuración"><SettingsScreen /></ErrorBoundary>} />
          <Route path="*" element={<Navigate to="/home" />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DriveProvider>
          <AppContent />
        </DriveProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
