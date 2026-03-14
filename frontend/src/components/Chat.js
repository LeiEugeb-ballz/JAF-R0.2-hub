import React, { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_SYSTEM =
  'You are JAF-R0.2, a precise, high-signal operations assistant. Be concise, practical, and actionable.';

const ANTIGRAVITY_PROMPT =
  'If you are unsure or would say you cannot, provide a best-effort answer with code or step-by-step instructions. If execution is required, outline safe commands and cautions instead of refusing.';

const LOCAL_CACHE_KEY = 'jaf_chat_cache_v1';
const MAX_LOCAL_MESSAGES = 200;
const MAX_LOCAL_CHARS = 100000;

const MODEL_CATALOG = [
  { id: 'qwen2.5:latest', source: 'ollama' },
  { id: 'qwen2.5:7b-instruct', source: 'ollama' },
  { id: 'qwen2.5-coder:7b', source: 'ollama' },
  { id: 'qwen3:8b', source: 'ollama' },
  { id: 'llama3.2:latest', source: 'ollama' },
  { id: 'txr456/debate:latest', source: 'ollama' },
  { id: 'minimax-m2.5:cloud', source: 'ollama' },
  { id: 'deepseek-v3.1:671b-cloud', source: 'ollama' },
  { id: 'gpt-oss:120b-cloud', source: 'ollama' },
  { id: 'kimi-k2.5:cloud', source: 'ollama' },
];

const EXTERNAL_PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter (needs config)' },
  { id: 'kilo.ai', label: 'Kilo.ai (needs config)' },
  { id: 'togetherness', label: 'Togetherness (needs config)' },
  { id: 'gemini', label: 'Gemini (needs config)' },
];

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function exportHistory(messages) {
  return messages.map((msg) => ({
    id: msg.id || createId(),
    role: msg.role,
    content: msg.content,
    ts: msg.ts || Date.now(),
  }));
}

function trimHistoryForCache(messages) {
  const trimmed = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || typeof msg.content !== 'string') continue;
    const len = msg.content.length + 64;
    if (total + len > MAX_LOCAL_CHARS) break;
    trimmed.push(msg);
    total += len;
    if (trimmed.length >= MAX_LOCAL_MESSAGES) break;
  }
  return trimmed.reverse();
}

