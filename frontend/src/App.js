
import { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import { BrowserRouter as Router, Route, Routes, NavLink } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Tasks from './components/Tasks';
import Chat from './components/Chat';
import Analytics from './components/Analytics';
import Training from './components/Training';
import './App.css';

const CHAT_CACHE_KEY = 'jaf_chat_cache_v1';
const TICKER_FEEDS_KEY = 'jaf_ticker_feeds_v1';
const LAST_ERROR_KEY = 'jaf_last_error_v1';
const BUILD_STAMP = (process.env.REACT_APP_BUILD_ID || new Date().toISOString())
  .replace('T', ' ')
  .replace('Z', '');

function readCachedModel() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(CHAT_CACHE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return typeof parsed?.model === 'string' ? parsed.model : '';
  } catch (err) {
    return '';
  }
}

function readCachedAssistantPreview() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(CHAT_CACHE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg?.role === 'assistant' && typeof msg.content === 'string' && msg.content.trim()) {
        const snippet = msg.content.replace(/\s+/g, ' ').trim();
        return snippet.length > 120 ? `${snippet.slice(0, 120)}…` : snippet;
      }
    }
    return '';
  } catch (err) {
    return '';
  }
}

function readCustomTickerFeeds() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TICKER_FEEDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch (err) {
    return [];
  }
}

function readLastError() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_ERROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.message) return null;
    return {
      message: String(parsed.message),
      ts: typeof parsed.ts === 'number' ? parsed.ts : null,
    };
  } catch (err) {
    return null;
  }
}

function formatUptime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

const PLAYFUL_LINES = [
  'Vibe: humming along',
  'Mood: low-latency focus',
  'Pulse: systems green',
  'Signal: crisp and calm',
  'Orbit: stable cadence',
  'Chatter: light',
];

