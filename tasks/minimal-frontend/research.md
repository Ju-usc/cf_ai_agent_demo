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

## Backend Contract Deep Dive

- `routeAgentRequest` already exposes `/agents/interaction/:id` for chat; responses stream with `text/plain` and SSE semantics expected by `useChat`.
- Agent registry is persisted under Durable Object storage key `agent_registry`; entries match `AgentRegistryEntry` in `backend/types.ts` (id, name, description, timestamps).
- Existing CORS handling in `backend/index.ts` returns `*` origin for `GET/POST/OPTIONS`. Any new route must preserve the same headers to avoid blockers in local/dev Pages preview.
- Health check at `/health` confirms worker availability; useful for frontend startup guard.

## Frontend Integration Notes

- Base API URL should be configurable via `VITE_API_URL` to support local dev (`http://localhost:8787`) and future staging endpoints without code changes.
- `useChat` expects POSTing to `/agents/interaction/main/message`; the SDK appends `/message` automatically when using `api` prop set to `.../main`.
- Tailwind best practice: keep layout wrappers in `App.tsx`; page components focus on their main content to avoid duplicated shell markup.
- React Router v6 `BrowserRouter` works with Cloudflare Pages (supports pushState); ensure `vite.config.ts` sets `base` if we later deploy under subpath.

## Alternative Approaches Considered

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| `fetch` + manual state | Full control, no dependency | Requires manual streaming handling, optimistic updates, and tool-call parsing | Rejected for MVP |
| Redux / Zustand for chat state | Centralized state | Overkill for two pages, adds boilerplate | Defer |
| CSS-in-JS (e.g., Emotion) | Co-locate styles | Slower runtime, inconsistent with backend Tailwind usage | Reject |
| shadcn/ui | Prebuilt polished components | Setup overhead, theming work, import weight | Defer to V2 |

## Open Questions / Risks

1. **Agent registry shape**: confirm no nested objects beyond `description` to avoid extra parsing. Solution: log sample entry via Wrangler console before wiring frontend.
2. **Streaming Abort**: `useChat` `stop()` should abort Worker response; verify workers supports `AbortController` to prevent leaking durable execution.
3. **Tool Output Rendering**: Current InteractionAgent emits tool-call parts; need to ensure they serialize correctly (fallback to simple text indicator if shape changes).

## Testing References

- `tests/unit/tools.test.ts` validates tool execution pipeline; ensures backend tool metadata remains consistent with frontend expectations (e.g., `toolName`).
- `wrangler dev` supports `--persist-to` for Durable Objects; helpful when validating dashboard refresh retaining agents.
- Use `npm run build` inside `frontend/` to catch TS + Vite config errors; CI currently runs `npm run test` at root only, so local verification is required.
