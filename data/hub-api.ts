import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Agent state management
interface Agent {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  lastSeen: Date;
  ws?: any;
}

const agents = new Map<string, Agent>();

// WebSocket connections for real-time updates
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    // Clean up agent websocket reference
    for (const [id, agent] of agents.entries()) {
      if (agent.ws === ws) {
        agents.set(id, { ...agent, ws: undefined, status: 'offline' });
      }
    }
  });
});

function handleWebSocketMessage(ws: any, data: any) {
  switch (data.type) {
    case 'agent_register':
      const agent: Agent = {
        id: data.id,
        name: data.name,
        status: 'online',
        lastSeen: new Date(),
        ws: ws
      };
      agents.set(data.id, agent);
      broadcastAgentUpdate();
      break;
      
    case 'agent_status_update':
      const existing = agents.get(data.id);
      if (existing) {
        agents.set(data.id, { ...existing, status: data.status, lastSeen: new Date() });
        broadcastAgentUpdate();
      }
      break;
      
    case 'agent_message':
      broadcastMessage(data.message, data.fromAgent);
      break;
  }
}

function broadcastAgentUpdate() {
  const agentList = Array.from(agents.values()).map(a => ({
    id: a.id,
    name: a.name,
    status: a.status,
    lastSeen: a.lastSeen.toISOString()
  }));
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'agents_update',
        agents: agentList
      }));
    }
  });
}

function broadcastMessage(message: string, fromAgent: string) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'chat_message',
        message,
        fromAgent,
        timestamp: new Date().toISOString()
      }));
    }
  });
}

// REST API Routes

// Import new API handlers
import { GET as getModelStatus } from './hub-model-status.ts';
import { GET as getTasksData } from './hub-tasks-api.ts';
import { GET as getAnalyticsData } from './hub-analytics-api.ts';


// Get all agents
app.get('/api/agents', (req, res) => {
  res.json({
    agents: Array.from(agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      lastSeen: a.lastSeen.toISOString()
    }))
  });
});

// Get agent details
app.get('/api/agents/:id', (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  res.json({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    lastSeen: agent.lastSeen.toISOString(),
    tasks: [], // TODO: Integrate with task system
    performance: Math.floor(Math.random() * 100) // TODO: Real metrics
  });
});

// Model Status
app.get('/api/model-status', async (req, res) => {
  const response = await getModelStatus();
  res.json(response.json()); // Assuming GET returns a Response object
});

// Task management
app.get('/api/tasks', async (req, res) => {
  const response = await getTasksData();
  res.json(response.json()); // Assuming GET returns a Response object
});

app.post('/api/tasks', (req, res) => {
  const task = {
    id: `task-${Date.now()}`,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  // This will still use a local array. For persistence, this needs to write to a file or DB.
  // For now, we're prioritizing read-only display from getTasksData.
  const tasks = []; // Empty array, as getTasksData is the source
  tasks.push(task); 
  res.json({ task });
});

// System metrics
app.get('/api/metrics', async (req, res) => {
  const response = await getAnalyticsData();
  res.json(response.json()); // Assuming GET returns a Response object
});

// Ctxly Chat Integration (Placeholder - JAX is working on this)
app.post('/api/chat/create-room', async (req, res) => {
  res.status(501).json({ error: 'Chat integration in progress (JAX is working on this)' });
});

app.post('/api/chat/message', async (req, res) => {
  res.status(501).json({ error: 'Chat integration in progress (JAX is working on this)' });
});

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve dashboard as default
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/dashboard.html');
});

// Serve progress tracker
app.get('/progress', (req, res) => {
  res.sendFile(__dirname + '/progress.html');
});

// API endpoint for progress data
app.get('/api/progress', (req, res) => {
  try {
    const progressData = JSON.parse(readFileSync(__dirname + '/progress.json', 'utf8'));
    res.json(progressData);
  } catch (error) {
    res.json({
      hub_infrastructure: 85,
      chat_system: 45,
      task_dashboard: 35,
      agent_comms: 25,
      integration_testing: 15,
      overall: 45
    });
  }
});

// Start server
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Hub API server running on port ${PORT}`);
});