# Cloudflare Agents Starter - Pattern Comparison & Analysis

**Date:** October 15, 2025  
**Task:** Compare official `cloudflare/agents-starter` patterns with our current implementation  
**Goal:** Create actionable refactoring plan to align with Cloudflare best practices

---

## Executive Summary

**Good News:** We're already 70% aligned with Cloudflare's patterns! Our core architecture is solid.

**Key Findings:**
1. ✅ We're using the right packages (`agents`, `ai`, `workers-ai-provider`, `zod`)
2. ✅ Our Agent base class extends Durable Objects correctly
3. ✅ Our tool definitions use Zod schemas and AI SDK's `tool()` function
4. ⚠️ We're using **our own custom `Agent` base class** instead of official SDK classes
5. ⚠️ Missing: Official routing helpers (`routeAgentRequest`, `AIChatAgent`)
6. ⚠️ Missing: Proper testing infrastructure with `@cloudflare/vitest-pool-workers`
7. ⚠️ Different: Message format (we use simple objects, they use UI message parts)

---

## Side-by-Side Pattern Comparison

### 1. Agent Class Definition

#### ❌ Our Current Pattern

```typescript
// backend/agents/InteractionAgent.ts
import { Agent } from 'agents';  // OUR CUSTOM BASE CLASS!

type InteractionState = {
  messages: Message[];
};

export class InteractionAgent extends Agent<Env, InteractionState> {
  initialState: InteractionState = { messages: [] };

  async onRequest(request: Request): Promise<Response> {
    // Manual routing
    switch (url.pathname) {
      case '/chat': return this.handleChat(request);
      case '/history': return this.getHistory();
      // ...
    }
  }
  
  private async handleChat(request: Request): Promise<Response> {
    // Manual implementation
  }
}
```

#### ✅ Starter Pattern (Correct)

```typescript
// src/server.ts
import { routeAgentRequest } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import type { StreamTextOnFinishCallback, ToolSet } from "ai";

export class Chat extends AIChatAgent<Env> {
  // NO initialState needed - built into AIChatAgent
  // NO onRequest needed - handled by AIChatAgent
  
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // Simplified - just handle chat logic
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model,
          messages: convertToModelMessages(this.messages),  // this.messages provided by AIChatAgent
          tools,
          onFinish
        });
        writer.merge(result.toUIMessageStream());
      }
    });
    
    return createUIMessageStreamResponse({ stream });
  }
}

// Worker routing
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    return (
      await routeAgentRequest(request, env) ||
      new Response("Not found", { status: 404 })
    );
  }
}
```

**Key Differences:**
- ❗ They use `AIChatAgent` - a specialized base class with built-in chat handling
- ❗ They use `routeAgentRequest` - automatic routing based on URL patterns
- ❗ They use `onChatMessage` lifecycle - cleaner than manual `onRequest`
- ❗ Built-in message storage (`this.messages`) - no manual state management
- ❗ Streaming responses with `createUIMessageStream` - better UX

---

### 2. Tool Definition Pattern

#### ✅ Our Pattern (Actually Good!)

```typescript
// backend/agents/InteractionAgent.ts
const tools = {
  create_agent: tool({
    description: 'Create a new research agent for a specific domain',
    parameters: z.object({
      name: z.string().describe('Agent name'),
      description: z.string().describe('What this agent researches'),
      message: z.string().describe('Initial research task'),
    }),
    execute: async ({ name, description, message }) => {
      return agentMgr.create_agent(name, description, message);
    },
  }),
  // More tools...
};
```

#### ✅ Starter Pattern (Slightly Better Organization)

```typescript
// src/tools.ts - SEPARATE FILE
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  inputSchema: z.object({ city: z.string() })  // Note: inputSchema not parameters
  // No execute = requires human confirmation
});

const getLocalTime = tool({
  description: "get the local time for a specified location",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    return "10am";
  }
});

export const tools = {
  getWeatherInformation,
  getLocalTime,
} satisfies ToolSet;

// Separate executions object for HITL tools
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    return `The weather in ${city} is sunny`;
  }
};
```

**Key Differences:**
- ✅ They separate tools into dedicated file (`tools.ts`)
- ✅ They use `inputSchema` instead of `parameters` (likely a version difference)
- ✅ They have explicit `executions` object for human-in-the-loop confirmation
- ✅ They use `satisfies ToolSet` for type checking

**Our Approach:** Actually very similar! We just inline tools in the agent. Moving to separate file would be cleaner.

---

### 3. Message Handling & State

