# JAF-R0.2 Hub

Agent Command Center with real-time dashboard, task management, and primary chat interface.

## Setup
```bash
npm install
cd frontend && npm install && npm run build
cd ..
node server.js
```

Access at http://localhost:3002

## Ollama Chat
This hub proxies chat requests to a local Ollama runtime. Make sure Ollama is running and the model is pulled:
```bash
ollama serve
ollama pull qwen2.5:7b-instruct
```
You can override the Ollama host by setting `OLLAMA_HOST` when starting the server.

## Persistent Memory
The chat UI stores persistent memory in `qwen_mem.md`. Use the "Persistent Memory" panel and click "Save Memory".
This memory is injected into the system prompt when "Use memory" is enabled.

## Antigravity Mode
Antigravity mode nudges the model to provide best-effort answers with code and steps instead of refusing.

## Conversation Persistence
Chat history is persisted to `qwen_mem.md` and reloaded on next launch. This keeps continuity across model switches,
subject to each model's context length.

## Model Dropdown
The chat UI exposes a dropdown of Ollama models (including cloud-backed models managed by Ollama).
External providers (OpenRouter, Kilo.ai, Togetherness, Gemini) are listed but disabled until wired.
The UI fetches availability from `/api/ollama/tags`.

## Chat State Persistence
Chat state (messages, model choice, prompt, toggles) is cached locally so switching tabs/routes does not reset the chat.
History is still persisted to `qwen_mem.md`.

## OpenClaw Endpoints (Optional)
OpenClaw is integrated but disabled by default. To enable:
```bash
set OPENCLAW_ENABLED=1
node server.js
```
Endpoints:
- `/api/openclaw/health`
- `/api/openclaw/status`
- `/api/openclaw/sessions`

## Gateway (External Tool Runner)
The gateway queues external commands so all tool execution flows through the hub.
Gateway on: external commands must be approved and allowlisted.
Gateway off: all rights are enabled (no approval checks).
Embedded tasks are pre-approved (for tools integrated into the hub).
```bash
set GATEWAY_ENABLED=1
set GATEWAY_ALLOWLIST=ollama,openclaw,python,cmd /c
node server.js
```
Endpoints:
- `/api/gateway/health`
- `/api/gateway/tasks`
- `/api/gateway/tasks/:id/approve`
- `/api/gateway/tasks/:id/deny`
- `/api/gateway/tasks/:id/run`
