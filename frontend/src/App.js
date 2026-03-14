
import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, NavLink } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Tasks from './components/Tasks';
import Chat from './components/Chat';
import Analytics from './components/Analytics';
import Training from './components/Training';
import './App.css';

const CHAT_CACHE_KEY = 'jaf_chat_cache_v1';
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

function App() {
  const [runtimeModel, setRuntimeModel] = useState(() => readCachedModel());
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleModelChange = (event) => {
      if (event?.detail?.model) setRuntimeModel(event.detail.model);
    };
    const handleStorage = (event) => {
      if (event.key === CHAT_CACHE_KEY) {
        setRuntimeModel(readCachedModel());
      }
    };
    window.addEventListener('jaf:model-change', handleModelChange);
    window.addEventListener('storage', handleStorage);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('jaf:model-change', handleModelChange);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <Router>
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