#### ❌ Our Pattern (Manual State Management)

```typescript
// backend/agents/InteractionAgent.ts
type InteractionState = {
  messages: Message[];
};

export class InteractionAgent extends Agent<Env, InteractionState> {
  initialState: InteractionState = { messages: [] };
  
  private getMessages(): Message[] {
    return this.state?.messages ?? this.initialState.messages;
  }

  private setMessages(nextMessages: Message[]) {
    this.setState({ messages: nextMessages });
  }
  
  private async handleChat(request: Request): Promise<Response> {
    const { message } = await request.json<{ message: string }>();
    this.setMessages([...this.getMessages(), { role: 'user', content: message }]);
    
    // ... generate response ...
    
    this.setMessages([...this.getMessages(), { role: 'assistant', content: assistantMessage }]);
    return Response.json({ message: assistantMessage });
  }
}
```

**Issues:**
- ❌ Manual state management with getters/setters
- ❌ Simple message format (just role + content)
- ❌ No streaming support
- ❌ No tool confirmation UI support

#### ✅ Starter Pattern (Automatic State + Rich UI)

```typescript
// src/server.ts
export class Chat extends AIChatAgent<Env> {
  // NO manual state - messages are managed by AIChatAgent
  
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls
        const cleanedMessages = cleanupMessages(this.messages);
        
        // Process pending tool confirmations
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });
        
        const result = streamText({
          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish
        });
        
        writer.merge(result.toUIMessageStream());
      }
    });
    
    return createUIMessageStreamResponse({ stream });
  }
}
```

**Benefits:**
- ✅ `this.messages` automatically managed by `AIChatAgent`
- ✅ Messages stored in Durable Object storage automatically
- ✅ Rich message format with parts (text, tool calls, tool results)
- ✅ Built-in streaming via `createUIMessageStream`
- ✅ Human-in-the-loop tool confirmation via `processToolCalls`
- ✅ Automatic message cleanup

---

### 4. Tool Confirmation (Human-in-the-Loop)

#### ❌ Our Pattern (Not Implemented)

We don't have HITL tool confirmation. All tools execute automatically.

#### ✅ Starter Pattern (Full HITL Support)

```typescript
// src/tools.ts
const getWeatherInformation = tool({
  description: "show the weather in a given city",
  inputSchema: z.object({ city: z.string() })
  // No execute function = requires confirmation
});

export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    // Only runs after user confirms
    return `The weather in ${city} is sunny`;
  }
};

// src/utils.ts - Process tool confirmations
export async function processToolCalls({
  messages,
  dataStream,
  executions
}) {
  return await Promise.all(
    messages.map(async (message) => {
      const processedParts = await Promise.all(
        message.parts.map(async (part) => {
          if (!isToolUIPart(part)) return part;
          
          const toolName = part.type.replace("tool-", "");
          
          if (part.output === APPROVAL.YES) {
            // User approved - execute tool
            const result = await executions[toolName](part.input);
            return { ...part, output: result };
          } else if (part.output === APPROVAL.NO) {
            return { ...part, output: "Error: User denied" };
          }
          
          return part;  // Still awaiting confirmation
        })
      );
      return { ...message, parts: processedParts };
    })
  );
}
```

**This enables:**
- User sees tool call preview
- User can approve/deny
- Tool only executes after approval
- Perfect for high-risk operations (email sending, data deletion, etc.)

---

### 5. Routing & Entry Point

#### ❌ Our Pattern (Manual Routing)

```typescript
// backend/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Manual routing to DO
    if (url.pathname.startsWith('/api/chat')) {
      const id = env.INTERACTION_AGENT.idFromName('default');
      const stub = env.INTERACTION_AGENT.get(id);
      const response = await stub.fetch(
        new Request(`${stub}${url.pathname.replace('/api', '')}`, request)
      );
      return response;
    }
    
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
};
```

**Issues:**
- ❌ Manual URL parsing and routing
- ❌ Manual stub creation
- ❌ Path rewriting logic (`/api/chat` → `/chat`)

#### ✅ Starter Pattern (Automatic Routing)

```typescript
// src/server.ts
import { routeAgentRequest } from "agents";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    return (
      await routeAgentRequest(request, env) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
```

**Benefits:**
- ✅ `routeAgentRequest` handles all routing automatically
- ✅ Convention-based: `/agent/Chat/session-id` routes to Chat DO
- ✅ No manual stub management
- ✅ Works with multiple agent types

---

### 6. Testing Infrastructure

#### ❌ Our Pattern (No Tests)

