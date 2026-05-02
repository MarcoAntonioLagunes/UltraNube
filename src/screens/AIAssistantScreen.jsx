// src/screens/AIAssistantScreen.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import styles from './AIAssistantScreen.module.css';

const STORAGE_KEY = 'ultranube_ai_conversations';

const SUGGESTIONS = [
  { icon: '✏️', label: 'Escribe o edita', prompt: 'Ayúdame a escribir o editar ' },
  { icon: '🔍', label: 'Busca información', prompt: 'Busca información sobre ' },
  { icon: '📊', label: 'Analiza datos', prompt: 'Analiza estos datos: ' },
  { icon: '💡', label: 'Genera ideas', prompt: 'Dame ideas creativas para ' },
];

function createNewConversation() {
  return {
    id: `conv-${Date.now()}`,
    title: 'Nueva conversación',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

function saveToStorage(conversations) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export default function AIAssistantScreen() {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [convMenuId, setConvMenuId] = useState(null);   // "..." menu open for this conv id
  const [renamingId, setRenamingId] = useState(null);   // conv id being renamed
  const [renameValue, setRenameValue] = useState('');

  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const attachMenuRef = useRef(null);
  const convMenuRef = useRef(null);
  const textareaRef = useRef(null);
  const renameInputRef = useRef(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) {
          setConversations(parsed);
          setActiveConversationId(parsed[0].id);
          return;
        }
      } catch { /* ignore corrupt storage */ }
    }
    const first = createNewConversation();
    setConversations([first]);
    setActiveConversationId(first.id);
  }, []);

  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConversationId]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [inputValue]);

  useEffect(() => {
    const handler = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
      if (convMenuRef.current && !convMenuRef.current.contains(e.target)) {
        setConvMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0] || null,
    [conversations, activeConversationId]
  );

  const isWelcomeState = !activeConversation?.messages.some((m) => m.sender === 'user');

  // ── Conversation mutations (functional setState to avoid stale closures) ──
  const updateConversation = useCallback((id, updater) => {
    setConversations((prev) => {
      const next = prev.map((c) => (c.id !== id ? c : updater(c)));
      saveToStorage(next);
      return next;
    });
  }, []);

  const addMessageToActive = useCallback((message) => {
    setConversations((prev) => {
      const activePrev = prev.find((c) => c.id === activeConversationId) || prev[0];
      if (!activePrev) return prev;
      const updatedTitle =
        activePrev.title === 'Nueva conversación' && message.sender === 'user'
          ? message.text.trim().slice(0, 42).replace(/\n/g, ' ') || activePrev.title
          : activePrev.title;
      const next = prev.map((c) =>
        c.id !== activePrev.id
          ? c
          : { ...c, title: updatedTitle, messages: [...c.messages, message], updatedAt: new Date().toISOString() }
      );
      saveToStorage(next);
      return next;
    });
  }, [activeConversationId]);

  const handleCreateConversation = () => {
    const next = createNewConversation();
    setConversations((prev) => {
      const updated = [next, ...prev];
      saveToStorage(updated);
      return updated;
    });
    setActiveConversationId(next.id);
    setInputValue('');
    setAttachmentFiles([]);
  };

  const handleSelectConversation = (id) => {
    setActiveConversationId(id);
    setStatusMessage('');
    setAttachmentFiles([]);
    setConvMenuId(null);
  };

  const handleDeleteConversation = (id) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) {
        const fresh = createNewConversation();
        saveToStorage([fresh]);
        setActiveConversationId(fresh.id);
        return [fresh];
      }
      saveToStorage(next);
      if (activeConversationId === id) setActiveConversationId(next[0].id);
      return next;
    });
    setConvMenuId(null);
  };

  const handleRenameConversation = (id) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    updateConversation(id, (c) => ({ ...c, title: trimmed }));
    setRenamingId(null);
    setConvMenuId(null);
  };

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFileSelection = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setAttachmentFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeAttachment = (index) => {
    setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const buildUserText = () => {
    const trimmed = inputValue.trim();
    if (trimmed) return trimmed;
    if (attachmentFiles.length) return 'Adjunto algunos archivos para que los revises.';
    return '';
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    const text = buildUserText();
    if (!text || loading) return;

    const attachments = attachmentFiles.map((f) => ({ name: f.name, type: f.type, size: f.size }));
    addMessageToActive({ id: `user-${Date.now()}`, sender: 'user', text, attachments });
    setInputValue('');
    setAttachmentFiles([]);
    setLoading(true);
    setStatusMessage('Consultando IA...');

    const filesToUpload = [...attachmentFiles];
    const uploadedAttachments = [];
    const attachmentNames = [];

    try {
      for (const file of filesToUpload) {
        const result = await api.uploadFileAsync(file);
        const id = result?._id || result?.id;
        const name = result?.originalName || result?.name || file.name;
        if (name) attachmentNames.push(name);
        uploadedAttachments.push(id ? { id, name } : { name });
      }

      const messageToSend = `${text}${attachmentNames.length ? `\n\nArchivos adjuntos: ${attachmentNames.join(', ')}` : ''}`;
      const response = await api.chat(messageToSend, uploadedAttachments);

      addMessageToActive({
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.reply || 'No se obtuvo respuesta de la IA.',
      });
    } catch (error) {
      addMessageToActive({
        id: `error-${Date.now()}`,
        sender: 'ai',
        text: `Error: ${error?.message || 'Intenta de nuevo.'}`,
      });
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestion = (prompt) => {
    setInputValue(prompt);
    textareaRef.current?.focus();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.aiPage}>

      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <span className={styles.sidebarBrand}>UltraNube IA</span>
          <button type="button" className={styles.newChatBtn} onClick={handleCreateConversation} title="Nueva conversación">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>

        <div className={styles.sidebarSection}>Recientes</div>

        <div className={styles.conversationList} ref={convMenuRef}>
          {conversations.length === 0 ? (
            <div className={styles.emptyState}>Sin conversaciones.</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`${styles.convItem} ${conv.id === activeConversation?.id ? styles.convItemActive : ''}`}
              >
                {renamingId === conv.id ? (
                  <form
                    className={styles.renameForm}
                    onSubmit={(e) => { e.preventDefault(); handleRenameConversation(conv.id); }}
                  >
                    <input
                      ref={renameInputRef}
                      className={styles.renameInput}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => setRenamingId(null)}
                      onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                    />
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.convTitle}
                      onClick={() => handleSelectConversation(conv.id)}
                    >
                      {conv.title}
                    </button>
                    <button
                      type="button"
                      className={styles.convMenuBtn}
                      onClick={(e) => { e.stopPropagation(); setConvMenuId(convMenuId === conv.id ? null : conv.id); }}
                    >
                      •••
                    </button>
                    {convMenuId === conv.id && (
                      <div className={styles.convDropdown}>
                        <button
                          type="button"
                          className={styles.convDropdownItem}
                          onClick={() => { setRenamingId(conv.id); setRenameValue(conv.title); setConvMenuId(null); }}
                        >
                          ✏️ Renombrar
                        </button>
                        <button
                          type="button"
                          className={`${styles.convDropdownItem} ${styles.convDropdownDanger}`}
                          onClick={() => handleDeleteConversation(conv.id)}
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Chat ── */}
      <section className={styles.chatSection}>
        <div className={styles.chatHeader}>
          <h1>{activeConversation?.title || 'Asistente de IA'}</h1>
          {statusMessage && <span className={styles.chatStatus}>{statusMessage}</span>}
        </div>

        <div className={styles.chatCard}>
          {/* Messages / Welcome */}
          <div className={`${styles.messagesContainer} ${isWelcomeState ? styles.welcomeMessages : ''}`}>
            {isWelcomeState ? (
              <div className={styles.welcomeCenter}>
                <h2 className={styles.welcomeTitle}>¿Por dónde empezamos?</h2>
              </div>
            ) : (
              activeConversation?.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.messageRow} ${msg.sender === 'user' ? styles.messageRowUser : styles.messageRowAi}`}
                >
                  <div className={`${styles.messageBubble} ${msg.sender === 'user' ? styles.userBubble : styles.aiBubble}`}>
                    {msg.text}
                    {msg.attachments?.length ? (
                      <div className={styles.attachmentList}>
                        {msg.attachments.map((att, i) => (
                          <span key={`${att.name}-${i}`} className={styles.attachmentTag}>{att.name}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className={styles.messageRowAi}>
                <div className={`${styles.messageBubble} ${styles.typingBubble}`}>
                  <span className={styles.typingDots}><span /><span /><span /></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion pills */}
          {isWelcomeState && (
            <div className={styles.suggestionPills}>
              {SUGGESTIONS.map(({ icon, label, prompt }) => (
                <button key={label} type="button" className={styles.suggestionPill} onClick={() => handleSuggestion(prompt)}>
                  <span>{icon}</span> {label}
                </button>
              ))}
            </div>
          )}

          {/* Pending attachments */}
          {attachmentFiles.length > 0 && (
            <div className={styles.pendingAttachments}>
              {attachmentFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className={styles.pendingAttachment}>
                  <span>📎 {file.name}</span>
                  <button type="button" className={styles.removeAttachment} onClick={() => removeAttachment(index)}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className={styles.inputBarWrapper}>
            <div className={styles.inputBar}>
              <div className={styles.attachMenuWrapper} ref={attachMenuRef}>
                <button type="button" className={styles.plusButton} onClick={() => setShowAttachMenu((v) => !v)} aria-label="Adjuntar">
                  +
                </button>
                {showAttachMenu && (
                  <div className={styles.attachDropdown}>
                    <button type="button" className={styles.attachDropdownItem}
                      onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}>
                      <span>📎</span> Cargar fotos y archivos
                    </button>
                    <button type="button" className={styles.attachDropdownItem}
                      onClick={() => { photoInputRef.current?.click(); setShowAttachMenu(false); }}>
                      <span>📷</span> Tomar foto
                    </button>
                  </div>
                )}
              </div>

              <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelection} />
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFileSelection} />

              <textarea
                ref={textareaRef}
                className={styles.textarea}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pregunta lo que quieras..."
                disabled={loading}
                rows={1}
              />

              <button
                type="button"
                className={styles.sendButton}
                onClick={handleSendMessage}
                disabled={loading || !buildUserText()}
                aria-label="Enviar"
              >
                {loading ? (
                  <span className={styles.loadingDot} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
