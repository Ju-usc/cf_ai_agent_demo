# Comprehensive Frontend Research

Based on NIA tools research + documentation analysis

---

## 1. AI SDK `useChat` Implementation

### Key Findings from Official Docs

**Perfect Match with Our Backend:**
- Our backend already uses `createUIMessageStreamResponse()` which is 100% compatible with `useChat`
- The hook expects API endpoint that returns `UIMessageStream` format
- Our `/agents/interaction/main` endpoint already returns this format!

**Core Features:**
```tsx
const {
  messages,        // Auto-managed message array
  status,          // 'submitted' | 'streaming' | 'ready' | 'error'
  error,           // Error object if request fails
  sendMessage,     // Function to send messages
  stop,            // Abort current stream
  regenerate,      // Regenerate last message
  setMessages,     // Manually update messages
} = useChat({
  api: '/agents/interaction/main',  // Our backend endpoint!
  onFinish: (options) => {
    // Called when assistant response completes
  },
  onError: (error) => {
    // Handle errors
  },
});
```

### Message Rendering Pattern

AI SDK 5.0 uses **`message.parts`** (not `message.content`):

```tsx
{messages.map((message) => (
  <div key={message.id}>
    {message.parts.map((part, index) => {
      if (part.type === 'text') {
        return <p key={index}>{part.text}</p>;
      }
      if (part.type === 'tool-call') {
        return <div key={index}>Tool: {part.toolName}</div>;
      }
      return null;
    })}
  </div>
))}
```

### Status Management

The `status` field handles 4 states automatically:
- **submitted**: Message sent, waiting for response
- **streaming**: Receiving chunks from backend
- **ready**: Complete, can send new message
- **error**: Request failed

Use for:
```tsx
<button disabled={status !== 'ready'}>
  {status === 'streaming' ? 'Sending...' : 'Send'}
</button>
```

### Error Handling

```tsx
{error && (
  <div className="error">
    Something went wrong. Please try again.
  </div>
)}
```

