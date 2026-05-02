// src/components/ErrorBoundary.jsx
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '20px',
        padding: '40px',
        textAlign: 'center',
      }}>
        <span style={{ fontSize: '3rem' }}>⚠️</span>
        <h2 style={{ margin: 0, color: '#f5f5ff', fontSize: '1.5rem' }}>
          {this.props.title || 'Algo salió mal'}
        </h2>
        <p style={{ margin: 0, color: '#9b9bb5', maxWidth: '480px' }}>
          {this.state.error?.message || 'Ocurrió un error inesperado en esta sección.'}
        </p>
        <button
          onClick={this.handleReset}
          style={{
            padding: '12px 28px',
            borderRadius: '14px',
            border: 'none',
            background: 'linear-gradient(135deg, #ff2d95, #ff6ca0)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }
}
