import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });
const execPromise = promisify(exec);

const OPENCLAW_ENABLED = process.env.OPENCLAW_ENABLED === '1';
const GATEWAY_ENABLED = process.env.GATEWAY_ENABLED === '1';
const GATEWAY_ALLOWLIST = (process.env.GATEWAY_ALLOWLIST || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
const buildDir = path.join(__dirname, 'frontend', 'build');
app.use(express.static(buildDir)); // Serve React build

const agentsFile = path.join(__dirname, 'agents.json');
const tasksFile = path.join(__dirname, 'tasks.json');
const memoryFile = path.join(__dirname, 'qwen_mem.md');
const gatewayTasksFile = path.join(__dirname, 'gateway_tasks.json');

const HISTORY_START = '<!--CHAT_HISTORY_JSON';
const HISTORY_END = 'CHAT_HISTORY_JSON-->';
const MAX_HISTORY_CHARS = 200000;
const MAX_HISTORY_MESSAGES = 400;

// Load data
function loadData(file) {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file));
  return [];
}

function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function parseMemoryFile() {
  if (!fs.existsSync(memoryFile)) {
    return { notes: '', history: [] };
  }
  const text = fs.readFileSync(memoryFile, 'utf8');
  const match = text.match(/<!--CHAT_HISTORY_JSON([\s\S]*?)CHAT_HISTORY_JSON-->/);
  if (!match) {
    return { notes: text.trimEnd(), history: [] };
  }
  const notes = text.replace(match[0], '').trimEnd();
  let history = [];
  const jsonText = match[1].trim();
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) history = parsed;
    } catch (err) {
      history = [];
    }
  }
  return { notes, history };
}

function buildMemoryFile(notes, history) {
  const safeNotes = (notes ?? '').trimEnd();
  const historyBlock = `${HISTORY_START}\n${JSON.stringify(history, null, 2)}\n${HISTORY_END}`;
  const separator = safeNotes ? '\n\n' : '';
  return `${safeNotes}${separator}${historyBlock}\n`;
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = [];
  for (const item of history) {
    if (!item || typeof item.content !== 'string' || typeof item.role !== 'string') continue;
    const role = item.role;
    if (!['user', 'assistant', 'system'].includes(role)) continue;
    cleaned.push({
      id: item.id || uuidv4(),
      role,
      content: item.content,
      ts: typeof item.ts === 'number' ? item.ts : Date.now(),
    });
  }
  if (cleaned.length > MAX_HISTORY_MESSAGES) {
    cleaned.splice(0, cleaned.length - MAX_HISTORY_MESSAGES);
  }
  let total = 0;
  const trimmed = [];
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    const msg = cleaned[i];
    const len = msg.content.length + 64;
    if (total + len > MAX_HISTORY_CHARS) break;
    trimmed.push(msg);
    total += len;
  }
  return trimmed.reverse();
}

function loadMemoryNotes() {
  return parseMemoryFile().notes;
}

function loadChatHistory() {
  return parseMemoryFile().history;
}

function saveMemoryNotes(notes) {
  const { history } = parseMemoryFile();
  const fileText = buildMemoryFile(notes, history);
  fs.writeFileSync(memoryFile, fileText, 'utf8');
}

function saveChatHistory(history) {
  const { notes } = parseMemoryFile();
  const sanitized = sanitizeHistory(history);
  const fileText = buildMemoryFile(notes, sanitized);
  fs.writeFileSync(memoryFile, fileText, 'utf8');
  return sanitized;
}

