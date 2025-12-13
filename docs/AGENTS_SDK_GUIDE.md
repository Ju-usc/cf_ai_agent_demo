# Cloudflare Agents SDK - Complete Guide

**Last Updated:** Oct 16, 2025

Comprehensive reference for building agents with Cloudflare Agents SDK, including AIChatAgent patterns, routing, tools, debugging, and configuration.

---

## 🚨 BREAKING CHANGE ALERT: AI SDK v5

**If you're getting: `result.toDataStreamResponse is not a function`**

This is because **AI SDK v5 renamed the streaming methods**:

| AI SDK v4 (OLD) | AI SDK v5 (NEW) |
|-----------------|-----------------|
| `result.toDataStreamResponse()` | `result.toUIMessageStreamResponse()` |
| `createDataStreamResponse()` | `createUIMessageStream()` + `createUIMessageStreamResponse()` |
| `result.mergeIntoDataStream(dataStream)` | `writer.merge(result.toUIMessageStream())` |

**Quick Fix:**
```typescript
// ❌ WRONG - AI SDK v4 method
const result = streamText({ model, messages });
return result.toDataStreamResponse();  // Error: not a function

// ✅ CORRECT - AI SDK v5 method
const result = streamText({ model, messages });
return result.toUIMessageStreamResponse();  // Works!
```

**No client changes needed** - `useChat` hook works the same with both protocols.

---

## Quick Reference

### Essential Imports (AI SDK v5)
```typescript
import { AIChatAgent } from "agents/ai-chat-agent";
import { routeAgentRequest } from "agents";
import { getCurrentAgent } from "agents";
import { streamText } from "ai";  // v5: No createDataStreamResponse needed
```

### URL Routing Pattern
```
/agents/{kebab-case-agent}/{instance-name}

Examples:
✅ /agents/chat/main
✅ /agents/interaction-agent/main
✅ /agents/research-agent/dmd-research
❌ /agents/chat/main/chat  (SDK doesn't recognize /chat suffix)
```

### Minimal Implementation (AI SDK v5)
```typescript
export class Chat extends AIChatAgent<Env> {
  async onChatMessage(onFinish, _options?: { abortSignal?: AbortSignal }) {
    const result = streamText({
      model: openai("gpt-4o"),
      messages: this.messages,
      onFinish,  // Critical for message persistence
    });

    // ✅ CORRECT for AI SDK v5
    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
```

---

## Core Concepts

### How Routing Works

**Request Flow:**
```
POST /agents/chat/main + { role: "user", content: "..." }
  ↓
routeAgentRequest() parses URL: agent="chat", instance="main"
  ↓
Converts to PascalCase: "chat" → "Chat"
  ↓
Gets Durable Object: env.Chat.idFromName("main")
  ↓
Calls: agent.onRequest(request)
  ↓
AIChatAgent.onRequest() detects POST + JSON → chat message
  ↓
Calls: agent.onChatMessage(onFinish)
  ↓
Returns streaming Response
```

**Key Insight:** You never manually call `onChatMessage()`. The SDK does it automatically via `onRequest()`.

### Class Hierarchy
```
Agent (base class)
  ↓
AIChatAgent (adds chat behavior + message history)
  ↓
Your Agent Class (domain-specific implementation)
```

### Auto-Managed Properties
- `this.messages` - Array of chat messages (read-only, auto-saved)
- `this.state` - Persistent state storage
- `this.env` - Environment variables and bindings
- `this.getStorage()` - Durable Object storage access

---

## Implementation Patterns

### Pattern 1: Basic Chat Agent (AI SDK v5)
```typescript
import { AIChatAgent } from "agents/ai-chat-agent";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export class Chat extends AIChatAgent<Env> {
  async onChatMessage(onFinish, _options?: { abortSignal?: AbortSignal }) {
    const result = streamText({
      model: openai("gpt-4o"),
      system: "You are a helpful assistant.",
      messages: this.messages,
      onFinish,  // Ensures messages saved to history
    });

    // ✅ CORRECT for AI SDK v5
    return result.toUIMessageStreamResponse();
  }
}
```

### Pattern 2: Chat Agent with Tools (AI SDK v5)
```typescript
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getCurrentAgent } from "agents";

export class Chat extends AIChatAgent<Env> {
  async onChatMessage(onFinish, _options?: { abortSignal?: AbortSignal }) {
    const result = streamText({
      model: openai("gpt-4o"),
      system: "You are helpful. Use tools when needed.",
      messages: this.messages,
      tools: {
        // Tool definitions here
        myTool: {
          description: "Does something useful",
          parameters: z.object({ param: z.string() }),
          execute: async ({ param }) => {
            const { agent } = getCurrentAgent<Env>();
            // Implementation
            return { result: 'value' };
          }
        }
      },
      onFinish,
    });

    // ✅ Simple approach - works with tools automatically
    return result.toUIMessageStreamResponse();
  }
}
```

