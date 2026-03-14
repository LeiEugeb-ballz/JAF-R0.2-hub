import React, { useEffect, useMemo, useState } from 'react';

const SIGNALS = [
  { id: 'latency', label: 'Response Latency', value: 145, unit: 'ms', max: 260 },
  { id: 'context', label: 'Context Utilization', value: 58, unit: '%', max: 100 },
  { id: 'throughput', label: 'Token Throughput', value: 72, unit: '%', max: 100 },
  { id: 'stability', label: 'Runtime Stability', value: 94, unit: '%', max: 100 },
];

function normalizeTask(raw) {
  const status = raw?.status || raw?.column || 'todo';
  const progressRaw = Number.parseInt(raw?.progress ?? 0, 10);
  const progress = Number.isNaN(progressRaw) ? 0 : Math.min(100, Math.max(0, progressRaw));
  return {
    id: raw?.id,
    status,
    progress,
  };
}

export default function Analytics() {
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setStatus('syncing');
      try {
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error('Failed to load tasks');
        const data = await response.json();
        if (!active) return;
        const normalized = Array.isArray(data) ? data.map(normalizeTask) : [];
        setTasks(normalized);
        setStatus('idle');
      } catch (err) {
        if (!active) return;
        setStatus('error');
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const taskStats = useMemo(() => {
    const total = tasks.length || 0;
    const byStatus = tasks.reduce(
      (acc, task) => {
        const key = task.status || 'todo';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      { todo: 0, in_progress: 0, blocked: 0, done: 0 }
    );
    const avgProgress = total
      ? Math.round(tasks.reduce((acc, task) => acc + task.progress, 0) / total)
      : 0;
    return { total, avgProgress, byStatus };
  }, [tasks]);

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div>
          <p className="eyebrow">Signal Review</p>
          <h1>Analytics Grid</h1>
          <p className="muted">
            Live operational signals with task throughput and runtime health checks.
          </p>
        </div>
        <div className="analytics-status">
          <span className={`status-pill ${status}`}>{status}</span>
        </div>
      </div>

      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-header">
            <h3>System Signals</h3>
            <span className="status-pill streaming">live</span>
          </div>
          <div className="metric-stack">
            {SIGNALS.map((signal) => (
              <div key={signal.id} className="metric-row">
                <div className="metric-label">
                  <span>{signal.label}</span>
                  <span>{signal.value}{signal.unit}</span>
                </div>
                <div className="metric-track">
                  <div
                    className="metric-fill"
                    style={{ width: `${Math.min(100, (signal.value / signal.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Task Flow</h3>
            <span className="status-pill queued">board</span>
          </div>
          <div className="metric-stack">
            <div className="metric-row">
              <div className="metric-label">
                <span>Total Tasks</span>
                <span>{taskStats.total}</span>
              </div>
              <div className="metric-track">
                <div className="metric-fill" style={{ width: `${Math.min(100, taskStats.total * 12)}%` }} />
              </div>
            </div>
            <div className="metric-row">
              <div className="metric-label">
                <span>Avg Progress</span>
                <span>{taskStats.avgProgress}%</span>
              </div>
              <div className="metric-track">
                <div className="metric-fill" style={{ width: `${taskStats.avgProgress}%` }} />
              </div>
            </div>
            {Object.entries(taskStats.byStatus).map(([key, value]) => (
              <div key={key} className="metric-row">
                <div className="metric-label">
                  <span>{formatStatusLabel(key)}</span>
                  <span>{value}</span>
                </div>
                <div className="metric-track">
                  <div className="metric-fill" style={{ width: `${Math.min(100, value * 20)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Governance Snapshot</h3>
            <span className="status-pill approved">locked</span>
          </div>
          <div className="governance-grid">
            <div>
              <p className="muted small">Owner</p>
              <strong>You (full hub control)</strong>
            </div>
            <div>
              <p className="muted small">Administrator Role</p>
              <strong>Enabled in hub data</strong>
            </div>
            <div>
              <p className="muted small">Gateway Policy</p>
              <strong>On = approval required</strong>
            </div>
            <div>
              <p className="muted small">Safety Rules</p>
              <strong>System policy still applies</strong>
            </div>
          </div>
          <p className="hint">
            Gateway toggles tool execution only. It does not override system-level safeguards.
          </p>
        </section>
      </div>
    </div>
  );
}

function formatStatusLabel(value) {
  return String(value).replace('_', ' ');
}
