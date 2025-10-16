# JSRPC Migration Research

## Official Cloudflare Pattern

Source: https://developers.cloudflare.com/agents/api-reference/calling-agents/

### Key Findings

1. **Zero-Overhead Method Calls**
```typescript
// Get agent stub
const agent = env.MY_AGENT.getAgentByName('user-123');

// Call methods directly - NO HTTP needed
const result = await agent.someMethod(args);
```

2. **Two Ways to Get Agent Stub**

**Option A: `getAgentByName` (Recommended by Cloudflare)**
```typescript
const agent = env.RESEARCH_AGENT.getAgentByName('dmd-research');
await agent.sendMessage('hi');
```

**Option B: `idFromName` + `get` (What we use now)**
```typescript
const id = env.RESEARCH_AGENT.idFromName('dmd-research');
const agent = env.RESEARCH_AGENT.get(id);
await agent.sendMessage('hi');
```

Both work! Option B gives more control (can use `newUniqueId()` etc).

3. **Agent Methods are Public**
```typescript
export class MyAgent extends Agent<Env> {
  // Any public method can be called via JSRPC
  async sendMessage(text: string): Promise<string> {
    return `Echo: ${text}`;
  }
}
```

4. **TypeScript Type Safety**
```typescript
// Type the namespace for inference
interface Env {
  RESEARCH_AGENT: AgentNamespace<ResearchAgent>;
}

// Now TypeScript knows what methods exist
const stub = env.RESEARCH_AGENT.get(id);
await stub.sendMessage('hi');  // ✅ TypeScript validates this
```

---

## Our Current Implementation (HTTP Overhead)

### Flow 1: message_agent tool
```typescript
// tools.ts
const stub = env.RESEARCH_AGENT.get(agentId);
const response = await stub.fetch(new Request('https://dummy/message', {
  method: 'POST',
  body: JSON.stringify({ message })
}));
const data = await response.json();

// ResearchAgent.ts
async onRequest(request: Request) {
  if (url.pathname === '/message') {
    const { message } = await request.json();
    // ... process
    return Response.json({ message: reply });
  }
}
```

**Overhead:**
- HTTP Request/Response wrapper
- Manual JSON stringify/parse
- URL routing
- No type safety

### Flow 2: bestEffortRelay
```typescript
// ResearchAgent.ts
await ia.fetch(new Request('https://dummy/relay', {
  method: 'POST',
  body: JSON.stringify({ agent_id, message })
}));

// InteractionAgent.ts
async onRequest(request: Request) {
  if (url.pathname === '/relay') {
    const { agent_id, message } = await request.json();
    // ... handle
  }
}
```

**Same overhead as above.**

---

## Zero-Overhead JSRPC Implementation

### Flow 1: message_agent tool
```typescript
// tools.ts - Direct method call
const stub = env.RESEARCH_AGENT.get(agentId);
const reply = await stub.sendMessage(message);  // ✅ Zero overhead
return { response: reply };

// ResearchAgent.ts - Just define public method
async sendMessage(message: string): Promise<string> {
  this.setState({ 
    messages: [...(this.state?.messages ?? []), { role: 'user', content: message }] 
  });

  const result = await generateText({ ... });
  const reply = result.text || 'Okay.';
  
  this.setState({ 
    messages: [...(this.state?.messages ?? []), { role: 'assistant', content: reply }] 
  });
  
  return reply;  // ✅ Just return data
}
```

### Flow 2: bestEffortRelay
```typescript
// ResearchAgent.ts - Direct method call
const ia = env.INTERACTION_AGENT.get(iaId);
await ia.relay(this.state?.name, message);  // ✅ Zero overhead

// InteractionAgent.ts - Just define public method
async relay(agentId: string, message: string): Promise<void> {
  this.messages.push({
    role: 'user',
    content: `Agent ${agentId} reports: ${message}`
  });
  await this.saveMessages(this.messages);
}
```

---

## Benefits

| Aspect | HTTP (Current) | JSRPC (Zero Overhead) |
|--------|----------------|------------------------|
| **Syntax** | `stub.fetch(Request)` | `stub.method(args)` |
| **Overhead** | Request/Response wrappers | None - direct call |
| **Serialization** | Manual JSON | Automatic |
| **Type Safety** | ❌ None | ✅ Full TypeScript |
| **Testing** | Mock HTTP | Mock methods |
| **Performance** | 1 call per request | Multiple calls batched |

---

## Migration Strategy

### Phase 1: Add Public Methods (Keep HTTP)
- Add public methods to Agent classes
- Keep existing HTTP handlers
- Zero downtime

### Phase 2: Switch Tools to JSRPC
- Update tools one by one
- Test each change
- Remove HTTP handlers when unused

### Phase 3: Type Safety
- Update `Env` interface with typed AgentNamespace
- Get full TypeScript inference

---

## What Stays HTTP

**External API (User → InteractionAgent):**
```typescript
// Still uses HTTP/WebSocket
POST /api/chat
WebSocket /api/chat/ws
```

**Why:** Browsers/clients need HTTP/WebSocket, not JSRPC

**Internal communication (Agent ↔ Agent):**
```typescript
// Switch to JSRPC
stub.sendMessage()
stub.relay()
```

**Why:** Both are Durable Objects, can use zero-overhead JSRPC

---

## Summary

✅ **Official Cloudflare pattern**: Just call methods on Agent stubs  
✅ **Zero overhead**: No HTTP layer needed for agent-to-agent  
✅ **Type safe**: TypeScript knows what methods exist  
✅ **Easier testing**: Mock methods, not HTTP  
✅ **Keep HTTP for external API**: User-facing endpoints stay the same
