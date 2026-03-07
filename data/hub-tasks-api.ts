
// hub-tasks-api.ts

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Define the structure for an OpenClaw session
interface OpenClawSession {
  id: string;
  kind: string;
  status: string;
  model: string;
  tokenUsage: {
    total: number;
    prompt: number;
    completion: number;
  };
  lastActivity: string; // ISO 8601 string
}

export default async function (fastify: FastifyInstance) {
  fastify.get('/api/openclaw-tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    // In a real implementation, this would call OpenClaw's sessions_list
    // For now, we'll return mock data or integrate with a direct call to the OpenClaw API
    // The actual integration would involve calling process(action='list') and parsing its output.
    
    // Placeholder for actual session data retrieval
    // Example: const sessions = await default_api.process(action='list');
    // Then parse 'sessions' to match the OpenClawSession interface

    const mockSessions: OpenClawSession[] = [
      {
        id: 'mock-session-123',
        kind: 'agent',
        status: 'running',
        model: 'gemini-2.5-flash',
        tokenUsage: {
          total: 1500,
          prompt: 1000,
          completion: 500,
        },
        lastActivity: new Date().toISOString(),
      },
      {
        id: 'mock-session-456',
        kind: 'user-script',
        status: 'paused',
        model: 'none',
        tokenUsage: {
          total: 300,
          prompt: 200,
          completion: 100,
        },
        lastActivity: new Date(Date.now() - 60000 * 5).toISOString(), // 5 minutes ago
      },
    ];

    reply.send(mockSessions);
  });
}