**Advanced Pattern with Custom Data:**
```typescript
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export class Chat extends AIChatAgent<Env> {
  async onChatMessage(onFinish, _options?: { abortSignal?: AbortSignal }) {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        // Write custom data before LLM response
        writer.write({ type: 'data', data: { status: 'processing' } });

        const result = streamText({
          model: openai("gpt-4o"),
          messages: this.messages,
          tools: { /* ... */ },
          onFinish,
        });

        // Merge LLM stream
        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
```

### Pattern 3: Tool Definition with Context Injection
```typescript
import { tool } from "ai";
import { z } from "zod";
import { getCurrentAgent } from "agents";

export const myTool = tool({
  description: "Does something useful",
  inputSchema: z.object({
    param: z.string().describe("Parameter description"),
  }),
  execute: async ({ param }) => {
    // Get current agent context via AsyncLocalStorage
    const { agent } = getCurrentAgent<Env>();
    const env = agent.getEnv();
    const storage = agent.getStorage();

    // Implementation
    return { result: "value" };
  }
});
```

### Pattern 4: Worker Entry Point
```typescript
import { routeAgentRequest } from "agents";

export class Chat extends AIChatAgent<Env> { /* ... */ }
export class ResearchAgent extends Agent<Env> { /* ... */ }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Handle OPTIONS for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Route everything to SDK
    const response = await routeAgentRequest(request, env, { cors: true });
    if (response) return response;

    // Custom fallback routes
    if (new URL(request.url).pathname === '/health') {
      return Response.json({ status: 'ok' });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
} satisfies ExportedHandler<Env>;
```

### Pattern 5: Backward Compatible /api/chat Route
```typescript
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // Map /api/chat → /agents/interaction-agent/main (NO /chat suffix!)
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const body = await request.text();
      const agentUrl = new URL(request.url);
      agentUrl.pathname = '/agents/interaction-agent/main';  // No suffix!

      const agentRequest = new Request(agentUrl.toString(), {
        method: 'POST',
        headers: request.headers,
        body,
      });

      const routed = await routeAgentRequest(agentRequest, env, { cors: true });
      if (routed) return routed;
    }

    // SDK routing for /agents/** paths
    const response = await routeAgentRequest(request, env, { cors: true });
    if (response) return response;

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
};
```

---

## Debugging "Not implemented"

### Root Cause
The error "Not implemented" occurs when `routeAgentRequest()` can't find a handler for your URL pattern.

**Common Cause:** Using `/agents/chat/main/chat` (with `/chat` suffix) instead of `/agents/chat/main`.

### Why It Happens
```
POST /agents/chat/main/chat
  ↓
routeAgentRequest() sees /chat suffix
  ↓
Looks for custom /chat endpoint handler
  ↓
No handler found → "Not implemented"
```

**The Fix:**
```typescript
// ❌ WRONG
agentUrl.pathname = '/agents/interaction-agent/main/chat';

// ✅ CORRECT
agentUrl.pathname = '/agents/interaction-agent/main';
```

### Debug Checklist
```
[ ] Agent class exported from worker
[ ] Agent class extends AIChatAgent<Env>
[ ] onChatMessage method implemented
[ ] onChatMessage returns Response (not undefined)
[ ] routeAgentRequest() called in fetch handler
[ ] Durable Object binding in wrangler.toml
[ ] URL pattern is /agents/{agent}/{name} (no /chat suffix)
[ ] onFinish callback passed to streamText()
```

### Common Mistakes

**Mistake 1: Wrong URL Pattern**
```typescript
// ❌ WRONG - SDK doesn't recognize this
POST /agents/chat/main/chat

// ✅ CORRECT
POST /agents/chat/main
```

**Mistake 2: Missing onFinish Callback**
```typescript
// ❌ WRONG - messages won't persist
streamText({
  messages: this.messages,
  model: openai("gpt-4o"),
  // Missing: onFinish
});

// ✅ CORRECT
streamText({
  messages: this.messages,
  model: openai("gpt-4o"),
  onFinish,  // Critical!
});
```

**Mistake 3: Not Extending AIChatAgent**
```typescript
// ❌ WRONG - chat features don't work
export class Chat extends Agent<Env> {
  async onChatMessage() { ... }  // Never called
}

// ✅ CORRECT
export class Chat extends AIChatAgent<Env> {
  async onChatMessage() { ... }
}
```

**Mistake 4: Modifying this.messages Directly**
```typescript
// ❌ WRONG - changes don't persist
this.messages.push({ role: "user", content: "..." });

// ✅ CORRECT
await this.saveMessages([...this.messages, newMessage]);
```

