# Minimal Frontend Implementation Plan

## Overview

Build a minimal but clean frontend for the Medical Innovation Agent using Vite + React + TypeScript + Tailwind CSS + AI SDK. Focus on Chat page first, then Dashboard.

**Key Technologies:**
- **Vite**: Fast build tool with React TypeScript template
- **AI SDK `useChat`**: Handles streaming, message state, loading states automatically
- **Tailwind CSS**: Utility-first styling for clean, professional UI
- **React Router**: Client-side routing between pages

**Backend Compatibility:**
- Our backend already uses `createUIMessageStreamResponse()` - 100% compatible with AI SDK `useChat`
- Only needs one new endpoint: `GET /api/agents` for dashboard

---

## Goals

### Primary Goals
✅ User can chat with Interaction Agent
✅ Messages stream in real-time
✅ Clean, professional UI (Tailwind)
✅ Loading states and detailed error handling
✅ Dashboard shows list of research agents

### Non-Goals (V2)
- Message persistence (lost on refresh for MVP)
- Real-time dashboard updates (manual refresh button)
- Deployment to Cloudflare Pages (local only)
- Advanced features (file explorer, triggers UI, etc.)

---

## Architecture

### File Structure

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── .env.development
└── src/
    ├── main.tsx              # Entry point (imports App + CSS)
    ├── App.tsx               # Router setup + layout
    ├── index.css             # Tailwind directives
    ├── pages/
    │   ├── Chat.tsx          # Chat interface with useChat
    │   └── Dashboard.tsx     # Agent list with manual refresh
    └── lib/
        └── api.ts            # API client utilities (optional)
```

### Component Hierarchy

```
App (Router + Nav)
├── Chat Page
│   ├── Message List (scrollable)
│   │   └── Message Bubbles (user/assistant)
│   └── Input Form
│       ├── Textarea
│       ├── Send Button
│       └── Status Indicator
└── Dashboard Page
    ├── Header + Refresh Button
    └── Agent Grid
        └── Agent Cards
```

---

## Implementation Phases

### Phase 1: Project Setup (20 min)

**Goal:** Initialize Vite + React + TypeScript + Tailwind

#### 1.1 Create Vite Project
```bash
cd /Users/juyounglee/Desktop/Projects/cf_ai_agent_demo
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

#### 1.2 Install Dependencies
```bash
# Core deps
npm install ai react-router-dom

# Dev deps
npm install -D tailwindcss postcss autoprefixer
```

**Dependencies Summary:**
```json
{
  "dependencies": {
    "ai": "^5.0.68",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.3",
    "vite": "^5.4.2"
  }
}
```

#### 1.3 Initialize Tailwind
```bash
npx tailwindcss init -p
```

This creates:
- `tailwind.config.js`
- `postcss.config.js`

#### 1.4 Configure Tailwind

**`tailwind.config.js`:**
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

#### 1.5 Add Tailwind Directives

**`src/index.css`** (replace content with):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### 1.6 Environment Variables

**`.env.development`:**
```env
VITE_API_URL=http://localhost:8787
```

**Access in code:**
```ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
```

#### 1.7 Cleanup Vite Boilerplate

Delete:
- `src/App.css`
- `src/assets/` folder (optional)

Update `src/main.tsx` to only import `index.css`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Verification:**
```bash
npm run dev
# Should open on http://localhost:5173
# Should see blank page (no errors in console)
```

---

### Phase 2: Chat Page Implementation (30-45 min)

**Goal:** Working chat interface with streaming responses

#### 2.1 Create Chat Page Component

**`src/pages/Chat.tsx`:**

