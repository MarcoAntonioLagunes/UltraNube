import { useContext, useState, useEffect, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { T } from '../constants/i18n';
import api from '../services/api';
import styles from './SettingsScreen.module.css';

const ACCENT_PRESETS = ['#ff2d95', '#7c3aed', '#2563eb', '#059669', '#ea580c', '#e11d48'];

function Toggle({ checked, onChange }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.toggleTrack} />
    </label>
  );
}

function SegmentedGroup({ options, value, onChange }) {
  return (
    <div className={styles.segmented}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`${styles.segBtn} ${value === opt.value ? styles.segBtnActive : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsScreen() {
  const { user, clearSession, updateUser } = useContext(AuthContext);
  const { settings, updateSettings } = useSettings();
  const lang = settings.language || 'es';
  const t = T[lang];

  // Account state
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [nameStatus, setNameStatus] = useState(null);
  const avatarInputRef = useRef(null);
  const [avatarStatus, setAvatarStatus] = useState(null);

  // Password state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwStatus, setPwStatus] = useState(null);
  const [pwError, setPwError] = useState('');

  // Storage state
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    api.getStorageStats().then(setStorage).catch(() => {});
  }, []);

  const saveName = async () => {
    const name = displayName.trim();
    if (!name || name === user?.name) return;
    setNameStatus('saving');
    try {
      const data = await api.updateProfile(name);
      updateUser({ name: data.user?.name || name });
      setNameStatus('ok');
      setTimeout(() => setNameStatus(null), 2500);
    } catch {
      setNameStatus('error');
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarStatus('saving');
    try {
      const data = await api.uploadAvatar(file);
      updateUser({ avatar: data.avatar });
      setAvatarStatus('ok');
      setTimeout(() => setAvatarStatus(null), 2500);
    } catch {
      setAvatarStatus('error');
    }
  };

  const savePassword = async () => {
    setPwError('');
    if (!currentPw || !newPw || !confirmPw) { setPwError('Completa todos los campos'); return; }
    if (newPw !== confirmPw) { setPwError('Las contraseñas no coinciden'); return; }
    if (newPw.length < 8) { setPwError('Mínimo 8 caracteres'); return; }
    setPwStatus('saving');
    try {
      await api.changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwStatus('ok');
      setTimeout(() => setPwStatus(null), 2500);
    } catch (e) {
      setPwError(e.message || 'Error al cambiar contraseña');
      setPwStatus('error');
    }
  };

  const storagePercent = storage ? Math.min(100, (storage.used / storage.limit) * 100) : 0;
  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <div className={styles.page}>
      <div className="pageHeader">
        <div>
          <h1>{t.settingsTitle}</h1>
          <p>{t.settingsDesc}</p>
        </div>
        <button type="button" className="dangerButton" onClick={clearSession}>
          {t.logout}
        </button>
      </div>

      {/* ── Appearance ─────────────────────────────────── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t.appearance}</p>

        <div className={styles.themeGrid}>
          {[
            { id: 'ia', label: t.themeIa, cls: styles.themeIaPreview },
            { id: 'dark', label: t.themeDark, cls: styles.themeDarkPreview },
            { id: 'light', label: t.themeLight, cls: styles.themeLightPreview },
          ].map(({ id, label, cls }) => (
            <button
              key={id}
              type="button"
              className={`${styles.themeCard} ${settings.theme === id ? styles.active : ''}`}
              onClick={() => updateSettings({ theme: id })}
            >
              <div className={`${styles.themePreview} ${cls}`}>
                <div className={styles.previewSidebar} />
                <div className={styles.previewMain}>
                  <div className={styles.previewBlock} />
                  <div className={styles.previewBlock} />
                </div>
              </div>
              <span className={styles.themeLabel}>{label}</span>
            </button>
          ))}
        </div>

        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>{t.accentColor}</span>
          <div className={styles.accentPicker}>
            <div className={styles.accentPresets}>
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.accentSwatch} ${settings.accentColor === color ? styles.swatchActive : ''}`}
                  style={{ background: color }}
                  onClick={() => updateSettings({ accentColor: color })}
                  aria-label={color}
                />
              ))}
            </div>
            <input
              type="color"
              className={styles.accentInput}
              value={settings.accentColor}
              onChange={(e) => updateSettings({ accentColor: e.target.value })}
              title="Color personalizado"
            />
          </div>
        </div>

        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>{t.fontSize}</span>
          <SegmentedGroup
            options={[
              { value: 'small', label: t.fontSmall },
              { value: 'normal', label: t.fontNormal },
              { value: 'large', label: t.fontLarge },
            ]}
            value={settings.fontSize}
            onChange={(v) => updateSettings({ fontSize: v })}
          />
        </div>
      </section>

      {/* ── Behavior ───────────────────────────────────── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t.behavior}</p>

        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>{t.language}</span>
          <SegmentedGroup
            options={[
              { value: 'es', label: t.langEs },
              { value: 'en', label: t.langEn },
            ]}
            value={settings.language}
            onChange={(v) => updateSettings({ language: v })}
          />
        </div>

        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>{t.fileView}</span>
          <SegmentedGroup
            options={[
              { value: 'grid', label: t.viewGrid },
              { value: 'list', label: t.viewList },
            ]}
            value={settings.fileView}
            onChange={(v) => updateSettings({ fileView: v })}
          />
        </div>

        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>{t.sortBy}</span>
          <SegmentedGroup
            options={[
              { value: 'name', label: t.sortName },
              { value: 'date', label: t.sortDate },
              { value: 'size', label: t.sortSize },
            ]}
            value={settings.sortBy}
            onChange={(v) => updateSettings({ sortBy: v })}
          />
        </div>
      </section>

      {/* ── Notifications ──────────────────────────────── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t.notifications}</p>

        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>{t.notifyUpload}</span>
          <Toggle
            checked={settings.notifyUpload}
            onChange={(v) => updateSettings({ notifyUpload: v })}
          />
        </div>

        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>{t.notifyTranslation}</span>
          <Toggle
            checked={settings.notifyTranslation}
            onChange={(v) => updateSettings({ notifyTranslation: v })}
          />
        </div>
      </section>

      {/* ── Account ─────────────────────────────────────── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t.account}</p>

        <div className={styles.avatarRow}>
          <div className={styles.avatarWrap}>
            {user?.avatar
              ? <img src={user.avatar} alt="avatar" className={styles.avatarImg} />
              : userInitial}
          </div>
          <div className={styles.avatarActions}>
            <span className={styles.avatarName}>{user?.name}</span>
            <span className={styles.avatarEmail}>{user?.email}</span>
            <button
              type="button"
              className={`secondaryButton ${styles.avatarUploadBtn}`}
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarStatus === 'saving' ? '...' : t.uploadPhoto}
            </button>
            {avatarStatus === 'ok' && <span className={styles.statusOk}>✓</span>}
            {avatarStatus === 'error' && <span className={styles.statusError}>Error</span>}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <p className={styles.fieldGroupTitle}>{t.displayName}</p>
          <div className={styles.fieldRow}>
            <input
              className="formField"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
            />
            <button type="button" className="primaryButton" onClick={saveName}>
              {nameStatus === 'saving' ? '...' : t.saveChanges}
            </button>
          </div>
          {nameStatus === 'ok' && <span className={styles.statusOk}>✓ Guardado</span>}
          {nameStatus === 'error' && <span className={styles.statusError}>Error al guardar</span>}
        </div>

        <div className={styles.fieldGroup}>
          <p className={styles.fieldGroupTitle}>{t.changePassword}</p>
          <input
            className="formField"
            type="password"
            placeholder={t.currentPassword}
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
          />
          <input
            className="formField"
            type="password"
            placeholder={t.newPassword}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <input
            className="formField"
            type="password"
            placeholder={t.confirmPassword}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
          {pwError && <span className={styles.statusError}>{pwError}</span>}
          {pwStatus === 'ok' && <span className={styles.statusOk}>✓ Contraseña actualizada</span>}
          <button
            type="button"
            className="primaryButton"
            onClick={savePassword}
            disabled={pwStatus === 'saving'}
            style={{ marginTop: 4 }}
          >
            {pwStatus === 'saving' ? '...' : t.updatePassword}
          </button>
        </div>
      </section>

      {/* ── Storage ─────────────────────────────────────── */}
      <section className={styles.section}>
        <p className={styles.sectionTitle}>{t.storage}</p>
        <div className={styles.storageInfo}>
          <span className={styles.storageLabel}>{t.storageUsed}</span>
          <span className={styles.storageValue}>
            {storage
              ? `${storage.usedMB} MB ${t.storageOf} ${storage.limitGB} GB`
              : '— MB'}
          </span>
        </div>
        <div className={styles.storageBarTrack}>
          <div
            className={styles.storageBarFill}
            style={{ width: `${storagePercent}%` }}
          />
        </div>
        <div className={styles.storageMeta}>
          <span>{storage ? `${storage.fileCount} archivos` : ''}</span>
          <span>{t.maxFileSize}: 50 MB</span>
        </div>
      </section>
    </div>
  );
}