**Mistake 5: Missing Durable Object Binding**
```toml
# ❌ WRONG - no binding
name = "my-agent-worker"

# ✅ CORRECT
name = "my-agent-worker"

[[durable_objects.bindings]]
name = "Chat"
class_name = "Chat"
```

---

## Configuration

### Wrangler Configuration
```toml
name = "my-agent-worker"
main = "src/index.ts"

# Durable Object bindings (one per agent class)
[[durable_objects.bindings]]
name = "Chat"
class_name = "Chat"
script_name = "my-agent-worker"

[[durable_objects.bindings]]
name = "ResearchAgent"
class_name = "ResearchAgent"
script_name = "my-agent-worker"

# AI binding (for Workers AI)
[ai]
binding = "AI"
remote = true

# Environment variables
[env.development]
vars = { OPENAI_API_KEY = "" }

[env.production]
vars = { OPENAI_API_KEY = "" }
```

### Class Name → URL Mapping
```
class Chat                → /agents/chat/{name}
class ResearchAgent       → /agents/research-agent/{name}
class CustomerSupport     → /agents/customer-support/{name}
class UserProfileAgent    → /agents/user-profile-agent/{name}
```

---

## Testing

### Local Development
```bash
# Start dev server
npm run dev

# Test chat endpoint
curl -X POST http://localhost:8787/agents/chat/main \
  -H "Content-Type: application/json" \
  -d '{"role":"user","content":"Hello"}'

# Expected: Streaming response with LLM output
# NOT: "Not implemented"
```

### View Logs
```bash
wrangler tail
```

### Check Agent Status
```bash
curl http://localhost:8787/agents/chat/main
# Should return agent metadata, not 404
```

---

## Message Format

### Incoming Message
```json
{
  "role": "user",
  "content": "What should I research?"
}
```

### Message History (this.messages)
```typescript
[
  { role: "user", content: "First question" },
  { role: "assistant", content: "First answer" },
  { role: "user", content: "Follow-up question" }
]
```

### Saving Messages
```typescript
// Automatic: onFinish callback in streamText()
const stream = streamText({
  messages: this.messages,
  model: openai("gpt-4o"),
  onFinish,  // Auto-calls this.saveMessages()
});

// Manual: if not using streamText
await this.saveMessages([
  ...this.messages,
  { role: "assistant", content: "Response" }
]);
```

---

## Best Practices

### Do's ✅
- Return `Response` from `onChatMessage()`
- Pass `onFinish` callback for message persistence
- Use `this.messages` for full chat history (read-only)
- Define custom routes BEFORE calling `routeAgentRequest()`
- Export agent class for Durable Objects
- Use kebab-case URLs (auto-converted from class names)
- Use `getCurrentAgent()` in tools for context injection

### Don'ts ❌
- Modify `this.messages` directly (use `saveMessages()`)
- Forget Durable Object binding in wrangler.toml
- Use `/api/*` paths expecting SDK to handle them
- Return `null`/`undefined` from `onChatMessage()`
- Forget error handling in fetch handler
- Add `/chat` suffix to agent URLs

---

## Lifecycle Methods

### onChatMessage(onFinish, _options?)
**Called:** When chat message arrives (POST to `/agents/{agent}/{name}`)

**Must Return:** Response object with streaming content

**Key Point:** Always call `onFinish()` to save messages!

### Other Hooks (from Agent base class)
- `onStart()` - Agent initializes or resumes
- `onRequest(request)` - HTTP requests (fallback handler)
- `onConnect(connection)` - WebSocket established
- `onMessage(connection, message)` - WebSocket message
- `onClose(connection)` - WebSocket closed

---

## Client Integration (React)

```typescript
import { useAgentChat } from "agents/ai-react";

export function ChatComponent() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading
  } = useAgentChat({
    agent: "chat",              // Kebab-case agent type
    agentName: "main",          // Instance ID
    baseURL: "http://localhost:8787"
  });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}
```

---

## WebSocket Patterns for Cloudflare Agents

### Overview

Cloudflare Agents SDK supports **both HTTP/SSE and WebSocket** communication. Most starter examples use WebSocket under the hood via `useAgent` hook, while custom implementations can use HTTP POST for simpler architectures.

### Communication Methods Comparison

| Aspect | HTTP + SSE | WebSocket (Hibernation API) |
|--------|------------|----------------------------|
| **Connection** | New request per message | Persistent bidirectional |
| **Streaming** | Server-to-client only (SSE) | Bidirectional |
| **Cost** | Pay for CPU time only | Pay for CPU time only (hibernates when idle) |
| **Complexity** | Simple, stateless | Requires lifecycle management |
| **Best For** | One-way LLM streaming, simple chat | Long-lived sessions, real-time collaboration |
| **Reconnection** | Built into HTTP | Requires explicit handling |
| **Idle Connection** | N/A | Free (hibernation) |