```tsx
import { useChat } from '@ai-sdk/react';
import { useState, useRef, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export default function Chat() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, stop } = useChat({
    api: `${API_URL}/agents/interaction/main`,
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed && status === 'ready') {
      sendMessage(trimmed);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg">Welcome to Medical Innovation Agent</p>
            <p className="text-sm mt-2">Ask me anything about medical research</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-2xl rounded-lg px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
              {message.parts.map((part, index) => {
                if (part.type === 'text') {
                  return (
                    <div key={index} className="whitespace-pre-wrap">
                      {part.text}
                    </div>
                  );
                }
                if (part.type === 'tool-call') {
                  return (
                    <div key={index} className="text-sm italic opacity-75 mt-2">
                      🔧 Using tool: {part.toolName}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-semibold">Error occurred</p>
            <p className="text-red-600 text-sm mt-1">
              {error.message.includes('fetch')
                ? 'Network error. Is the backend running?'
                : error.message.includes('timeout')
                ? 'Request timed out. Please try again.'
                : 'Something went wrong. Please try again.'}
            </p>
          </div>
        )}

        {/* Loading Indicator */}
        {status === 'streaming' && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            disabled={status === 'streaming' || status === 'submitted'}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
            rows={3}
          />
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={!input.trim() || status === 'streaming' || status === 'submitted'}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'streaming' || status === 'submitted' ? 'Sending...' : 'Send'}
            </button>
            {status === 'streaming' && (
              <button
                type="button"
                onClick={stop}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Stop
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
```

**Key Features:**
- ✅ `useChat` hook handles message state + streaming
- ✅ Auto-scroll to latest message
- ✅ Detailed error messages (network, timeout, generic)
- ✅ Loading indicator with animated dots
- ✅ Disabled state during streaming
- ✅ Stop button to abort streaming
- ✅ Tool call indicators (shows when agent uses tools)
- ✅ Keyboard shortcuts (Enter to send, Shift+Enter for newline)

#### 2.2 Testing Chat

**Test Plan:**
1. Start backend: `npm run dev` (from root)
2. Start frontend: `npm run dev` (from frontend/)
3. Send message: "Hello"
4. Verify: Response streams in
5. Send message: "Research DMD treatments"
6. Verify: Tool calls show, agent creates research agent
7. Test errors: Stop backend, send message, verify error shown

---

### Phase 3: Dashboard Page (20-30 min)

**Goal:** Display list of research agents with manual refresh

#### 3.1 Create Dashboard Component

**`src/pages/Dashboard.tsx`:**