function normalizeOllamaHost(value) {
  let host = (value || 'http://localhost:11434').trim();
  if (!/^https?:\/\//i.test(host)) {
    host = `http://${host}`;
  }
  try {
    const url = new URL(host);
    if (url.hostname === '0.0.0.0') url.hostname = '127.0.0.1';
    if (!url.port) url.port = '11434';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch (err) {
    return 'http://localhost:11434';
  }
}

function loadGatewayTasks() {
  return loadData(gatewayTasksFile);
}

function saveGatewayTasks(tasks) {
  saveData(gatewayTasksFile, tasks);
}

function isAllowedCommand(command) {
  if (!GATEWAY_ALLOWLIST.length) return false;
  return GATEWAY_ALLOWLIST.some((prefix) => command.startsWith(prefix));
}

// API Endpoints
app.get('/api/agents', (req, res) => res.json(loadData(agentsFile)));
app.post('/api/agents', (req, res) => {
  const agents = loadData(agentsFile);
  const newAgent = { ...req.body, id: uuidv4(), status: 'online' };
  agents.push(newAgent);
  saveData(agentsFile, agents);
  res.json(newAgent);
});

app.get('/api/tasks', (req, res) => res.json(loadData(tasksFile)));
app.post('/api/tasks', (req, res) => {
  const tasks = loadData(tasksFile);
  const newTask = { ...req.body, id: uuidv4(), priority: 'medium', column: 'todo' };
  tasks.push(newTask);
  saveData(tasksFile, tasks);
  res.json(newTask);
});

app.get('/api/memory', (req, res) => {
  res.json({ memory: loadMemoryNotes() });
});

app.post('/api/memory', (req, res) => {
  const memory = typeof req.body?.memory === 'string' ? req.body.memory : '';
  if (memory.length > 100000) {
    res.status(413).json({ error: 'Memory too large (limit 100k chars)' });
    return;
  }
  saveMemoryNotes(memory);
  res.json({ ok: true });
});

app.get('/api/chat-history', (req, res) => {
  res.json({ history: loadChatHistory() });
});

app.post('/api/chat-history', (req, res) => {
  const history = req.body?.history;
  const saved = saveChatHistory(history);
  res.json({ ok: true, history: saved });
});

app.get('/api/gateway/health', (req, res) => {
  res.json({
    enabled: GATEWAY_ENABLED,
    allowlist: GATEWAY_ALLOWLIST,
  });
});

app.get('/api/gateway/tasks', (req, res) => {
  res.json(loadGatewayTasks());
});

app.post('/api/gateway/tasks', (req, res) => {
  const tasks = loadGatewayTasks();
  const {
    label = 'Untitled task',
    command = '',
    kind = 'shell',
    scope = 'external',
  } = req.body || {};
  const normalizedScope = scope === 'embedded' ? 'embedded' : 'external';
  const gatewayBypassed = !GATEWAY_ENABLED;
  const newTask = {
    id: uuidv4(),
    label: String(label),
    command: String(command),
    kind,
    scope: normalizedScope,
    status: gatewayBypassed ? 'queued' : normalizedScope === 'external' ? 'pending' : 'queued',
    approved: gatewayBypassed ? true : normalizedScope === 'embedded',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastRunAt: null,
    output: '',
    error: '',
  };
  tasks.unshift(newTask);
  saveGatewayTasks(tasks);
  res.json(newTask);
});

app.post('/api/gateway/tasks/:id/approve', (req, res) => {
  const tasks = loadGatewayTasks();
  const task = tasks.find((item) => item.id === req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  task.approved = true;
  task.status = 'approved';
  task.updatedAt = Date.now();
  saveGatewayTasks(tasks);
  res.json({ ok: true, task });
});

app.post('/api/gateway/tasks/:id/deny', (req, res) => {
  const tasks = loadGatewayTasks();
  const task = tasks.find((item) => item.id === req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  task.approved = false;
  task.status = 'denied';
  task.updatedAt = Date.now();
  saveGatewayTasks(tasks);
  res.json({ ok: true, task });
});

app.post('/api/gateway/tasks/:id/run', async (req, res) => {
  const tasks = loadGatewayTasks();
  const task = tasks.find((item) => item.id === req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  if (GATEWAY_ENABLED && task.scope === 'external' && !task.approved) {
    task.status = 'pending';
    task.error = 'Awaiting approval';
    task.updatedAt = Date.now();
    saveGatewayTasks(tasks);
    res.status(403).json({ error: 'Task not approved', task });
    return;
  }
  if (GATEWAY_ENABLED && task.scope === 'external' && !isAllowedCommand(task.command)) {
    task.status = 'blocked';
    task.error = 'Command not in allowlist';
    task.updatedAt = Date.now();
    saveGatewayTasks(tasks);
    res.status(403).json({ error: 'Command not allowed', task });
    return;
  }
  task.status = 'running';
  task.updatedAt = Date.now();
  saveGatewayTasks(tasks);
  try {
    const { stdout, stderr } = await execPromise(task.command, {
      timeout: 20000,
      windowsHide: true,
    });
    task.status = 'done';
    task.output = stdout || '';
    task.error = stderr || '';
    task.updatedAt = Date.now();
    task.lastRunAt = Date.now();
    saveGatewayTasks(tasks);
    res.json({ ok: true, task });
  } catch (err) {
    task.status = 'error';
    task.error = err.message;
    task.updatedAt = Date.now();
    task.lastRunAt = Date.now();
    saveGatewayTasks(tasks);
    res.status(500).json({ error: err.message, task });
  }
});

app.get('/api/ollama/tags', async (req, res) => {
  const host = normalizeOllamaHost(process.env.OLLAMA_HOST);
  try {
    const upstream = await fetch(`${host}/api/tags`);
    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(upstream.status).json({ error: 'Ollama error', detail });
      return;
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Ollama', detail: err.message });
  }
});

app.get('/api/openclaw/health', (req, res) => {
  res.json({ enabled: OPENCLAW_ENABLED });
});

app.get('/api/openclaw/status', async (req, res) => {
  if (!OPENCLAW_ENABLED) {
    res.status(503).json({ enabled: false });
    return;
  }
  try {
    const { stdout, stderr } = await execPromise('openclaw status --json', {
      timeout: 8000,
      windowsHide: true,
    });
    if (stderr) {
      res.status(500).json({ enabled: true, error: stderr.trim() });
      return;
    }
    res.json({ enabled: true, data: JSON.parse(stdout) });
  } catch (err) {
    res.status(500).json({ enabled: true, error: err.message });
  }
});

app.get('/api/openclaw/sessions', async (req, res) => {
  if (!OPENCLAW_ENABLED) {
    res.status(503).json({ enabled: false });
    return;
  }
  try {
    const { stdout, stderr } = await execPromise('openclaw sessions --json', {
      timeout: 8000,
      windowsHide: true,
    });
    if (stderr) {
      res.status(500).json({ enabled: true, error: stderr.trim() });
      return;
    }
    res.json({ enabled: true, data: JSON.parse(stdout) });
  } catch (err) {
    res.status(500).json({ enabled: true, error: err.message });
  }
});

// Ollama chat proxy
app.post('/api/chat', async (req, res) => {
  const {
    model = 'qwen2.5',
    messages = [],
    stream = true,
    options = {},
  } = req.body || {};

  const host = normalizeOllamaHost(process.env.OLLAMA_HOST);
  const controller = new AbortController();
  const abortUpstream = () => controller.abort();
  req.on('aborted', abortUpstream);
  res.on('close', () => {
    if (!res.writableEnded) abortUpstream();
  });

  let upstream;
  try {
    upstream = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream, options }),
      signal: controller.signal,
    });
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Ollama', detail: err.message });
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text();
    res.status(upstream.status).json({ error: 'Ollama error', detail });
    return;
  }

  if (!stream) {
    const data = await upstream.json();
    res.json(data);
    return;
  }

  if (!upstream.body) {
    res.status(502).json({ error: 'Ollama returned no stream body' });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let done = false;

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      res.write(decoder.decode(value));
    }
  }

  res.end();
});

// SPA fallback for React Router
app.get('*', (req, res) => {
  const indexFile = path.join(buildDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
    return;
  }
  res.status(404).send('Frontend build not found. Run the frontend build first.');
});

// Real-time updates
io.on('connection', (socket) => {
  socket.on('register-agent', (agent) => {
    const agents = loadData(agentsFile);
    const existing = agents.find(a => a.id === agent.id);
    if (existing) existing.status = 'online';
    else agents.push({ ...agent, status: 'online' });
    saveData(agentsFile, agents);
    io.emit('agents-update', agents);
  });
  socket.on('task-move', (data) => {
    const tasks = loadData(tasksFile);
    const task = tasks.find(t => t.id === data.taskId);
    if (task) task.column = data.newColumn;
    saveData(tasksFile, tasks);
    io.emit('tasks-update', tasks);
  });
  socket.on('message', (msg) => io.emit('message', msg)); // Chat placeholder
});

const PORT = Number.parseInt(process.env.PORT, 10) || 3002;
server.listen(PORT, () => console.log(`Hub running on http://localhost:${PORT}`));