**Cloudflare Recommendation:** Use WebSocket for most use cases—it's more stable for extended sessions.

### Current Implementation: HTTP POST + SSE

Our project uses **HTTP POST** with `useChat` from `@ai-sdk/react`:

```typescript
// frontend/src/pages/Chat.tsx
const { messages, input, handleSubmit, isLoading } = useChat({
  api: `${API_URL}/api/chat`,
  onError: (err) => console.error('Chat error:', err),
});
```

**Backend Flow:**
1. POST to `/api/chat` → routed to `/agents/interaction-agent/main`
2. `InteractionAgent.onChatMessage()` called
3. `streamText()` streams LLM response via SSE
4. `createUIMessageStreamResponse()` returns streaming Response

**Pros:**
- Simple, familiar HTTP semantics
- Works with standard load balancers/proxies
- No connection state management
- Built-in reconnection via HTTP

**Cons:**
- New connection per message (handshake overhead)
- No server-initiated messages (requires polling or SSE)
- Limited to request-response pattern

### WebSocket Implementation Pattern

To migrate to WebSocket, you'd use Cloudflare's **WebSocket Hibernation API** for cost efficiency:

#### Server-Side: Durable Object with Hibernation

```typescript
import { AIChatAgent } from 'agents/ai-chat-agent';

export class InteractionAgent extends AIChatAgent<Env> {
  async onConnect(connection: Connection, ctx: ConnectionContext) {
    // Called when WebSocket connection established
    const sessionId = crypto.randomUUID();

    // Persist metadata (survives hibernation, max 2KB)
    connection.serializeAttachment({ sessionId, userId: ctx.request.headers.get('x-user-id') });

    console.log('Client connected:', sessionId);
  }

  async onMessage(connection: Connection, message: WSMessage) {
    // Called for each WebSocket message (runtime wakes object if hibernated)
    const attachment = connection.deserializeAttachment();
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);

    const userMessage = JSON.parse(text);
    await this.persistMessages([...this.messages, userMessage]);

    // Stream response back over WebSocket
    const response = await this.onChatMessage(() => {});
    const reader = response.body?.getReader();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      connection.send(value);
    }
  }

  async onClose(connection: Connection, code: number, reason: string) {
    const { sessionId } = connection.deserializeAttachment();
    console.log('Client disconnected:', sessionId, code, reason);
  }

  async onError(connection: Connection, error: Error) {
    console.error('WebSocket error:', error);
  }

  // Enable hibernation in constructor
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Restore hibernated connections
    this.ctx.getWebSockets().forEach(ws => {
      const { sessionId } = ws.deserializeAttachment();
      console.log('Restored connection:', sessionId);
    });
  }
}
```

**Key Methods:**
- `this.ctx.acceptWebSocket(ws)` - Mark WebSocket as hibernatable (not `ws.accept()`)
- `this.ctx.getWebSockets()` - Retrieve all connected clients (after wake from hibernation)
- `connection.serializeAttachment(data)` - Persist metadata across hibernation (max 2KB)
- `connection.deserializeAttachment()` - Restore metadata after wake

#### Client-Side: AgentClient (Official SDK)

```typescript
import { AgentClient } from 'agents/client';

const connection = new AgentClient({
  agent: 'interaction-agent',
  name: 'main',
  baseURL: 'http://localhost:8787'
});

// Send messages
connection.send(JSON.stringify({
  role: 'user',
  content: 'Create a research agent for DMD'
}));

// Receive messages
connection.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('Agent response:', data);
});

// Handle disconnections
connection.addEventListener('close', () => {
  console.log('Connection closed');
});

connection.addEventListener('error', (error) => {
  console.error('WebSocket error:', error);
});
```

#### Client-Side: React Hook (useAgent)

```typescript
import { useAgent } from 'agents/react';

function Chat() {
  const agent = useAgent({
    agent: 'interaction-agent',
    name: 'main'
  });

  const { messages, sendMessage, status } = useAgentChat({ agent });

  const handleSend = () => {
    sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: input }]
    });
  };

  return (
    <div>
      {messages.map(msg => <div key={msg.id}>{msg.content}</div>)}
      <button onClick={handleSend}>Send</button>
      <div>Status: {status}</div>
    </div>
  );
}
```

**Benefits:**
- Automatic lifecycle management (connect/disconnect)
- Built-in reconnection logic
- State synchronization with agent

### Hibernation Deep Dive

