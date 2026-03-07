const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend/build'))); // Serve React build

const agentsFile = path.join(__dirname, 'agents.json');
const tasksFile = path.join(__dirname, 'tasks.json');

// Load data
function loadData(file) {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file));
  return [];
}

function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
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
  saveData(tasksFile, newTask);
  res.json(newTask);
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

const PORT = 3002;
server.listen(PORT, () => console.log(`Hub running on http://localhost:${PORT}`));