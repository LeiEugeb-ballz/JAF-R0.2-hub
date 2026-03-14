
import { BrowserRouter as Router, Route, Routes, NavLink } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Tasks from './components/Tasks';
import Chat from './components/Chat';
import Analytics from './components/Analytics';
import Training from './components/Training';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-shell">
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
            <div className="status-pill">Local Runtime</div>
            <p className="muted small">Ollama + qwen2.5 default</p>
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