**What Hibernates?**
- Durable Object evicted from memory during idle periods
- WebSocket connections remain open at Cloudflare's edge
- No billable duration charges while hibernated

**What Persists?**
- WebSocket connections (maintained by runtime)
- Durable Object storage (R2, KV, state)
- Connection metadata via `serializeAttachment()` (max 2KB)

**What Doesn't Persist?**
- In-memory variables (reset on wake)
- Event listeners (use handler methods instead)
- Timers/intervals (use Alarms API)

**Wake Triggers:**
- Incoming WebSocket message
- HTTP request to Durable Object
- Alarm fires

**Auto-Response Pattern:**
```typescript
this.ctx.setWebSocketAutoResponse({
  request: new Request('https://example.com/ping'),
  response: new Response('pong')
});
```
Responds to pings without waking hibernated object (free keepalive).

### Streaming LLM Responses Over WebSocket

Both approaches work for streaming LLM output:

**HTTP/SSE (current):**
```typescript
const stream = streamText({ model, messages, onFinish });
return createUIMessageStreamResponse({ stream });
```
Client receives chunks via `useChat` hook.

**WebSocket:**
```typescript
const stream = streamText({ model, messages, onFinish });
for await (const chunk of stream.textStream) {
  connection.send(JSON.stringify({ type: 'chunk', text: chunk }));
}
connection.send(JSON.stringify({ type: 'done' }));
```
Client receives chunks via `onMessage` handler.

**Performance:** Negligible difference for LLM streaming—both only charge CPU time, not I/O wait.

### Migration Decision Matrix

**Stick with HTTP/SSE if:**
- ✅ Simple request-response pattern
- ✅ No server-initiated messages needed
- ✅ Existing infra optimized for HTTP
- ✅ Simpler debugging/monitoring

**Migrate to WebSocket if:**
- ✅ Multi-agent notifications (ResearchAgent → InteractionAgent → User)
- ✅ Real-time collaboration features
- ✅ Long-lived sessions (hours/days)
- ✅ High message frequency (reduces handshake overhead)

### Practical Migration Steps

If deciding to migrate:

1. **Add WebSocket handlers to InteractionAgent:**
   ```typescript
   async onConnect(connection, ctx) { /* ... */ }
   async onMessage(connection, message) { /* ... */ }
   async onClose(connection, code, reason) { /* ... */ }
   ```

2. **Update frontend to use `useAgent` hook:**
   ```typescript
   import { useAgent } from 'agents/react';
   import { useAgentChat } from 'agents/ai-react';

   const agent = useAgent({ agent: 'interaction-agent', name: 'main' });
   const { messages, sendMessage } = useAgentChat({ agent });
   ```

3. **Remove `/api/chat` backward compatibility route** (now native WebSocket via SDK)

4. **Test hibernation behavior:**
   - Verify connections survive idle periods
   - Confirm metadata persists via `serializeAttachment()`
   - Monitor duration charges (should be zero during idle)

5. **Handle reconnection on frontend** (SDK does this automatically with `useAgent`)

### Cost Comparison

**Both approaches have identical cost structure:**
- CPU time: Billed per GB-second
- I/O wait (LLM inference): **Free**
- Idle WebSocket: **Free** (hibernation)
- HTTP overhead: Negligible

**Verdict:** Cost is not a deciding factor—choose based on architecture needs.

---

## Vercel AI SDK Integration with Cloudflare

### Overview

Cloudflare Workers are fully compatible with Vercel AI SDK (`ai` and `@ai-sdk/react`) for streaming LLM responses. The integration uses standard Web APIs (Request/Response) without requiring special adapters beyond the AI provider package.

**Key Points:**
- HTTP POST + Server-Sent Events (SSE) is the standard transport
- No WebSocket requirement for basic streaming
- Works with all major LLM providers (OpenAI, Anthropic, Workers AI)
- Fully compatible with `useChat` and `useCompletion` hooks

**⚠️ IMPORTANT - AI SDK Version Differences:**
- **AI SDK v4.x:** Used `toDataStreamResponse()` and `createDataStreamResponse()`
- **AI SDK v5.x (Current):** Uses `toUIMessageStreamResponse()` and `createUIMessageStream()`
- The method names changed in v5 - **`toDataStreamResponse()` does not exist in v5!**

### Stream Protocol Options (AI SDK v5)

Vercel AI SDK v5 uses **UI Message Streams** as the default protocol:

| Protocol | Transport | Use Case | Method |
|----------|-----------|----------|--------|
| **UI Message Stream** (default) | Server-Sent Events | Full chat features + tools + metadata | `toUIMessageStreamResponse()` |
| **Text Stream** | Chunked HTTP | Plain text only | `toTextStreamResponse()` |

