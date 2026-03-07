
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Tasks from './components/Tasks';
import Chat from './components/Chat';
import Analytics from './components/Analytics';
import Training from './components/Training';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <nav>
          <Link to="/">Dashboard</Link> | <Link to="/tasks">Tasks</Link> | <Link to="/chat">Chat</Link> | <Link to="/analytics">Analytics</Link> | <Link to="/training">Training</Link>
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/training" element={<Training />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;