```tsx
import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

interface Agent {
  id: string;
  name: string;
  description: string;
  createdAt?: number;
  lastActive?: number;
}

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/agents`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Research Agents</h1>
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-semibold">Error loading agents</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <button
              onClick={fetchAgents}
              className="mt-3 text-sm text-red-700 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading agents...</div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && agents.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-600 text-lg">No research agents yet</p>
            <p className="text-gray-500 text-sm mt-2">
              Go to the chat and ask the Interaction Agent to research something!
            </p>
          </div>
        )}

        {/* Agent Grid */}
        {!loading && !error && agents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  {agent.name}
                </h2>
                <p className="text-gray-600 mb-4">{agent.description}</p>
                <div className="text-xs text-gray-500 space-y-1">
                  <div>
                    <span className="font-medium">Created:</span>{' '}
                    {formatTimestamp(agent.createdAt)}
                  </div>
                  <div>
                    <span className="font-medium">Last Active:</span>{' '}
                    {formatTimestamp(agent.lastActive)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Agent Count */}
        {!loading && !error && agents.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-500">
            Total: {agents.length} agent{agents.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Key Features:**
- ✅ Manual refresh button
- ✅ Loading, error, and empty states
- ✅ Responsive grid layout (1/2/3 columns)
- ✅ Agent metadata (created, last active)
- ✅ Clean card design with hover effects

---

### Phase 4: Routing & Layout (15 min)

**Goal:** Navigation between Chat and Dashboard

#### 4.1 Update App Component

**`src/App.tsx`:**

```tsx
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';

function Navigation() {
  const location = useLocation();

  return (
    <nav className="bg-gray-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold">Medical Innovation Agent</h1>
            <div className="flex space-x-4">
              <Link
                to="/"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                Chat
              </Link>
              <Link
                to="/dashboard"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/dashboard'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
```

**Key Features:**
- ✅ Top navigation bar with active state
- ✅ Two routes: `/` (Chat) and `/dashboard`
- ✅ Responsive layout
- ✅ Consistent styling across pages

---

### Phase 5: Backend Changes (10 min)

**Goal:** Add `/api/agents` endpoint

#### 5.1 Add Endpoint to Worker

**`backend/index.ts`** (add before health check):

```ts
// List all agents
if (url.pathname === '/api/agents') {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === 'GET') {
    const id = env.INTERACTION_AGENT.idFromName('main');
    const stub = env.INTERACTION_AGENT.get(id);
    
    try {
      const agents = await stub.getAgents();
      return Response.json({ agents }, { headers: corsHeaders });
    } catch (error) {
      console.error('Failed to get agents:', error);
      return Response.json(
        { error: 'Failed to fetch agents' },
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return Response.json(
    { error: 'Method not allowed' },
    { status: 405, headers: corsHeaders }
  );
}
```

#### 5.2 Add Method to InteractionAgent

**`backend/agents/InteractionAgent.ts`** (add to class):

```ts
/**
 * Get all research agents from registry (for dashboard)
 */
async getAgents() {
  const registry = await this.ctx.storage.get<Record<string, AgentRegistryEntry>>('agent_registry');
  if (!registry) {
    return [];
  }
  return Object.values(registry).map(({ id, name, description, createdAt, lastActive }) => ({
    id,
    name,
    description,
    createdAt,
    lastActive,
  }));
}
```

#### 5.3 Update Type Imports

Make sure `AgentRegistryEntry` is imported/defined:

```ts
// backend/types.ts (if not already there)
export interface AgentRegistryEntry {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  lastActive: number;
}
```

#### 5.4 Test Backend Endpoint

```bash
# Start backend
npm run dev

# Test in another terminal
curl http://localhost:8787/api/agents

# Should return: {"agents":[]}  (or list of agents)
```

---

### Phase 6: Integration Testing (15 min)

**Goal:** Verify end-to-end functionality

#### 6.1 Test Chat Flow

1. ✅ Start backend: `npm run dev` (root)
2. ✅ Start frontend: `cd frontend && npm run dev`
3. ✅ Open http://localhost:5173
4. ✅ See empty chat with welcome message
5. ✅ Type: "Hello"
6. ✅ Verify: Response streams in, no errors
7. ✅ Type: "Research new treatments for Duchenne muscular dystrophy"
8. ✅ Verify: Tool calls shown, agent created message
9. ✅ Check: No console errors

#### 6.2 Test Dashboard

1. ✅ Click "Dashboard" in nav
2. ✅ Verify: Shows "No agents yet" (if none created)
3. ✅ Go back to Chat, create agent (see 6.1 step 7)
4. ✅ Go to Dashboard, click Refresh
5. ✅ Verify: Agent appears in grid with name, description
6. ✅ Verify: Timestamps shown correctly

#### 6.3 Test Error Handling

**Network Error:**
1. Stop backend
2. Try to send chat message
3. Verify: "Network error. Is the backend running?" shown
4. Try dashboard refresh
5. Verify: Error message with retry button

**Backend Error:**
1. Start backend
2. Temporarily break backend (e.g., throw error in handler)
3. Send message
4. Verify: Generic error shown (not server details)

#### 6.4 Test UI States

**Chat:**
- ✅ Empty state (welcome message)
- ✅ Loading state (animated dots)
- ✅ Error state (red banner)
- ✅ Disabled inputs during streaming
- ✅ Stop button appears when streaming

**Dashboard:**
- ✅ Loading state (spinner)
- ✅ Empty state (helpful message)
- ✅ Error state (with retry)
- ✅ Populated state (agent cards)

---

## Success Criteria

### Functional Requirements
✅ User can type and send messages in chat
✅ Agent responses stream in real-time
✅ Tool calls are visible to user
✅ Messages render correctly (user vs assistant)
✅ Dashboard shows list of research agents
✅ Dashboard can be manually refreshed
✅ Navigation works between pages

### UI/UX Requirements
✅ Clean, professional design (Tailwind)
✅ Responsive layout (works 1920px and 1440px desktop)
✅ Loading states shown appropriately
✅ Detailed error messages (network, server, timeout)
✅ Empty states with helpful guidance
✅ No console errors in browser

### Technical Requirements
✅ TypeScript with no type errors
✅ Uses AI SDK `useChat` hook correctly
✅ Backend endpoint `/api/agents` works
✅ CORS headers allow frontend requests
✅ Environment variables configured properly

---

## Testing Checklist

Before marking complete, verify:

- [ ] `npm run dev` works for both backend and frontend
- [ ] Can send chat message and get streaming response
- [ ] Tool calls render correctly (shows "Using tool: ...")
- [ ] Stop button works (aborts stream)
- [ ] Dashboard shows agents after they're created
- [ ] Refresh button updates agent list
- [ ] Error states render with helpful messages
- [ ] No console errors (React warnings OK)
- [ ] No TypeScript errors (`npm run build` passes)

---

## Timeline Estimate

| Phase | Task | Time |
|-------|------|------|
| 1 | Project setup (Vite, deps, Tailwind) | 20 min |
| 2 | Chat page implementation | 30-45 min |
| 3 | Dashboard page | 20-30 min |
| 4 | Routing & layout | 15 min |
| 5 | Backend endpoint | 10 min |
| 6 | Integration testing | 15 min |
| **Total** | | **~2 hours** |

---

## Troubleshooting

### Common Issues

**Issue: "useChat is not a function"**
- Fix: Import from `@ai-sdk/react` not `ai`
- Correct: `import { useChat } from '@ai-sdk/react';`

**Issue: CORS errors in browser**
- Fix: Verify backend has CORS headers on ALL routes
- Check: `Access-Control-Allow-Origin: *` in response headers

**Issue: Messages not streaming**
- Fix: Verify backend returns `createUIMessageStreamResponse()`
- Check: Response has `Content-Type: text/plain; charset=utf-8`

**Issue: Tailwind styles not applying**
- Fix: Check `content` paths in `tailwind.config.js`
- Verify: Includes `"./src/**/*.{js,ts,jsx,tsx}"`
- Restart: `npm run dev` after config changes

**Issue: `/api/agents` returns 404**
- Fix: Check backend routing order (before health check)
- Verify: `url.pathname === '/api/agents'` exact match

---

## Next Steps (V2 Features)

After MVP is working, consider:

1. **Message Persistence**: Store in Durable Object storage
2. **Real-time Dashboard**: WebSocket or polling for live updates
3. **Markdown Rendering**: Use `react-markdown` for formatted agent responses
4. **File Explorer**: Browse agent file systems
5. **Trigger Management**: UI for creating/viewing scheduled triggers
6. **Authentication**: User accounts with personalized history
7. **Deployment**: Deploy to Cloudflare Pages with CI/CD

---

## Questions to Resolve During Implementation

1. Should agent cards on dashboard be clickable? (e.g., view details, message agent)
2. Do we want keyboard shortcuts in chat? (e.g., Cmd+K to clear)
3. Should we add a "Clear chat" button?
4. Any specific branding/colors to use instead of default blue?

These can be decided during implementation based on UX feel.

---

## Files Modified/Created

**New Files:**
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/tsconfig.json`
- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `frontend/index.html`
- `frontend/.env.development`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/index.css`
- `frontend/src/pages/Chat.tsx`
- `frontend/src/pages/Dashboard.tsx`

**Modified Files:**
- `backend/index.ts` (add `/api/agents` endpoint)
- `backend/agents/InteractionAgent.ts` (add `getAgents()` method)
- `backend/types.ts` (export `AgentRegistryEntry` if needed)

---

## Resources

- AI SDK Docs: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
- Tailwind CSS: https://tailwindcss.com/docs
- React Router: https://reactrouter.com/en/main
- Vite: https://vitejs.dev/guide/

---

**Ready to implement! Start with Phase 1 setup.**
