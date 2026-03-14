import React, { useEffect, useMemo, useState } from 'react';

const STATUS_OPTIONS = [
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];
const ADMIN_TOKEN_KEY = 'jaf_admin_token_v1';

const DEFAULT_FORM = {
  title: '',
  description: '',
  progress: 0,
  status: 'todo',
  priority: 'medium',
  owner: 'Boss',
};

function normalizeTask(raw) {
  const status = raw?.status || raw?.column || 'todo';
  const progressRaw = Number.parseInt(raw?.progress ?? 0, 10);
  const progress = Number.isNaN(progressRaw) ? 0 : Math.min(100, Math.max(0, progressRaw));
  return {
    id: raw?.id,
    title: raw?.title || raw?.label || 'Untitled task',
    description: raw?.description || '',
    progress,
    status,
    priority: raw?.priority || 'medium',
    owner: raw?.owner || 'unassigned',
    updatedAt: raw?.updatedAt || raw?.createdAt || null,
  };
}

function formatStatus(status) {
  return String(status || 'todo').replace('_', ' ');
}

function readAdminToken() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  } catch (err) {
    return '';
  }
}

function writeAdminToken(value) {
  if (typeof window === 'undefined') return;
  try {
    if (!value) {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    } else {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, value);
    }
  } catch (err) {
    // ignore
  }
}

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingDraft, setEditingDraft] = useState(DEFAULT_FORM);
  const [adminToken, setAdminToken] = useState(() => readAdminToken());
  const isAdmin = Boolean(adminToken);

  const loadTasks = async () => {
    setStatus('syncing');
    try {
      const response = await fetch('/api/tasks');
      if (!response.ok) throw new Error('Failed to load tasks');
      const data = await response.json();
      const normalized = Array.isArray(data) ? data.map(normalizeTask) : [];
      setTasks(normalized);
      setStatus('idle');
    } catch (err) {
      setError(err?.message || 'Failed to load tasks');
      setStatus('error');
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(STATUS_OPTIONS.map((entry) => [entry.id, []]));
    tasks.forEach((task) => {
      const statusKey = STATUS_OPTIONS.some((entry) => entry.id === task.status)
        ? task.status
        : 'todo';
      map[statusKey].push(task);
    });
    return map;
  }, [tasks]);

  const summary = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === 'done').length;
    const avgProgress = total
      ? Math.round(tasks.reduce((acc, task) => acc + task.progress, 0) / total)
      : 0;
    return { total, done, avgProgress };
  }, [tasks]);

  const createTask = async () => {
    if (!isAdmin) {
      setError('Admin mode required to add tasks.');
      return;
    }
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(adminToken ? { 'x-admin-token': adminToken } : {}),
        },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error('Failed to create task');
      const created = normalizeTask(await response.json());
      setTasks((prev) => [created, ...prev]);
      setForm(DEFAULT_FORM);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1200);
    } catch (err) {
      setStatus('error');
      setError(err?.message || 'Failed to create task');
    }
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditingDraft({
      title: task.title,
      description: task.description,
      progress: task.progress,
      status: task.status,
      priority: task.priority,
      owner: task.owner,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingDraft(DEFAULT_FORM);
  };

  const saveEdit = async (taskId) => {
    if (!isAdmin) {
      setError('Admin mode required to edit tasks.');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(adminToken ? { 'x-admin-token': adminToken } : {}),
        },
        body: JSON.stringify(editingDraft),
      });
      if (!response.ok) throw new Error('Failed to update task');
      const updated = normalizeTask(await response.json());
      setTasks((prev) => prev.map((task) => (task.id === taskId ? updated : task)));
      setEditingId(null);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1200);
    } catch (err) {
      setStatus('error');
      setError(err?.message || 'Failed to update task');
    }
  };

  const bumpProgress = async (taskId, delta) => {
    if (!isAdmin) {
      setError('Admin mode required to update tasks.');
      return;
    }
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const next = Math.min(100, Math.max(0, task.progress + delta));
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(adminToken ? { 'x-admin-token': adminToken } : {}),
        },
        body: JSON.stringify({ progress: next }),
      });
      if (!response.ok) throw new Error('Failed to update progress');
      const updated = normalizeTask(await response.json());
      setTasks((prev) => prev.map((item) => (item.id === taskId ? updated : item)));
    } catch (err) {
      setError(err?.message || 'Failed to update progress');
    }
  };

  const deleteTask = async (taskId) => {
    if (!isAdmin) {
      setError('Admin mode required to delete tasks.');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: adminToken ? { 'x-admin-token': adminToken } : {},
      });
      if (!response.ok) throw new Error('Failed to delete task');
      setTasks((prev) => prev.filter((task) => task.id !== taskId));
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err?.message || 'Failed to delete task');
    }
  };

  return (
    <div className="tasks-page">
      <div className="tasks-header">
        <div>
          <p className="eyebrow">Task Control</p>
          <h1>Mission Tasks</h1>
          <p className="muted">
            Track every task with progress, ownership, and inline edits.
          </p>
        </div>
        <div className="task-stats">
          <div className="stat-chip">
            <span className="muted small">Total</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="stat-chip">
            <span className="muted small">Done</span>
            <strong>{summary.done}</strong>
          </div>
          <div className="stat-chip">
            <span className="muted small">Avg Progress</span>
            <strong>{summary.avgProgress}%</strong>
          </div>
          <span className={`status-pill ${status}`}>{status}</span>
        </div>
      </div>

      <div className="panel task-admin-panel">
        <div className="panel-header">
          <h3>Admin Control</h3>
          <span className={`status-pill ${isAdmin ? 'approved' : 'pending'}`}>
            {isAdmin ? 'unlocked' : 'read-only'}
          </span>
        </div>
        <p className="muted small">
          Tasks are auto-captured from chat. Manual add/edit/delete is restricted to the boss account.
        </p>
        <div className="task-actions">
          {isAdmin ? (
            <button
              className="ghost mini"
              onClick={() => {
                writeAdminToken('');
                setAdminToken('');
              }}
            >
              Lock Admin
            </button>
          ) : (
            <button
              className="accent mini"
              onClick={() => {
                const token = window.prompt('Enter admin token');
                if (token) {
                  writeAdminToken(token);
                  setAdminToken(token);
                }
              }}
            >
              Unlock Admin
            </button>
          )}
        </div>
      </div>

      <div className="tasks-layout">
        <section className={`panel task-form-panel ${isAdmin ? '' : 'read-only'}`.trim()}>
          <div className="panel-header">
            <h3>New Task</h3>
            <span className="status-pill queued">queue</span>
          </div>
          <div className="task-form">
            <input
              type="text"
              placeholder="Task title"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              disabled={!isAdmin}
            />
            <textarea
              rows="3"
              placeholder="Describe the work and desired outcome"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              disabled={!isAdmin}
            />
            <div className="task-form-row">
              <label className="control">
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  disabled={!isAdmin}
                >
                  {STATUS_OPTIONS.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control">
                <span>Priority</span>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                  disabled={!isAdmin}
                >
                  {PRIORITY_OPTIONS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="control">
              <span>Owner</span>
              <input
                type="text"
                value={form.owner}
                onChange={(e) => setForm((prev) => ({ ...prev, owner: e.target.value }))}
                disabled={!isAdmin}
              />
            </label>
            <label className="control">
              <span>Progress</span>
              <div className="range">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={form.progress}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, progress: Number(e.target.value) }))
                  }
                  disabled={!isAdmin}
                />
                <strong>{form.progress}%</strong>
              </div>
            </label>
            {error && <div className="task-error">{error}</div>}
            <button className="accent" onClick={createTask} disabled={!isAdmin}>
              Add Task
            </button>
          </div>
        </section>

        <div className="tasks-grid">
          {STATUS_OPTIONS.map((column) => (
            <section key={column.id} className="panel task-column">
              <div className="panel-header">
                <h3>{column.label}</h3>
                <span className={`status-pill ${column.id}`}>
                  {grouped[column.id]?.length || 0}
                </span>
              </div>
              <div className="task-list">
                {grouped[column.id]?.length === 0 && (
                  <p className="muted small">No tasks yet.</p>
                )}
                {grouped[column.id]?.map((task) => {
                  const isEditing = editingId === task.id;
                  return (
                    <div key={task.id} className={`task-card ${isEditing ? 'editing' : ''}`}>
                      <div className="task-card-header">
                        <strong>{task.title}</strong>
                        <span className={`status-pill ${task.status}`}>{formatStatus(task.status)}</span>
                      </div>
                      {isEditing ? (
                        <div className="task-edit">
                          <input
                            type="text"
                            value={editingDraft.title}
                            onChange={(e) =>
                              setEditingDraft((prev) => ({ ...prev, title: e.target.value }))
                            }
                          />
                          <textarea
                            rows="3"
                            value={editingDraft.description}
                            onChange={(e) =>
                              setEditingDraft((prev) => ({ ...prev, description: e.target.value }))
                            }
                          />
                          <div className="task-form-row">
                            <label className="control">
                              <span>Status</span>
                              <select
                                value={editingDraft.status}
                                onChange={(e) =>
                                  setEditingDraft((prev) => ({ ...prev, status: e.target.value }))
                                }
                              >
                                {STATUS_OPTIONS.map((entry) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="control">
                              <span>Priority</span>
                              <select
                                value={editingDraft.priority}
                                onChange={(e) =>
                                  setEditingDraft((prev) => ({ ...prev, priority: e.target.value }))
                                }
                              >
                                {PRIORITY_OPTIONS.map((level) => (
                                  <option key={level} value={level}>
                                    {level}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="control">
                            <span>Owner</span>
                            <input
                              type="text"
                              value={editingDraft.owner}
                              onChange={(e) =>
                                setEditingDraft((prev) => ({ ...prev, owner: e.target.value }))
                              }
                            />
                          </label>
                          <label className="control">
                            <span>Progress</span>
                            <div className="range">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={editingDraft.progress}
                                onChange={(e) =>
                                  setEditingDraft((prev) => ({
                                    ...prev,
                                    progress: Number(e.target.value),
                                  }))
                                }
                              />
                              <strong>{editingDraft.progress}%</strong>
                            </div>
                          </label>
                          <div className="task-actions">
                            <button className="accent mini" onClick={() => saveEdit(task.id)} disabled={!isAdmin}>
                              Save
                            </button>
                            <button className="ghost mini" onClick={cancelEdit}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="muted small">
                            {task.description || 'No description.'}
                          </p>
                          <div className="task-meta">
                            <span>Priority: {task.priority}</span>
                            <span>Owner: {task.owner}</span>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                          </div>
                          <div className="task-meta">
                            <span>{task.progress}% complete</span>
                            <span>{task.updatedAt ? new Date(task.updatedAt).toLocaleString() : '-'}</span>
                          </div>
                          <div className="task-actions">
                            <button className="ghost mini" onClick={() => startEdit(task)} disabled={!isAdmin}>
                              Edit
                            </button>
                            <button className="ghost mini" onClick={() => bumpProgress(task.id, 10)} disabled={!isAdmin}>
                              +10%
                            </button>
                            <button className="ghost mini" onClick={() => bumpProgress(task.id, -10)} disabled={!isAdmin}>
                              -10%
                            </button>
                            <button className="ghost mini" onClick={() => deleteTask(task.id)} disabled={!isAdmin}>
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