**UI Message Stream Protocol:**
- Uses SSE format with structured message events
- Supports tool calls, reasoning blocks, custom data, attachments
- Built-in keep-alive, reconnection, better caching
- **Default for `useChat` hook** - best compatibility
- Replaces v4's "Data Stream Protocol"

**Text Stream Protocol:**
- Simple chunked transfer encoding
- Text-only responses (no structured data)
- Use only when you don't need tool calls or structured data
- Must set `streamProtocol: "text"` in client

### Server-Side Patterns (AI SDK v5)

#### Pattern 1: UI Message Stream (Recommended for Chat with useChat)

```typescript
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { messages } = await request.json();

    const result = streamText({
      model: openai("gpt-4o"),
      messages,
      tools: {
        // Optional tool definitions
      },
    });

    // ✅ CORRECT for AI SDK v5
    return result.toUIMessageStreamResponse();
  },
};
```

**Why UI Message Stream:**
- **Default protocol for `useChat` hook** - works out of the box
- Supports tool calls, attachments, and custom data
- SSE protocol with automatic reconnection
- Future-proof for adding tools later
- **This is the v5 replacement for v4's `toDataStreamResponse()`**

#### Pattern 2: Text Stream (Simple Text-Only Responses)

```typescript
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { messages } = await request.json();

    const result = streamText({
      model: openai("gpt-4o"),
      messages,
    });

    // ✅ CORRECT - Available in both v4 and v5
    return result.toTextStreamResponse({
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  },
};
```

**When to Use:**
- No tool calling needed
- Simple text-only responses
- Lowest overhead

**Client Configuration Required:**
```typescript
useChat({
  api: "/api/chat",
  streamProtocol: "text", // Must set this for text stream
});
```

#### Pattern 3: Cloudflare Workers AI Provider

```typescript
import { createWorkersAI } from "workers-ai-provider";
import { streamText } from "ai";

type Env = {
  AI: Ai;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const workersai = createWorkersAI({ binding: env.AI });

    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      messages: [
        { role: "user", content: "Write an essay about hello world" },
      ],
    });

    // Workers AI requires specific headers for streaming
    return result.toTextStreamResponse({
      headers: {
        "Content-Type": "text/x-unknown",
        "content-encoding": "identity",
        "transfer-encoding": "chunked",
      },
    });
  },
};
```

**Setup:**
```bash
npm install workers-ai-provider
```

**Wrangler Config:**
```toml
[ai]
binding = "AI"
```

### Client-Side Integration

#### useChat Hook (React)

```typescript
import { useChat } from "@ai-sdk/react";

export function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: "http://localhost:8787/api/chat",
      onError: (error) => console.error("Chat error:", error),
    });

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>
          <strong>{msg.role}:</strong> {msg.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

**How It Works:**
1. User submits form
2. `useChat` sends POST to `/api/chat` with `{ messages: [...] }`
3. Worker streams response via SSE
4. Hook updates `messages` array in real-time
5. UI re-renders with each chunk

#### useCompletion Hook (Single Prompts)

```typescript
import { useCompletion } from "@ai-sdk/react";

export function CompletionComponent() {
  const { completion, input, handleInputChange, handleSubmit, isLoading } =
    useCompletion({
      api: "/api/completion",
    });

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit" disabled={isLoading}>
          Generate
        </button>
      </form>
      <div>{completion}</div>
    </div>
  );
}
```

**Difference from useChat:**
- Single prompt → response (no conversation history)
- Server receives `{ prompt: string }` instead of messages array
- Use for one-off text generation tasks

### HTTP Request/Response Flow

**Client Request (useChat):**
```http
POST /api/chat HTTP/1.1
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Hello" }
  ]
}
```

**Server Response (Data Stream):**
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

0:{"id":"msg-1","role":"assistant","content":[]}
2:{"index":0,"delta":{"type":"text","text":"Hello"}}
2:{"index":0,"delta":{"type":"text","text":"!"}}
3:{"index":0,"finish_reason":"stop"}
```

**Server Response (Text Stream):**
```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Transfer-Encoding: chunked

Hello!
```

### Integration with Cloudflare Agents SDK

#### Combining Both SDKs (AI SDK v5 + Cloudflare Agents)

```typescript
import { AIChatAgent } from "agents/ai-chat-agent";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export class InteractionAgent extends AIChatAgent<Env> {
  async onChatMessage(onFinish, _options?: { abortSignal?: AbortSignal }) {
    const result = streamText({
      model: openai("gpt-4o"),
      system: "You are a medical innovation research assistant.",
      messages: this.messages,
      tools: {
        // Optional tool definitions
      },
      onFinish, // Critical: saves messages to Durable Object
    });

    // ✅ CORRECT for AI SDK v5
    return result.toUIMessageStreamResponse();
  }
}
```