function App() {
  const [runtimeModel, setRuntimeModel] = useState(() => readCachedModel());
  const [assistantPreview, setAssistantPreview] = useState(() => readCachedAssistantPreview());
  const [customFeeds, setCustomFeeds] = useState(() => readCustomTickerFeeds());
  const [lastError, setLastError] = useState(() => readLastError());
  const [taskCount, setTaskCount] = useState(null);
  const [gatewayEnabled, setGatewayEnabled] = useState(null);
  const [openclawEnabled, setOpenclawEnabled] = useState(null);
  const [ollamaOk, setOllamaOk] = useState(null);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [uptimeTick, setUptimeTick] = useState(0);
  const [playfulLine, setPlayfulLine] = useState(() => PLAYFUL_LINES[0]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const startRef = useRef(Date.now());

  useEffect(() => {
    const handleModelChange = (event) => {
      if (event?.detail?.model) setRuntimeModel(event.detail.model);
    };
    const handleStorage = (event) => {
      if (event.key === CHAT_CACHE_KEY) {
        setRuntimeModel(readCachedModel());
        setAssistantPreview(readCachedAssistantPreview());
      }
      if (event.key === TICKER_FEEDS_KEY) {
        setCustomFeeds(readCustomTickerFeeds());
      }
      if (event.key === LAST_ERROR_KEY) {
        setLastError(readLastError());
      }
    };
    const pollPreview = () => {
      setAssistantPreview(readCachedAssistantPreview());
      setLastError(readLastError());
    };
    window.addEventListener('jaf:model-change', handleModelChange);
    window.addEventListener('storage', handleStorage);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const previewTimer = setInterval(pollPreview, 2500);
    return () => {
      window.removeEventListener('jaf:model-change', handleModelChange);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(previewTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshOps = async () => {
      try {
        const tasks = await fetch('/api/tasks').then((res) => res.json());
        if (active && Array.isArray(tasks)) setTaskCount(tasks.length);
      } catch (err) {
        if (active) setTaskCount(null);
      }
      try {
        const gateway = await fetch('/api/gateway/health').then((res) => res.json());
        if (active) setGatewayEnabled(!!gateway?.enabled);
      } catch (err) {
        if (active) setGatewayEnabled(null);
      }
      try {
        const openclaw = await fetch('/api/openclaw/health').then((res) => res.json());
        if (active) setOpenclawEnabled(!!openclaw?.enabled);
      } catch (err) {
        if (active) setOpenclawEnabled(null);
      }
      try {
        const ollama = await fetch('/api/ollama/tags');
        if (active) setOllamaOk(ollama.ok);
      } catch (err) {
        if (active) setOllamaOk(false);
      }
    };
    refreshOps();
    const timer = setInterval(refreshOps, 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const socket = io();
    const setConnected = () => setSocketStatus('connected');
    const setDisconnected = () => setSocketStatus('disconnected');
    socket.on('connect', setConnected);
    socket.on('disconnect', setDisconnected);
    return () => {
      socket.off('connect', setConnected);
      socket.off('disconnect', setDisconnected);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setUptimeTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = PLAYFUL_LINES[Math.floor(Math.random() * PLAYFUL_LINES.length)];
      setPlayfulLine(next);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  const tickerItems = useMemo(() => {
    const items = [];
    if (customFeeds.length) items.push(...customFeeds);
    items.push(`Status: ${isOnline ? 'online' : 'offline'}`);
    if (ollamaOk !== null) items.push(`Ollama: ${ollamaOk ? 'ok' : 'down'}`);
    if (gatewayEnabled !== null) items.push(`Gateway: ${gatewayEnabled ? 'armed' : 'open'}`);
    if (openclawEnabled !== null) items.push(`OpenClaw: ${openclawEnabled ? 'on' : 'off'}`);
    items.push(`Socket: ${socketStatus}`);
    items.push(`Active model: ${runtimeModel || 'qwen2.5:7b-instruct'}`);
    if (typeof taskCount === 'number') items.push(`Tasks: ${taskCount}`);
    items.push(`Uptime: ${formatUptime(uptimeTick - startRef.current)}`);
    const lastErrorLabel = lastError?.message ? `Last error: ${lastError.message}` : 'Last error: none';
    items.push(lastErrorLabel);
    if (assistantPreview) items.push(`Latest assistant: ${assistantPreview}`);
    items.push(playfulLine);
    return items.filter(Boolean);
  }, [
    assistantPreview,
    customFeeds,
    gatewayEnabled,
    isOnline,
    runtimeModel,
    taskCount,
    openclawEnabled,
    ollamaOk,
    socketStatus,
    uptimeTick,
    lastError,
    playfulLine,
  ]);

  const tickerPayload = useMemo(
    () => (tickerItems.length ? [...tickerItems, ...tickerItems] : []),
    [tickerItems]
  );

  return (
    <Router>
      <div className="ticker" role="status" aria-live="polite">
        <div className="ticker-track">
          {tickerPayload.map((item, index) => (
            <span key={`${item}-${index}`} className="ticker-item">
              {item}
            </span>
          ))}
        </div>
      </div>
      <div className={`app-shell ${isOnline ? '' : 'offline'}`.trim()}>
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">JAF</div>
            <div className="brand-text">
              <div className="brand-title">JAF-R0.2 Hub</div>
              <div className="brand-sub">Agent Operations</div>
            </div>
          </div>
          <nav className="nav">
            <NavLink end to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/tasks" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Tasks
            </NavLink>
            <NavLink to="/chat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Chat
            </NavLink>
            <NavLink to="/analytics" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Analytics
            </NavLink>
            <NavLink to="/training" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Training
            </NavLink>
          </nav>
          <div className="sidebar-footer">
            <div className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? 'Local Runtime' : 'Offline Mode'}
            </div>
            <p className="muted small">
              Ollama + {runtimeModel || 'qwen2.5:7b-instruct'}
            </p>
            <p className="muted small">Build {BUILD_STAMP}</p>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div>
              <p className="eyebrow">Command Deck</p>
              <h2>Operations Overview</h2>
            </div>
            <div className="topbar-actions">
              <button className="ghost">Sync</button>
              <button className="accent">Deploy Run</button>
            </div>
          </header>
          <section className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/training" element={<Training />} />
            </Routes>
          </section>
        </main>
        <div className="ambient-orbit" aria-hidden="true" />
      </div>
    </Router>
  );
}

export default App;