**Important:** Show generic errors to users (don't leak server info)

### Input Management (NOT HANDLED BY HOOK)

AI SDK 5.0 **does not manage input state** anymore. We need to handle it:

```tsx
const [input, setInput] = useState('');

<form onSubmit={(e) => {
  e.preventDefault();
  sendMessage(input);
  setInput('');
}}>
  <input 
    value={input}
    onChange={(e) => setInput(e.target.value)}
  />
</form>
```

---

## 2. Vite + React + TypeScript + Tailwind Setup

### Verified Setup Process (from medium.com guide)

**Step 1: Create Vite Project**
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Install Tailwind**
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

This creates:
- `tailwind.config.js`
- `postcss.config.js`

**Step 3: Configure Tailwind**

`tailwind.config.js`:
```js
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Step 4: Add Tailwind Directives**

`src/index.css` (top of file):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 5: Import in main.tsx**
```tsx
import './index.css';
```

### TypeScript Configuration

Vite template already includes:
- `tsconfig.json` (app code)
- `tsconfig.node.json` (build scripts)
- `vite.config.ts`

No additional config needed!

### File Structure
```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── .env.development
└── src/
    ├── main.tsx           # Entry point
    ├── App.tsx            # Root component
    ├── index.css          # Tailwind imports
    ├── pages/
    │   ├── Chat.tsx
    │   └── Dashboard.tsx
    └── lib/
        └── api.ts
```

---

## 3. Cloudflare Pages Deployment

### Build Configuration (from Cloudflare docs)

**For React (Vite):**
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `frontend` (if in monorepo)

### Environment Variables

**Development** (`.env.development`):
```env
VITE_API_URL=http://localhost:8787
```

**Production** (Cloudflare dashboard):
- Set `VITE_API_URL` to worker URL
- Format: `https://your-worker.workers.dev` or custom domain

**Access in code:**
```ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
```

### Deployment Methods

**Option 1: Wrangler CLI**
```bash
# Build first
npm run build

# Deploy
wrangler pages deploy dist --project-name=medical-innovation-ui
```

**Option 2: GitHub Integration (Recommended)**
1. Push code to GitHub
2. Connect repo in Cloudflare dashboard
3. Auto-deploy on every push
4. Preview deployments for PRs

### Cloudflare Injected Variables

These are automatically available:
- `CF_PAGES`: `1` (true on Cloudflare)
- `CF_PAGES_BRANCH`: Current branch name
- `CF_PAGES_URL`: Deployment URL
- `CI`: `true`

Can use for conditional logic:
```ts
if (import.meta.env.CF_PAGES) {
  // Running on Cloudflare Pages
}
```

---

## 4. Backend Compatibility Verification

### Current Backend API

**Endpoint:** `POST /agents/interaction/main`

**Request Format:**
```json
{
  "role": "user",
  "content": "message text"
}
```

**Response:** Streaming `UIMessageStream` (AI SDK format)

### Compatibility Check ✅

Our backend uses:
- `createUIMessageStream()` ✅
- `createUIMessageStreamResponse()` ✅
- Returns proper AI SDK response format ✅

**This means `useChat` will work out of the box!**

### Required Backend Changes

**Add `/api/agents` endpoint for dashboard:**

```ts
// backend/index.ts
if (url.pathname === '/api/agents') {
  const id = env.INTERACTION_AGENT.idFromName('main');
  const stub = env.INTERACTION_AGENT.get(id);
  const agents = await stub.getAgents();
  return Response.json({ agents }, { headers: corsHeaders });
}
```

**Add method to InteractionAgent:**

```ts
// backend/agents/InteractionAgent.ts
async getAgents() {
  const registry = await this.ctx.storage.get('agent_registry');
  return Object.values(registry ?? {});
}
```

### CORS Headers

Already configured in `backend/index.ts`:
```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
```

Should work for both local dev and production!

---

## 5. Implementation Plan (Updated)

### Phase 1: Project Setup (20 min)
1. `npm create vite@latest frontend -- --template react-ts`
2. `cd frontend && npm install`
3. Install deps: `npm install ai react-router-dom`
4. Install dev deps: `npm install -D tailwindcss postcss autoprefixer`
5. `npx tailwindcss init -p`
6. Configure Tailwind (content paths)
7. Add Tailwind directives to `index.css`

### Phase 2: Chat Page (30 min)
1. Create `src/pages/Chat.tsx`
2. Use `useChat` hook
3. Render `message.parts` properly
4. Input box with controlled state
5. Basic Tailwind styling (flex, scroll, etc.)
6. Loading/error states

**Estimated Code:**
```tsx
// src/pages/Chat.tsx
import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
    api: `${API_URL}/agents/interaction/main`,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div 
            key={message.id}
            className={message.role === 'user' ? 'text-right' : 'text-left'}
          >
            {message.parts.map((part, i) => (
              part.type === 'text' && (
                <div key={i} className="inline-block bg-gray-100 rounded p-3">
                  {part.text}
                </div>
              )
            ))}
          </div>
        ))}
        {error && <div className="text-red-500">Error: {error.message}</div>}
      </div>
      
      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={status === 'streaming'}
          className="flex-1 border rounded px-4 py-2"
        />
        <button
          type="submit"
          disabled={status === 'streaming'}
          className="bg-blue-500 text-white px-6 py-2 rounded disabled:opacity-50"
        >
          {status === 'streaming' ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
```

### Phase 3: Dashboard Page (20 min)
1. Create `src/pages/Dashboard.tsx`
2. Fetch from `/api/agents`
3. Display agent cards
4. Simple grid layout with Tailwind

**Estimated Code:**
```tsx
// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

interface Agent {
  id: string;
  name: string;
  description: string;
}

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/agents`)
      .then(res => res.json())
      .then(data => {
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Research Agents</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div key={agent.id} className="border rounded-lg p-4 shadow">
            <h2 className="text-xl font-semibold mb-2">{agent.name}</h2>
            <p className="text-gray-600">{agent.description}</p>
          </div>
        ))}
      </div>
      {agents.length === 0 && (
        <p className="text-gray-500">No agents yet. Create one in the chat!</p>
      )}
    </div>
  );
}
```

### Phase 4: Routing & Layout (15 min)
1. Install React Router: `npm install react-router-dom`
2. Set up routes in `App.tsx`
3. Add navigation header
4. Environment variable setup

**App.tsx:**
```tsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <nav className="bg-gray-800 text-white p-4 flex gap-4">
          <Link to="/" className="hover:underline">Chat</Link>
          <Link to="/dashboard" className="hover:underline">Dashboard</Link>
        </nav>
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
```

### Phase 5: Backend Changes (10 min)
1. Add `/api/agents` endpoint
2. Add `getAgents()` method to InteractionAgent
3. Test with `curl` or browser

### Phase 6: Deployment (15 min)
1. Create `.env.development` with local API URL
2. Build: `npm run build`
3. Deploy: `wrangler pages deploy dist --project-name=medical-innovation-ui`
4. Set `VITE_API_URL` in Cloudflare dashboard
5. Test production deployment

---

## 6. Dependencies Summary

```json
{
  "name": "medical-innovation-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
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

---

## 7. Key Decisions

### Why AI SDK?
- Backend already uses AI SDK format
- Handles streaming automatically
- Manages state (messages, status, errors)
- Less code to write/maintain

### Why Vite?
- Fast dev server with HMR
- Simple configuration
- Official React template
- Cloudflare Pages native support

### Why Tailwind?
- Quick styling without CSS files
- Responsive utilities built-in
- Easy to maintain
- No CSS conflicts

### Why No Advanced Features Yet?
- Focus on working prototype first
- Can add later: real-time updates, file explorer, advanced error handling
- Get feedback from MVP before over-engineering

---

## 8. Testing Strategy

**Local Development:**
1. Run backend: `npm run dev` (from root)
2. Run frontend: `npm run dev` (from frontend/)
3. Backend on `localhost:8787`
4. Frontend on `localhost:5173`
5. Test chat flow end-to-end

**Production Testing:**
1. Deploy backend worker
2. Deploy frontend to Pages
3. Set environment variables
4. Test from deployed URL
5. Verify CORS working

---

## 9. Success Metrics

✅ User can open chat page
✅ User can type and send message
✅ Loading state shows while waiting
✅ Agent response streams in
✅ Can navigate to dashboard
✅ Dashboard shows spawned agents
✅ Works on mobile and desktop
✅ No console errors
✅ Deployed to Cloudflare Pages

---

## 10. Estimated Timeline

- **Setup**: 20 min
- **Chat UI**: 30 min
- **Dashboard**: 20 min
- **Routing**: 15 min
- **Backend**: 10 min
- **Deployment**: 15 min
- **Buffer**: 10 min

**Total: ~2 hours**

---

## Sources

- AI SDK Documentation: https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat
- Vite + React + Tailwind Guide: https://medium.com/@akhshyganesh/the-right-way-to-setup-react-and-tailwind-css-with-vite-ae5027f57dda
- Cloudflare Pages Build Config: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Cloudflare Pages Vite Guide: https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/