**Why This Works:**
- `AIChatAgent` handles message persistence in Durable Object
- `streamText` manages LLM streaming
- `toUIMessageStreamResponse()` creates SSE response compatible with `useChat`
- `onFinish` callback bridges the two SDKs (saves messages when streaming completes)

**❌ WRONG - Don't use v4 patterns:**
```typescript
// This will FAIL in AI SDK v5
return createDataStreamResponse({ ... });  // ❌ v4 only
return result.toDataStreamResponse();      // ❌ Method doesn't exist in v5
```

#### Frontend with useChat

```typescript
import { useChat } from "@ai-sdk/react";

const { messages, input, handleSubmit, isLoading } = useChat({
  api: `${API_URL}/api/chat`, // Maps to /agents/interaction-agent/main
  onError: (err) => console.error("Chat error:", err),
});
```

**Backend Routing:**
```typescript
// backend/index.ts
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // Map /api/chat → /agents/interaction-agent/main
    if (url.pathname === "/api/chat" && request.method === "POST") {
      const agentUrl = new URL(request.url);
      agentUrl.pathname = "/agents/interaction-agent/main";

      const agentRequest = new Request(agentUrl.toString(), {
        method: "POST",
        headers: request.headers,
        body: await request.text(),
      });

      return await routeAgentRequest(agentRequest, env, { cors: true });
    }

    return await routeAgentRequest(request, env, { cors: true });
  },
};
```

### Response Method Reference (AI SDK v5)

From `streamText()` result object in **AI SDK v5.x**:

| Method | Returns | Use Case | Protocol | SDK Version |
|--------|---------|----------|----------|-------------|
| `toUIMessageStreamResponse()` | Response | Chat with tools + metadata (default) | SSE (UI Message Stream) | v5 only |
| `toTextStreamResponse()` | Response | Plain text streaming | Chunked HTTP | v4 + v5 |
| `pipeUIMessageStreamToResponse()` | void | Pipe to Node.js response | SSE | v5 only |
| `toUIMessageStream()` | AsyncIterable | Manual UI message stream handling | N/A | v5 only |
| `textStream` | AsyncIterable | Manual text stream handling | N/A | v4 + v5 |
| `fullStream` | AsyncIterable | All events (text, tools, finish) | N/A | v4 + v5 |

**❌ Methods Removed in v5:**
- `toDataStreamResponse()` - Use `toUIMessageStreamResponse()` instead
- `mergeIntoDataStream()` - Use `createUIMessageStream()` pattern instead

**Recommended Pattern for AI SDK v5:**
```typescript
// ✅ For chat with tools (most flexible) - AI SDK v5
const result = streamText({ model, messages, tools });
return result.toUIMessageStreamResponse();

// ✅ For simple text responses - AI SDK v4 + v5
const result = streamText({ model, messages });
return result.toTextStreamResponse();
```

### Common Gotchas (AI SDK v5)

#### Gotcha 1: Using v4 Methods in v5

```typescript
// ❌ WRONG - These methods don't exist in AI SDK v5
return result.toDataStreamResponse();           // ❌ Removed in v5
result.mergeIntoDataStream(dataStream);        // ❌ Removed in v5
return createDataStreamResponse({ ... });      // ❌ Removed in v5

// ✅ CORRECT - Use v5 methods
return result.toUIMessageStreamResponse();     // ✅ v5
```

#### Gotcha 2: Missing Content-Type Headers

```typescript
// ❌ WRONG - Client won't parse stream
return new Response(stream);

// ✅ CORRECT - Let SDK set headers
return result.toUIMessageStreamResponse();  // v5
```

#### Gotcha 3: Using toTextStreamResponse with useChat

```typescript
// ❌ WRONG - useChat expects UI message stream by default
return result.toTextStreamResponse();

// ✅ OPTION 1 - Use UI message stream (recommended)
return result.toUIMessageStreamResponse();

// ✅ OPTION 2 - Configure client for text stream
useChat({
  api: "/api/chat",
  streamProtocol: "text",
});
```

#### Gotcha 4: Forgetting onFinish in Agents SDK

```typescript
// ❌ WRONG - Messages won't persist
streamText({
  model: openai("gpt-4o"),
  messages: this.messages,
  // Missing: onFinish
});

// ✅ CORRECT
streamText({
  model: openai("gpt-4o"),
  messages: this.messages,
  onFinish, // Passed from onChatMessage(onFinish)
});
```

#### Gotcha 5: Custom Data Streaming (v4 vs v5)