We have zero tests. 😬

#### ✅ Starter Pattern (Full Test Suite)

```typescript
// tests/index.test.ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/server";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

describe("Chat worker", () => {
  it("responds with Not found", async () => {
    const request = new Request("http://example.com");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    
    expect(await response.text()).toBe("Not found");
    expect(response.status).toBe(404);
  });
});

// vitest.config.ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" }
      }
    }
  }
});
```

**Benefits:**
- ✅ Real Durable Object testing via `@cloudflare/vitest-pool-workers`
- ✅ Access to `env` bindings (D1, R2, DO stubs)
- ✅ No mocking needed - tests run in actual Workers runtime
- ✅ Fast local execution

---

### 7. Project Structure

#### Our Structure
```
cf_ai_agent_demo/
├── backend/
│   ├── agents/
│   │   ├── InteractionAgent.ts
│   │   └── ResearchAgent.ts
│   ├── tools/
│   │   ├── agent_management.ts
│   │   └── file_system.ts
│   ├── db/
│   │   └── schema.sql
│   ├── index.ts
│   └── types.ts
├── docs/
├── tasks/
├── wrangler.toml
└── package.json
```

#### Starter Structure
```
cf-agents-reference/
├── src/
│   ├── server.ts         # Agent + Worker entry point
│   ├── tools.ts          # Tool definitions
│   ├── utils.ts          # Helper functions
│   ├── shared.ts         # Shared constants
│   ├── app.tsx           # React chat UI
│   ├── client.tsx        # Client entry
│   └── components/       # UI components
├── tests/
│   ├── index.test.ts
│   └── tsconfig.json
├── public/
├── wrangler.jsonc
├── vitest.config.ts
├── vite.config.ts
└── package.json
```

**Key Differences:**
- ✅ They use `src/` not `backend/`
- ✅ They combine agent + worker entry in single file
- ✅ They have dedicated test directory
- ✅ They use Vite for frontend bundling
- ✅ They use `wrangler.jsonc` (with comments)

---

## What We're Doing Well ✅

1. **Multi-Agent Architecture** - Our Interaction + Research agent pattern is solid and more advanced than their single-agent example
2. **Tool Organization** - Our agent management tools are well-structured
3. **File System Abstraction** - Our VirtualFs class is a great pattern they don't have
4. **Domain-Specific Design** - Our medical research focus is clear
5. **Using Same Core Packages** - `agents`, `ai`, `workers-ai-provider`, `zod`
6. **Zod Schemas** - We're using Zod for validation correctly
7. **Type Safety** - Good TypeScript patterns

---

## What We Need to Change ❗

### Critical (High Impact)

1. **Use Official Agent Base Classes**
   - Replace our custom `Agent<Env, State>` with official SDK classes
   - Use `AIChatAgent` for InteractionAgent
   - Use base `Agent` for ResearchAgent
   - Get built-in message management, routing, scheduling

2. **Adopt Routing Helpers**
   - Use `routeAgentRequest` in worker entry point
   - Remove manual routing logic
   - Follow convention-based URL patterns

3. **Implement Streaming Responses**
   - Use `createUIMessageStream` and `streamText`
   - Better UX with real-time responses
   - Required for tool confirmation UI

4. **Add Testing Infrastructure**
   - Install `@cloudflare/vitest-pool-workers`
   - Create `vitest.config.ts`
   - Write tests for agent creation, tools, file system

### Medium Impact

5. **Separate Tools into Dedicated Files**
   - Create `tools/interaction_tools.ts`
   - Create `tools/research_tools.ts`
   - Use `satisfies ToolSet` for type checking

6. **Implement Human-in-the-Loop Tool Confirmation**
   - Add `executions` object for high-risk tools
   - Implement `processToolCalls` utility
   - Update UI to show tool confirmation dialogs

7. **Rich Message Format**
   - Migrate from simple `{role, content}` to UI message parts
   - Support tool calls as message parts
   - Enable better UI rendering

### Low Impact (Nice to Have)

8. **Project Structure Alignment**
   - Rename `backend/` to `src/`
   - Use `wrangler.jsonc` for comments
   - Add Vite config for frontend

9. **Utility Functions**
   - Add `cleanupMessages` helper
   - Add shared constants file
   - Better error handling utilities

---

## Critical Insight: We're Using a Custom Agent Class!

**THE BIG ISSUE:** We imported `Agent` from `'agents'` package, but we're using OUR OWN custom base class, not the official SDK!