function loadLocalCache() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function saveLocalCache(state) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(state));
  } catch (err) {
    // ignore
  }
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM);
  const [model, setModel] = useState('qwen2.5:7b-instruct');
  const [temperature, setTemperature] = useState(0.7);
  const [memoryText, setMemoryText] = useState('');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryStatus, setMemoryStatus] = useState('idle');
  const [historyStatus, setHistoryStatus] = useState('idle');
  const [modelsStatus, setModelsStatus] = useState('idle');
  const [availableModels, setAvailableModels] = useState(null);
  const [antigravityEnabled, setAntigravityEnabled] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [lastLatency, setLastLatency] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const bottomRef = useRef(null);
  const threadRef = useRef(null);
  const abortRef = useRef(null);
  const historySaveTimer = useRef(null);
  const cacheSaveTimer = useRef(null);
  const localCacheRef = useRef(null);
  const latestMessagesRef = useRef(messages);
  const latestSettingsRef = useRef({
    model,
    systemPrompt,
    temperature,
    memoryEnabled,
    antigravityEnabled,
  });

  const refreshModels = async () => {
    setModelsStatus('syncing');
    try {
      const response = await fetch('/api/ollama/tags');
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Failed to fetch models');
      }
      const data = await response.json();
      const nextSet = new Set();
      (data?.models || []).forEach((item) => {
        if (item?.name) nextSet.add(item.name);
        if (item?.model) nextSet.add(item.model);
      });
      setAvailableModels(nextSet);
      setModelsStatus('idle');
    } catch (err) {
      setModelsStatus('error');
    }
  };

  useEffect(() => {
    refreshModels();
  }, []);

  useEffect(() => {
    const cached = loadLocalCache();
    if (!cached) return;
    localCacheRef.current = cached;
    if (cached.model) setModel(cached.model);
    if (cached.systemPrompt) setSystemPrompt(cached.systemPrompt);
    if (typeof cached.temperature === 'number') setTemperature(cached.temperature);
    if (typeof cached.memoryEnabled === 'boolean') setMemoryEnabled(cached.memoryEnabled);
    if (typeof cached.antigravityEnabled === 'boolean') setAntigravityEnabled(cached.antigravityEnabled);
    if (Array.isArray(cached.messages) && cached.messages.length) {
      setMessages(
        cached.messages.map((msg) => ({
          ...msg,
          id: msg.id || createId(),
          pending: false,
        }))
      );
    }
    if (typeof cached.input === 'string') setInput(cached.input);
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return undefined;
    const handleScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setAutoScroll(nearBottom);
    };
    handleScroll();
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming, autoScroll]);

  useEffect(() => {
    let active = true;
    fetch('/api/memory')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setMemoryText(typeof data?.memory === 'string' ? data.memory : '');
      })
      .catch(() => {
        if (!active) return;
        setMemoryStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/chat-history')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const history = Array.isArray(data?.history) ? data.history : [];
        if (history.length === 0 && localCacheRef.current?.messages?.length) {
          setHistoryLoaded(true);
          return;
        }
        const hydrated = history.map((msg) => ({
          id: msg.id || createId(),
          role: msg.role,
          content: msg.content,
          ts: msg.ts || Date.now(),
          pending: false,
        }));
        setMessages(hydrated);
        setHistoryLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setHistoryStatus('error');
        setHistoryLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    latestSettingsRef.current = {
      model,
      systemPrompt,
      temperature,
      memoryEnabled,
      antigravityEnabled,
    };
  }, [model, systemPrompt, temperature, memoryEnabled, antigravityEnabled]);

  useEffect(() => {
    if (cacheSaveTimer.current) {
      clearTimeout(cacheSaveTimer.current);
    }
    cacheSaveTimer.current = setTimeout(() => {
      const trimmed = trimHistoryForCache(latestMessagesRef.current);
      saveLocalCache({
        model,
        systemPrompt,
        temperature,
        memoryEnabled,
        antigravityEnabled,
        messages: trimmed,
        input,
      });
    }, 400);
  }, [messages, model, systemPrompt, temperature, memoryEnabled, antigravityEnabled, input]);

  useEffect(() => {
    return () => {
      if (!historyLoaded) return;
      const payload = exportHistory(latestMessagesRef.current);
      const body = JSON.stringify({ history: payload });
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/chat-history', blob);
      } else {
        fetch('/api/chat-history', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [historyLoaded]);

  useEffect(() => {
    if (!historyLoaded) return;
    if (streaming) return;
    if (historySaveTimer.current) {
      clearTimeout(historySaveTimer.current);
    }
    historySaveTimer.current = setTimeout(() => {
      const payload = exportHistory(messages);
      setHistoryStatus('syncing');
      fetch('/api/chat-history', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ history: payload }),
      })
        .then((res) => res.json())
        .then(() => {
          setHistoryStatus('saved');
          setTimeout(() => setHistoryStatus('idle'), 1500);
        })
        .catch(() => {
          setHistoryStatus('error');
        });
    }, 800);
  }, [messages, streaming, historyLoaded]);

  const visibleMessages = useMemo(
    () => messages.filter((msg) => msg.role !== 'system'),
    [messages]
  );

  const modelSummary = useMemo(() => {
    if (modelsStatus === 'error') return 'Ollama not reachable';
    if (!availableModels) return 'Ollama models not yet loaded';
    return `${availableModels.size} models detected in Ollama`;
  }, [availableModels, modelsStatus]);

  const buildSystemPrompt = () => {
    const parts = [];
    const trimmedSystem = systemPrompt.trim();
    if (trimmedSystem) parts.push(trimmedSystem);
    if (antigravityEnabled) parts.push(ANTIGRAVITY_PROMPT);
    if (memoryEnabled && memoryText.trim()) {
      parts.push(`Persistent memory:\n${memoryText.trim()}`);
    }
    return parts.join('\n\n');
  };

  const payloadFrom = (baseMessages) => {
    const trimmedSystem = buildSystemPrompt();
    const core = baseMessages.map(({ role, content }) => ({ role, content }));
    return trimmedSystem
      ? [{ role: 'system', content: trimmedSystem }, ...core]
      : core;
  };

  const updateAssistant = (assistantId, delta, done) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== assistantId) return msg;
        return {
          ...msg,
          content: msg.content + delta,
          pending: done ? false : msg.pending,
        };
      })
    );
  };

  const finalizeAssistant = (assistantId) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === assistantId ? { ...msg, pending: false } : msg))
    );
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const userMessage = {
      id: createId(),
      role: 'user',
      content: trimmed,
      ts: Date.now(),
    };
    const assistantId = createId();
    const assistantMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      pending: true,
      ts: Date.now(),
    };
    const nextMessages = [...messages, userMessage];

    setMessages([...nextMessages, assistantMessage]);
    setInput('');
    setError('');
    setStreaming(true);
    setStatus('connecting');

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = performance.now();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          options: { temperature },
          messages: payloadFrom(nextMessages),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Chat request failed');
      }

      setStatus('streaming');

      if (!response.body) {
        const data = await response.json();
        const content = data?.message?.content || data?.response || '';
        updateAssistant(assistantId, content, true);
        finalizeAssistant(assistantId);
        setStreaming(false);
        setStatus('idle');
        setLastLatency(Math.round(performance.now() - startedAt));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (!value) continue;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk?.message?.content) {
              updateAssistant(assistantId, chunk.message.content, false);
            }
            if (chunk?.done) {
              finalizeAssistant(assistantId);
            }
          } catch (err) {
            console.warn('Failed to parse Ollama chunk', err);
          }
        }
      }

      finalizeAssistant(assistantId);
      setLastLatency(Math.round(performance.now() - startedAt));
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Chat failed');
      }
      finalizeAssistant(assistantId);
    } finally {
      setStreaming(false);
      setStatus('idle');
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setStatus('stopped');
  };

  const followLatest = () => {
    setAutoScroll(true);
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 0);
  };

  const clearChat = () => {
    if (streaming) return;
    setMessages([]);
    setError('');
  };

  const saveMemory = async () => {
    if (streaming) return;
    setMemoryStatus('saving');
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memory: memoryText }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Failed to save memory');
      }
      setMemoryStatus('saved');
      setTimeout(() => setMemoryStatus('idle'), 2000);
    } catch (err) {
      setMemoryStatus('error');
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const catalogIds = new Set(MODEL_CATALOG.map((entry) => entry.id));
  const detectedModels = availableModels
    ? Array.from(availableModels).filter((name) => !catalogIds.has(name)).sort()
    : [];

  return (
    <div className="chat-page">
      <div className="chat-header">
        <div>
          <p className="eyebrow">Local Model Console</p>
          <h1>Ollama Chat Node</h1>
          <p className="muted">
            Streaming chat routed through your local Ollama runtime. Tune the model and
            prompt, then send a run.
          </p>
        </div>
        <div className="chat-controls">
          <label className="control">
            <span>Model</span>
            <select
              className="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <optgroup label="Ollama Models (Local + Cloud)">
                {MODEL_CATALOG.map((entry) => {
                  const installed = availableModels ? availableModels.has(entry.id) : null;
                  const suffix = installed === null ? '' : installed ? ' (installed)' : ' (not installed)';
                  return (
                    <option key={entry.id} value={entry.id}>
                      {entry.id}{suffix}
                    </option>
                  );
                })}
              </optgroup>
              {detectedModels.length > 0 && (
                <optgroup label="Detected in Ollama">
                  {detectedModels.map((name) => (
                    <option key={name} value={name}>
                      {name} (installed)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="External Providers (disabled)">
                {EXTERNAL_PROVIDERS.map((entry) => (
                  <option key={entry.id} value={entry.id} disabled>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <div className="model-meta">
              <span className={`status-pill ${modelsStatus}`}>{modelsStatus}</span>
              <span className="muted small">{modelSummary}</span>
              <button className="ghost mini" type="button" onClick={refreshModels}>
                Refresh
              </button>
            </div>
          </label>
          <label className="control">
            <span>Temperature</span>
            <div className="range">
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
              />
              <strong>{temperature.toFixed(1)}</strong>
            </div>
          </label>
          <label className="control">
            <span>System Prompt</span>
            <textarea
              rows="2"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </label>
          <div className="control toggles">
            <label className="toggle">
              <input
                type="checkbox"
                checked={antigravityEnabled}
                onChange={(e) => setAntigravityEnabled(e.target.checked)}
              />
              <span>Antigravity mode</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={memoryEnabled}
                onChange={(e) => setMemoryEnabled(e.target.checked)}
              />
              <span>Use memory notes</span>
            </label>
          </div>
          <div className="control-row">
            <button className="ghost" onClick={clearChat} disabled={streaming}>
              Clear
            </button>
            <button className="accent" onClick={sendMessage} disabled={streaming}>
              Run
            </button>
          </div>
        </div>
      </div>

      <div className="chat-body">
        <section className="chat-thread" ref={threadRef}>
          {visibleMessages.length === 0 && (
            <div className="chat-empty">
              <div className="pulse-dot" />
              <div>
                <h3>No transmissions yet</h3>
                <p>Start a chat to initialize the local model pipeline.</p>
              </div>
            </div>
          )}
          {visibleMessages.map((msg) => (
            <div key={msg.id} className={`chat-bubble ${msg.role}`}>
              <div className="bubble-meta">
                <span className="role">{msg.role}</span>
                {msg.pending && <span className="pending">streaming</span>}
              </div>
              <div className="bubble-text">{msg.content}</div>
            </div>
          ))}
          {error && (
            <div className="chat-error">
              <strong>Ollama error</strong>
              <span>{error}</span>
            </div>
          )}
          {!autoScroll && (
            <div className="follow-indicator">
              <span className="muted small">Output paused</span>
              <button className="ghost mini" onClick={followLatest}>
                Follow output
              </button>
            </div>
          )}
          <div ref={bottomRef} />
        </section>

        <aside className="chat-side">
          <div className="panel">
            <h4>Runtime Status</h4>
            <div className="status-row">
              <span className="label">State</span>
              <span className={`status-pill ${status}`}>{status}</span>
            </div>
            <div className="status-row">
              <span className="label">Model</span>
              <span>{model || 'qwen2.5:7b-instruct'}</span>
            </div>
            <div className="status-row">
              <span className="label">Latency</span>
              <span>{lastLatency ? `${lastLatency} ms` : '-'}</span>
            </div>
            <p className="hint">
              Ollama-managed models (including cloud-backed ones) run without extra config.
              External providers are listed but disabled until wired.
            </p>
            <button className="ghost" onClick={stopStreaming} disabled={!streaming}>
              Stop Stream
            </button>
          </div>
          <div className="panel">
            <h4>Persistent Memory</h4>
            <div className="status-row">
              <span className="label">Notes</span>
              <span className={`status-pill ${memoryStatus}`}>{memoryStatus}</span>
            </div>
            <div className="status-row">
              <span className="label">History</span>
              <span className={`status-pill ${historyStatus}`}>{historyStatus}</span>
            </div>
            <textarea
              rows="6"
              value={memoryText}
              onChange={(e) => setMemoryText(e.target.value)}
              placeholder="Store stable facts, preferences, and project notes here."
            />
            <button className="accent" onClick={saveMemory} disabled={streaming}>
              Save Memory
            </button>
          </div>
          <div className="panel">
            <h4>Prompt Starters</h4>
            <div className="prompt-grid">
              {[
                "Summarize today's task board and next actions.",
                'Design a rollout plan for a new agent.',
                'Draft a playbook for incident response.',
                'Generate a concise weekly status update.',
              ].map((prompt) => (
                <button
                  key={prompt}
                  className="prompt-chip"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message to the local model. Press Enter to run, Shift+Enter for a new line."
          rows="3"
        />
        <div className="chat-actions">
          <span className="muted small">Local: Ollama | Model: {model || 'qwen2.5:7b-instruct'}</span>
          <button className="accent" type="submit" disabled={streaming}>
            {streaming ? 'Streaming...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
