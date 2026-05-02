// src/context/SettingsContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'ultranube_settings';

export const DEFAULT_SETTINGS = {
  theme:              'ia',
  accentColor:        '#ff2d95',
  fontSize:           'normal',
  language:           'es',
  fileView:           'grid',
  sortBy:             'name',
  notifyUpload:       true,
  notifyTranslation:  true,
};

// CSS variable bundles for each theme
const THEME_VARS = {
  ia: {
    '--text':           '#f5f5ff',
    '--text-muted':     '#9b9bb5',
    '--text-soft':      '#b8b8cf',
    '--bg':             '#050509',
    '--surface':        '#101121',
    '--surface-soft':   '#11111a',
    '--surface-border': 'rgba(255,255,255,0.08)',
    '--border':         '#262637',
    '--sidebar-bg':     'linear-gradient(180deg,#0b0c16,#11111e)',
    '--body-bg':
      'radial-gradient(circle at top left,rgba(255,45,149,0.12),transparent 18%),' +
      'radial-gradient(circle at bottom right,rgba(141,107,255,0.14),transparent 22%),' +
      'linear-gradient(180deg,#050509 0%,#07090f 100%)',
  },
  dark: {
    '--text':           '#f0f0f5',
    '--text-muted':     '#888898',
    '--text-soft':      '#aaaabc',
    '--bg':             '#0a0a0a',
    '--surface':        '#141414',
    '--surface-soft':   '#1c1c1c',
    '--surface-border': 'rgba(255,255,255,0.06)',
    '--border':         '#2a2a2a',
    '--sidebar-bg':     'linear-gradient(180deg,#111,#181818)',
    '--body-bg':        'linear-gradient(180deg,#0a0a0a 0%,#111 100%)',
  },
  light: {
    '--text':           '#111122',
    '--text-muted':     '#55556a',
    '--text-soft':      '#77778a',
    '--bg':             '#f0f0f7',
    '--surface':        '#ffffff',
    '--surface-soft':   '#f7f7fb',
    '--surface-border': 'rgba(0,0,0,0.07)',
    '--border':         '#dddde8',
    '--sidebar-bg':     'linear-gradient(180deg,#e8e8f0,#f0f0f7)',
    '--body-bg':        'linear-gradient(180deg,#f0f0f7 0%,#e8e8f2 100%)',
  },
};

const FONT_SIZES = { small: '14px', normal: '16px', large: '18px' };

// ── Colour helpers ─────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(255,45,149,${alpha})`;
  return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${alpha})`;
}

function lighten(hex, amt) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = (ch) => Math.min(255, Math.round(parseInt(ch,16) + (255-parseInt(ch,16)) * amt));
  return `#${c(m[1]).toString(16).padStart(2,'0')}${c(m[2]).toString(16).padStart(2,'0')}${c(m[3]).toString(16).padStart(2,'0')}`;
}

// ── Applier ───────────────────────────────────────────────────────────────────
function applyToDOM(s) {
  const root   = document.documentElement;
  const vars   = THEME_VARS[s.theme] || THEME_VARS.ia;

  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  const accent = s.accentColor || '#ff2d95';
  root.style.setProperty('--accent',       accent);
  root.style.setProperty('--accent-strong', lighten(accent, 0.22));
  root.style.setProperty('--accent-soft',   hexToRgba(accent, 0.18));

  const fs = FONT_SIZES[s.fontSize] || '16px';
  root.style.setProperty('--font-size-base', fs);
  root.style.fontSize = fs;

  document.body.style.background = vars['--body-bg'];
}

// ── Context ───────────────────────────────────────────────────────────────────
export const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  });

  // Apply on mount and whenever settings change
  useEffect(() => { applyToDOM(settings); }, [settings]);

  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