Looking at our code:
```typescript
import { Agent } from 'agents';  // This is OUR custom class!

export class InteractionAgent extends Agent<Env, InteractionState> {
  initialState: InteractionState = { messages: [] };
  async onRequest(request: Request): Promise<Response> { /* ... */ }
}
```

We need to find where we defined this custom `Agent` class and replace it with official SDK classes.

**The official SDK provides:**
- `AIChatAgent` - For chat-based agents (like InteractionAgent)
- Base `Agent` - For custom agents (like ResearchAgent)
- Built-in lifecycle methods (`onChatMessage`, `executeTask`)
- Automatic message persistence
- Scheduling support

---

## Package Comparison

### Our Dependencies
```json
{
  "dependencies": {
    "@cloudflare/workers-types": "^4.20241022.0",
    "agents": "^0.2.13",           // ✅ Same version
    "ai": "^3.3.9",                 // ⚠️ OLD - they use 5.0.68
    "workers-ai-provider": "^0.2.2", // ⚠️ OLD - they use 2.0.0
    "zod": "^3.23.8"                // ✅ Similar
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.6.0",  // ⚠️ OLD - they use 0.9.12
    "typescript": "^5.6.3",
    "vitest": "~3.0.0",            // ✅ Similar
    "wrangler": "^4.42.2"          // ✅ Same
  }
}
```

### Starter Dependencies
```json
{
  "dependencies": {
    "@ai-sdk/openai": "^2.0.48",    // ➕ NEW - OpenAI provider
    "@ai-sdk/react": "^2.0.68",     // ➕ NEW - React hooks
    "@ai-sdk/ui-utils": "^1.2.11",  // ➕ NEW - UI utilities
    "agents": "^0.2.12",
    "ai": "^5.0.68",                // ⬆️ NEWER
    "workers-ai-provider": "^2.0.0", // ⬆️ NEWER
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.9.12",  // ⬆️ NEWER
    "@vitejs/plugin-react": "^5.0.4",  // ➕ NEW - For React
    "vite": "^7.1.9",                  // ➕ NEW - Build tool
    "vitest": "3.2.4"
  }
}
```

**Actions:**
- ⬆️ Upgrade `ai` to 5.x
- ⬆️ Upgrade `workers-ai-provider` to 2.x
- ⬆️ Upgrade `@cloudflare/vitest-pool-workers` to 0.9.x
- ➕ Add `@ai-sdk/ui-utils` for streaming
- ➕ Add Vite if we build a UI

---

## Migration Complexity Assessment

| Component | Current State | Target State | Effort | Risk |
|-----------|--------------|--------------|--------|------|
| **Agent Base Class** | Custom | Official SDK | High | Medium |
| **Tool Definitions** | Inline | Separate files | Low | Low |
| **Message Format** | Simple objects | UI parts | Medium | Medium |
| **Routing** | Manual | `routeAgentRequest` | Low | Low |
| **Streaming** | None | `createUIMessageStream` | Medium | Low |
| **HITL Confirmation** | None | Full support | Medium | Low |
| **Testing** | None | Vitest + Workers | Medium | Low |
| **Multi-Agent** | Working | Keep + enhance | Low | Low |
| **File System** | Working | Keep | None | Low |

**Overall Assessment:** Medium complexity, manageable in phases.

---

## Recommended Migration Strategy

### Phase 1: Foundation (Low Risk, High Value)
**Goal:** Modernize without breaking existing functionality

1. **Upgrade packages**
   ```bash
   npm install ai@latest workers-ai-provider@latest @cloudflare/vitest-pool-workers@latest
   npm install --save-dev vite @vitejs/plugin-react
   ```

2. **Add testing infrastructure**
   - Create `vitest.config.ts`
   - Add basic test in `tests/`
   - Verify DO bindings work

3. **Separate tools into files**
   - Create `backend/tools/interaction_tools.ts`
   - Create `backend/tools/research_tools.ts`
   - Keep functionality identical

4. **Use official routing**
   - Import `routeAgentRequest`
   - Simplify `backend/index.ts`
   - Test routing still works

**Outcome:** Better structure, tests, no breaking changes

### Phase 2: Core Patterns (Medium Risk, High Value)
**Goal:** Align with official SDK patterns

5. **Find and replace custom Agent base class**
   - Locate our custom `Agent<Env, State>` definition
   - Replace with official `AIChatAgent` for InteractionAgent
   - Update `onRequest` → `onChatMessage`
   - Test thoroughly

6. **Implement streaming responses**
   - Add `createUIMessageStream` to InteractionAgent
   - Use `streamText` instead of `generateText`
   - Update frontend to handle streaming

