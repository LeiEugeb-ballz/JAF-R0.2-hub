import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'jaf_training_v1';

const DEFAULT_SKILLS = [
  { id: 'context', name: 'Context Window Optimization', level: 4, progress: 78 },
  { id: 'writing', name: 'Concise Technical Writing', level: 5, progress: 100 },
  { id: 'ui', name: 'Multi-panel UI Simulation', level: 2, progress: 42 },
  { id: 'ops', name: 'Ops Runbook Design', level: 3, progress: 64 },
];

const DEFAULT_IMPROVEMENTS = [
  { id: 'imp-1', label: 'Precision formatting', timestamp: 'Recent' },
  { id: 'imp-2', label: 'Task hierarchy parsing', timestamp: 'Recent' },
  { id: 'imp-3', label: 'Persistent memory integration', timestamp: 'Active' },
];

function loadTrainingState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function saveTrainingState(state) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // ignore
  }
}

export default function Training() {
  const [skills, setSkills] = useState(DEFAULT_SKILLS);
  const [improvements, setImprovements] = useState(DEFAULT_IMPROVEMENTS);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const cached = loadTrainingState();
    if (cached?.skills) setSkills(cached.skills);
    if (cached?.improvements) setImprovements(cached.improvements);
  }, []);

  useEffect(() => {
    saveTrainingState({ skills, improvements });
  }, [skills, improvements]);

  const overall = useMemo(() => {
    const total = skills.length || 0;
    const avg = total
      ? Math.round(skills.reduce((acc, skill) => acc + (skill.progress || 0), 0) / total)
      : 0;
    return { total, avg };
  }, [skills]);

  const runTrainingTick = () => {
    setStatus('syncing');
    setSkills((prev) =>
      prev.map((skill) => {
        const bump = Math.random() > 0.6 ? 3 : 1;
        const next = Math.min(100, skill.progress + bump);
        const levelUp = next === 100 && skill.progress < 100;
        return {
          ...skill,
          progress: next,
          level: levelUp ? skill.level + 1 : skill.level,
        };
      })
    );
    setImprovements((prev) => [
      {
        id: `imp-${Date.now()}`,
        label: 'Training micro-iteration',
        timestamp: new Date().toLocaleTimeString(),
      },
      ...prev,
    ].slice(0, 6));
    setTimeout(() => setStatus('idle'), 1200);
  };

  return (
    <div className="training-page">
      <div className="training-header">
        <div>
          <p className="eyebrow">Skill Ladder</p>
          <h1>Training Bay</h1>
          <p className="muted">
            Monitor active skill modules and track self-improvement milestones.
          </p>
        </div>
        <div className="training-status">
          <span className={`status-pill ${status}`}>{status}</span>
          <button className="accent" onClick={runTrainingTick}>
            Run Training Tick
          </button>
        </div>
      </div>

      <div className="training-grid">
        <section className="panel">
          <div className="panel-header">
            <h3>Active Modules</h3>
            <span className="status-pill saved">{overall.avg}%</span>
          </div>
          <div className="skill-stack">
            {skills.map((skill) => (
              <div key={skill.id} className="skill-row">
                <div className="skill-meta">
                  <span>{skill.name}</span>
                  <span className="muted small">Lvl {skill.level}</span>
                </div>
                <div className="metric-track">
                  <div className="metric-fill" style={{ width: `${skill.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Recent Improvements</h3>
            <span className="status-pill approved">log</span>
          </div>
          <div className="improvement-list">
            {improvements.map((item) => (
              <div key={item.id} className="improvement-row">
                <span>{item.label}</span>
                <span className="muted small">{item.timestamp}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Next Targets</h3>
            <span className="status-pill pending">queued</span>
          </div>
          <ul className="training-targets">
            <li>Real-time task progression visuals</li>
            <li>Automated skill audit reports</li>
            <li>Multi-agent coordination routines</li>
          </ul>
          <p className="hint">
            Targets are editable. Add automation hooks once telemetry is wired.
          </p>
        </section>
      </div>
    </div>
  );
}
