# Frontend + Backend Integration

## Architecture

```
User Browser
    ↓
Cloudflare Pages (React Frontend)
    ↓ API calls
Cloudflare Workers (Backend API)
    ↓
Durable Objects (Agents)
```

## Deployment Model

### Backend (Current)
- **What**: Cloudflare Workers + Durable Objects
- **Deploy**: `wrangler deploy`
- **Endpoint**: `https://medical-innovation-agent.<your-subdomain>.workers.dev`
- **Contains**: Interaction Agent, Research Agents, Tools

### Frontend (To Add)
- **What**: React SPA (Single Page App)
- **Deploy**: Cloudflare Pages (separate deployment)
- **Endpoint**: `https://medical-innovation-agent.pages.dev`
- **Contains**: Chat UI, Dashboard UI

## Development Workflow

### Local Development

**Backend:**
```bash
cd cf_ai_agent_demo
npm run dev
# Runs on http://localhost:8787
```

**Frontend (future):**
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
# Connects to backend at localhost:8787
```

### Production

**Backend:**
```bash
wrangler deploy
# Deploys Workers + Durable Objects
```

**Frontend:**
```bash
cd frontend
npm run build
wrangler pages deploy dist
# Deploys static React app to Pages
# Connects to production Worker
```

## API Communication

Frontend makes HTTP requests to backend:

```typescript
// Frontend React code
const response = await fetch('https://api.example.workers.dev/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' })
});
```

Backend handles via Worker:

```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env) {
    if (url.pathname === '/api/chat') {
      // Route to Durable Object
      return interactionAgent.fetch(request);
    }
  }
}
```

## Real-Time Updates

For dashboard real-time sync:

**Option 1: Server-Sent Events (SSE)**
- Backend sends events to frontend
- Simple, one-way communication
- Good for dashboard updates

**Option 2: WebSockets**
- Bidirectional communication
- More complex but more powerful
- Better for interactive features

## CORS Configuration

Backend already has CORS headers in `src/index.ts`:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
```

This allows frontend from any origin to call backend API.

## Why Separate Deployments?

1. **Specialization**: Workers for compute, Pages for static assets
2. **Performance**: Pages serves from edge with caching
3. **Cost**: Free tier for Pages (unlimited bandwidth)
4. **Simplicity**: Each deploys independently

## Future: Monorepo Option

Could use Cloudflare's monorepo pattern:

```
wrangler.toml:
- Workers config
- Pages config in same file
- Deploy both with one command
```

For MVP, keeping separate is simpler.