7. **Rich message format**
   - Migrate from `{role, content}` to UI message parts
   - Update message storage
   - Keep backward compatibility

**Outcome:** Using official patterns, better UX

### Phase 3: Advanced Features (Low Risk, Nice to Have)
**Goal:** Add missing features

8. **Human-in-the-loop tool confirmation**
   - Add `executions` object
   - Implement `processToolCalls`
   - Update UI for confirmations

9. **Scheduling support**
   - Add `executeTask` to ResearchAgent
   - Enable trigger system
   - Test scheduled tasks

10. **Project restructure**
    - Rename `backend/` → `src/`
    - Use `wrangler.jsonc`
    - Polish structure

**Outcome:** Feature-complete, production-ready

---

## Specific Code Changes Needed

### Change 1: Update Package Versions

```bash
npm install ai@^5.0.68 workers-ai-provider@^2.0.0 @cloudflare/vitest-pool-workers@^0.9.12
npm install --save @ai-sdk/ui-utils
```

### Change 2: Replace Custom Agent with Official SDK

**Before:**
```typescript
import { Agent } from 'agents';  // Our custom class

export class InteractionAgent extends Agent<Env, InteractionState> {
  initialState: InteractionState = { messages: [] };
  
  async onRequest(request: Request): Promise<Response> {
    // Manual routing
  }
}
```

**After:**
```typescript
import { AIChatAgent } from 'agents/ai-chat-agent';
import { type StreamTextOnFinishCallback, type ToolSet } from 'ai';

export class InteractionAgent extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>
  ) {
    // this.messages is provided by AIChatAgent
    // Implement streaming chat
  }
}
```

### Change 3: Update Worker Entry Point

**Before:**
```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/chat')) {
      const id = env.INTERACTION_AGENT.idFromName('default');
      const stub = env.INTERACTION_AGENT.get(id);
      return await stub.fetch(/* ... */);
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
};
```

**After:**
```typescript
import { routeAgentRequest } from 'agents';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return (
      await routeAgentRequest(request, env) ||
      new Response('Not found', { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
```

### Change 4: Create Separate Tools File

**Create `backend/tools/interaction_tools.ts`:**
```typescript
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { Env } from '../types';

export const createInteractionTools = (env: Env, storage: DurableObjectStorage) => {
  const agentMgr = createAgentManagementTools(env, storage);
  
  return {
    create_agent: tool({
      description: 'Create a new research agent',
      inputSchema: z.object({
        name: z.string(),
        description: z.string(),
        message: z.string()
      }),
      execute: async (params) => agentMgr.create_agent(params.name, params.description, params.message)
    }),
    
    list_agents: tool({
      description: 'List all research agents',
      inputSchema: z.object({}),
      execute: async () => agentMgr.list_agents()
    }),
    
    message_agent: tool({
      description: 'Send message to research agent',
      inputSchema: z.object({
        agent_id: z.string(),
        message: z.string()
      }),
      execute: async (params) => agentMgr.message_agent(params.agent_id, params.message)
    })
  } satisfies ToolSet;
};
```

### Change 5: Add Testing

**Create `vitest.config.ts`:**
```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' }
      }
    }
  }
});
```

**Create `tests/interaction-agent.test.ts`:**
```typescript
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../backend/index';

describe('InteractionAgent', () => {
  it('should create research agent', async () => {
    const request = new Request('http://test/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Create a DMD research agent' })
    });
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('message');
  });
});
```

---

## Next Steps

1. ✅ Review this comparison document
2. ⬜ Locate our custom `Agent` base class definition
3. ⬜ Create refactoring plan with specific PRs
4. ⬜ Start Phase 1 (low-risk changes)
5. ⬜ Test each change thoroughly
6. ⬜ Move to Phase 2 once stable

---

## Questions to Answer

1. Where is our custom `Agent<Env, State>` base class defined?
2. Do we want to keep manual routing or adopt `routeAgentRequest`?
3. Should we implement HITL tool confirmation for agent creation?
4. When should we add the frontend chat UI?
5. Should we rename `backend/` to `src/` now or later?

---

## Key Takeaways

✅ **Our architecture is fundamentally sound** - multi-agent design is solid  
✅ **We're using the right packages** - just need upgrades  
❗ **Main issue: Custom Agent base class** - need to find and replace  
❗ **Missing: Testing infrastructure** - easy to add  
📈 **Migration is incremental** - can do in safe phases  
🎯 **End goal: Official patterns + our domain logic** - best of both worlds


