# Minimal Frontend Research

## Current State
- Backend fully functional (26/26 tests passing)
- Frontend: empty folder
- Goal: Build minimal chat UI + dashboard

## Tech Stack

**Framework:** Vite + React + TypeScript
**Routing:** React Router v6
**Styling:** Tailwind CSS (no shadcn for MVP - keep it simple)
**State:** Vercel AI SDK `useChat` hook (handles message state + streaming automatically)
**Updates:** Streaming responses via AI SDK (no manual polling needed)

### Why AI SDK?

Our backend already uses `ai` package and returns responses in AI SDK format (`createUIMessageStreamResponse`), so we can use `useChat` hook on frontend which:
- Automatically manages message state
- Handles loading states
- Supports streaming responses
- Provides optimistic updates
- No manual fetch calls needed!

## What We're Building

### 1. Chat Page (`/`)
- Message list (scrollable)
- Input box + send button
- Loading state while agent responds

### 2. Dashboard Page (`/dashboard`)
- List of spawned agents (cards with name + description)
- Simple layout, no actions yet

## Backend Changes Needed

Add `GET /api/agents` endpoint to expose agent list:

```ts
// backend/index.ts
if (url.pathname === '/api/agents') {
  const id = env.INTERACTION_AGENT.idFromName('main');
  const stub = env.INTERACTION_AGENT.get(id);
  const agents = await stub.getAgents();
  return Response.json({ agents }, { headers: corsHeaders });
}
```

Add method in `InteractionAgent.ts`:

```ts
async getAgents() {
  const registry = await this.ctx.storage.get('agent_registry');
  return Object.values(registry ?? {});
}
```

## File Structure

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── index.html
├── .env.development
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── pages/
    │   ├── Chat.tsx
    │   └── Dashboard.tsx
    └── lib/
        └── api.ts
```

## Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "ai": "^5.0.68"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.2",
    "typescript": "^5.5.3",
    "tailwindcss": "^3.4.10",
    "postcss": "^8.4.41",
    "autoprefixer": "^10.4.20"
  }
}
```

## Implementation Steps

1. **Setup** (30 min): Create Vite project, install deps (including `ai` package), configure Tailwind
2. **Chat UI** (45 min): Use `useChat` hook, render messages, input box (much simpler than manual!)
3. **Dashboard** (30 min): Agent list from `/api/agents`
4. **Backend** (15 min): Add `/api/agents` endpoint + verify AI SDK compatibility
5. **Deploy** (15 min): Build and deploy to Cloudflare Pages

**Total: ~2 hours** (saved 30 min by using AI SDK)

## Out of Scope (V2)
- Real-time updates
- File explorer
- Markdown rendering
- Error boundaries
- Message persistence
- Advanced styling