```typescript
// ❌ WRONG - v4 pattern doesn't work in v5
return createDataStreamResponse({
  execute: async (dataStream) => {
    dataStream.writeData({ custom: 'data' });
    result.mergeIntoDataStream(dataStream);
  }
});

// ✅ CORRECT - v5 pattern
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

const stream = createUIMessageStream({
  execute: ({ writer }) => {
    // Write custom data
    writer.write({ type: 'data', data: { custom: 'value' } });

    // Stream AI response
    const result = streamText({ model, messages, onFinish });
    writer.merge(result.toUIMessageStream());
  }
});

return createUIMessageStreamResponse({ stream });
```

### CORS Configuration

Vercel AI SDK client requires CORS headers:

```typescript
export default {
  async fetch(request: Request, env: Env) {
    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Use built-in CORS from SDK
    return await routeAgentRequest(request, env, { cors: true });
  },
};
```

### Migration from WebSocket to HTTP

**Current HTTP Approach is Valid:**
- HTTP POST + SSE is the standard for Vercel AI SDK
- No need to migrate to WebSocket unless you need:
  - Server-initiated messages (agent → client push)
  - Bidirectional real-time communication
  - Long-lived persistent connections

**Vercel AI SDK Does NOT Require WebSocket:**
- `useChat` uses HTTP POST by default
- Streaming works via SSE (Server-Sent Events over HTTP)
- WebSocket support exists but is not the primary transport

**When to Consider WebSocket:**
- Multi-agent notifications (ResearchAgent → User)
- Real-time collaboration features
- Reducing HTTP handshake overhead for high-frequency messages

**Cost Comparison:**
- HTTP: Pay for CPU time per request
- WebSocket (hibernation): Pay for CPU time, free when idle
- **For LLM streaming:** Both are nearly identical (I/O wait is free)

### Testing Integration

#### Test Server Endpoint

```bash
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'

# Expected: Streaming SSE response like:
# 0:{"id":"msg-1","role":"assistant","content":[]}
# 2:{"index":0,"delta":{"type":"text","text":"Hello"}}
# ...
```

#### Test Client Hook

```typescript
// In React app
const { messages, sendMessage } = useChat({
  api: "http://localhost:8787/api/chat",
  onError: (e) => console.error("Error:", e),
  onFinish: (message) => console.log("Finished:", message),
});

// Send test message
await sendMessage("Hello");

// Check console for streaming updates
```

### Key Takeaways (AI SDK v5)

✅ **HTTP POST + SSE is the standard** - No WebSocket migration needed
✅ **UI Message Stream is default in v5** - Use `toUIMessageStreamResponse()`
✅ **`toDataStreamResponse()` removed in v5** - Update to v5 methods
✅ **CORS must be configured** - Either manually or via SDK `{ cors: true }`
✅ **`onFinish` callback critical** - Bridges Agents SDK message persistence
✅ **Workers AI requires specific headers** - Use `toTextStreamResponse` with custom headers

**Migration Checklist (v4 → v5):**
- [ ] Replace `toDataStreamResponse()` with `toUIMessageStreamResponse()`
- [ ] Replace `createDataStreamResponse()` with `createUIMessageStream()`
- [ ] Replace `mergeIntoDataStream()` with `writer.merge()` pattern
- [ ] Update imports: `createUIMessageStream`, `createUIMessageStreamResponse`
- [ ] Test streaming with `useChat` hook (should work without client changes)

### Additional Resources

- **Vercel AI SDK Docs:** https://ai-sdk.dev/docs
- **Stream Protocols:** https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- **useChat Reference:** https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- **Workers AI Provider:** https://github.com/cloudflare/workers-ai-provider
- **Cloudflare Workers AI + AI SDK:** https://developers.cloudflare.com/workers-ai/configuration/ai-sdk/

---

## References

- **Official Docs:** https://developers.cloudflare.com/agents/
- **API Reference:** https://developers.cloudflare.com/agents/api-reference/agents-api/
- **Calling Agents:** https://developers.cloudflare.com/agents/api-reference/calling-agents/
- **HTTP/SSE Guide:** https://developers.cloudflare.com/agents/api-reference/http-sse/
- **WebSocket Guide:** https://developers.cloudflare.com/agents/api-reference/websockets/
- **Hibernation Best Practices:** https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- **Hibernation Example:** https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/
- **Starter Kit:** https://github.com/cloudflare/agents-starter
- **npm Package:** https://www.npmjs.com/package/@cloudflare/agents

---

## Quick Fix Reference

**Problem:** `/api/chat` returns "Not implemented"

**Fix:** One-line change in your routing code:
```typescript
// ❌ BEFORE
agentUrl.pathname = '/agents/interaction-agent/main/chat';

// ✅ AFTER
agentUrl.pathname = '/agents/interaction-agent/main';
```

**Why:** SDK recognizes `/agents/{agent}/{name}`, not `/agents/{agent}/{name}/chat`.
