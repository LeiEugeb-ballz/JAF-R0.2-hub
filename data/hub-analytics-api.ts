// hub-analytics-api.ts

import { exec } from 'child_process';
import { promisify } from 'util';

// Promisify exec for async/await usage
const execPromise = promisify(exec);

export default async function getAnalyticsData() {
  try {
    // Run openclaw status command
    const { stdout, stderr } = await execPromise('openclaw status --json');

    if (stderr) {
      console.error('openclaw status error:', stderr);
      return new Response(JSON.stringify({ analytics: { error: stderr } }), { status: 500 });
    }

    const statusData = JSON.parse(stdout);

    // Parse session data
    const { sessions } = await execPromise('openclaw sessions --json');
    const parsedSessions = JSON.parse(sessions);
    const totalSessions = parsedSessions.count || 0;
    const activeSessions = parsedSessions.sessions.filter((s: any) => 
      s.status !== 'inactive'
    ).length;

    // Object for frontend
    const analytics = {
      totalSessions,
      activeSessions,
      totalTokensUsed: statusData.tokens?.in + statusData.tokens?.out || 0,
      uptime: statusData.uptime || 0
    };

    return new Response(JSON.stringify({ analytics }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed to fetch OpenClaw analytics:', error);
    return new Response(JSON.stringify({ 
      analytics: { error: 'Could not fetch session data' } 
    }), {
      status: 500
    });
  }
}