import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io();

function Dashboard() {
  const [agents, setAgents] = useState([]);
  const [openclaw, setOpenclaw] = useState({ enabled: false, status: null, sessions: [] });
  const [gateway, setGateway] = useState({ enabled: false, allowlist: [] });
  const [gatewayTasks, setGatewayTasks] = useState([]);
  const [gatewayForm, setGatewayForm] = useState({ label: '', command: '', scope: 'external' });
  const [gatewayStatus, setGatewayStatus] = useState('idle');

  const refreshOpenclaw = async () => {
    try {
      const health = await fetch('/api/openclaw/health').then((res) => res.json());
      if (!health.enabled) {
        setOpenclaw({ enabled: false, status: null, sessions: [] });
        return;
      }
      const status = await fetch('/api/openclaw/status').then((res) => res.json());
      const sessions = await fetch('/api/openclaw/sessions').then((res) => res.json());
      setOpenclaw({
        enabled: true,
        status: status.data || null,
        sessions: sessions.data?.sessions || [],
      });
    } catch (err) {
      setOpenclaw({ enabled: false, status: null, sessions: [] });
    }
  };

  const refreshGateway = async () => {
    try {
      const health = await fetch('/api/gateway/health').then((res) => res.json());
      setGateway(health);
      const tasks = await fetch('/api/gateway/tasks').then((res) => res.json());
      setGatewayTasks(Array.isArray(tasks) ? tasks : []);
    } catch (err) {
      setGateway({ enabled: false, allowlist: [] });
    }
  };

  useEffect(() => {
    fetch('/api/agents').then((res) => res.json()).then(setAgents);
    socket.on('agents-update', setAgents);
    refreshOpenclaw();
    refreshGateway();
    return () => socket.off('agents-update');
  }, []);

  const submitGatewayTask = async () => {
    if (!gatewayForm.command.trim()) return;
    setGatewayStatus('syncing');
    try {
      const response = await fetch('/api/gateway/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: gatewayForm.label || 'Gateway task',
          command: gatewayForm.command,
          kind: 'shell',
          scope: gatewayForm.scope,
        }),
      });
      if (!response.ok) throw new Error('Failed to queue task');
      setGatewayForm({ label: '', command: '', scope: gatewayForm.scope });
      await refreshGateway();
      setGatewayStatus('idle');
    } catch (err) {
      setGatewayStatus('error');
    }
  };

  const runGatewayTask = async (taskId) => {
    setGatewayStatus('syncing');
    try {
      await fetch(`/api/gateway/tasks/${taskId}/run`, { method: 'POST' });
      await refreshGateway();
      setGatewayStatus('idle');
    } catch (err) {
      setGatewayStatus('error');
    }
  };

  const approveGatewayTask = async (taskId) => {
    setGatewayStatus('syncing');
    try {
      await fetch(`/api/gateway/tasks/${taskId}/approve`, { method: 'POST' });
      await refreshGateway();
      setGatewayStatus('idle');
    } catch (err) {
      setGatewayStatus('error');
    }
  };

  const denyGatewayTask = async (taskId) => {
    setGatewayStatus('syncing');
    try {
      await fetch(`/api/gateway/tasks/${taskId}/deny`, { method: 'POST' });
      await refreshGateway();
      setGatewayStatus('idle');
    } catch (err) {
      setGatewayStatus('error');
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>JAF-R0.2 Hub</h1>
          <p className="muted">
            Agent control, OpenClaw telemetry, and the execution gateway for all external tools.
          </p>
        </div>
        <button className="ghost" onClick={() => { refreshOpenclaw(); refreshGateway(); }}>
          Refresh Panels
        </button>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <h3>Active Agents</h3>
          <div className="agents">
            {agents.map((agent) => (
              <div key={agent.id} className={`agent-card ${agent.status}`}>
                <div>
                  <p>{agent.name}</p>
                  <p className="muted small">
                    {agent.role || 'administrator'} · {agent.status}
                  </p>
                </div>
              </div>
            ))}
            {agents.length === 0 && <p className="muted small">No agents registered yet.</p>}
          </div>
        </section>

        <section className="panel openclaw-panel">
          <div className="panel-header">
            <h3>OpenClaw Status</h3>
            <span className={`status-pill ${openclaw.enabled ? 'saved' : 'error'}`}>
              {openclaw.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
          {!openclaw.enabled && (
            <p className="muted small">
              OpenClaw is off. Enable with `OPENCLAW_ENABLED=1`.
            </p>
          )}
          {openclaw.enabled && (
            <>
              <div className="status-row">
                <span className="label">Uptime</span>
                <span>{openclaw.status?.uptime ?? '-'}</span>
              </div>
              <div className="status-row">
                <span className="label">Tokens Used</span>
                <span>
                  {(openclaw.status?.tokens?.in || 0) + (openclaw.status?.tokens?.out || 0)}
                </span>
              </div>
              <div className="openclaw-sessions">
                {openclaw.sessions.length === 0 && (
                  <p className="muted small">No active sessions.</p>
                )}
                {openclaw.sessions.slice(0, 4).map((session) => (
                  <div key={session.id || session.session_id} className="session-row">
                    <span>{session.model || session.kind || 'session'}</span>
                    <span className="muted small">{session.status || 'unknown'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="panel gateway-panel">
          <div className="panel-header">
            <h3>Gateway Queue</h3>
            <span className={`status-pill ${gateway.enabled ? 'saved' : 'error'}`}>
              {gateway.enabled ? 'armed' : 'open'}
            </span>
          </div>
          <p className="muted small">
            Gateway on: external commands require approval + allowlist. Gateway off: unrestricted.
          </p>
          <div className="gateway-form">
            <input
              type="text"
              placeholder="Task label (optional)"
              value={gatewayForm.label}
              onChange={(e) => setGatewayForm((prev) => ({ ...prev, label: e.target.value }))}
            />
            <textarea
              rows="2"
              placeholder="Command to queue (external only, must match allowlist)"
              value={gatewayForm.command}
              onChange={(e) => setGatewayForm((prev) => ({ ...prev, command: e.target.value }))}
            />
            <div className="gateway-scope">
              <label className="toggle">
                <input
                  type="radio"
                  name="scope"
                  checked={gatewayForm.scope === 'external'}
                  onChange={() => setGatewayForm((prev) => ({ ...prev, scope: 'external' }))}
                />
                <span>External (approval required)</span>
              </label>
              <label className="toggle">
                <input
                  type="radio"
                  name="scope"
                  checked={gatewayForm.scope === 'embedded'}
                  onChange={() => setGatewayForm((prev) => ({ ...prev, scope: 'embedded' }))}
                />
                <span>Embedded (pre-approved)</span>
              </label>
            </div>
            <div className="gateway-actions">
              <span className={`status-pill ${gatewayStatus}`}>{gatewayStatus}</span>
              <button className="accent" onClick={submitGatewayTask}>
                Queue Task
              </button>
            </div>
          </div>
          <div className="gateway-list">
            {gatewayTasks.slice(0, 6).map((task) => (
              <div key={task.id} className="gateway-task">
                <div>
                  <strong>{task.label}</strong>
                  <p className="muted small">{task.command || task.kind}</p>
                  <p className="muted small">Scope: {task.scope || 'external'}</p>
                </div>
                <div className="gateway-task-meta">
                  <span className={`status-pill ${task.status}`}>{task.status}</span>
                  {task.status === 'pending' && (
                    <>
                      <button className="ghost mini" onClick={() => approveGatewayTask(task.id)}>
                        Approve
                      </button>
                      <button className="ghost mini" onClick={() => denyGatewayTask(task.id)}>
                        Deny
                      </button>
                    </>
                  )}
                  <button className="ghost mini" onClick={() => runGatewayTask(task.id)}>
                    Run
                  </button>
                </div>
              </div>
            ))}
            {gatewayTasks.length === 0 && <p className="muted small">No queued tasks yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
