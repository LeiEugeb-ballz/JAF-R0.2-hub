// Model Status Card Integration for Hub
// Displays current active model and fallback

interface ModelStatus {
  activeModel: string;
  fallbackModel: string;
  status: 'online' | 'offline' | 'degraded';
}

async function getModelStatus(): Promise<ModelStatus> {
  // In a real scenario, this would read from a shared state or API endpoint
  // that monitors the active model (e.g., model-monitor-simple.py output).
  // For now, we'll hardcode based on our confirmed setup.
  return {
    activeModel: "google/gemini-2.5-flash",
    fallbackModel: "ollama/llama3.2:latest",
    status: "online"
  };
}

// API endpoint to serve model status
export async function GET() {
  const status = await getModelStatus();
  return Response.json({ status });
}