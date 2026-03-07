import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3002');

function Dashboard() {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    fetch('/api/agents').then(res => res.json()).then(setAgents);
    socket.on('agents-update', setAgents);
    return () => socket.off('agents-update');
  }, []);

  return (
    <div className="dashboard">
      <h1>JAF-R0.2 Hub</h1>
      <div className="agents">
        {agents.map(agent => (
          <div key={agent.id} className={`agent-card ${agent.status}`}>
            <p>{agent.name} ({agent.status})</p>
          </div>
        ))}
      </div>
      <button onClick={() => alert('Quick Action')}>Action</button>
    </div>
  );
}

export default Dashboard;