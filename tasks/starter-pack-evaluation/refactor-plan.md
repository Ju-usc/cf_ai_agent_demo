# Refactoring Plan: Align with Cloudflare Agents Starter Patterns

**Date:** October 15, 2025  
**Status:** Ready to Execute  
**Priority:** High Value, Medium Risk

---

## Executive Summary

After analyzing the official `cloudflare/agents-starter` repository, we've identified clear refactoring opportunities. The good news: **we're already using the official `agents` package correctly!** Our `Agent` base class IS the official Cloudflare SDK.

The main opportunity: **Upgrade to `AIChatAgent`** for InteractionAgent to get built-in chat handling, streaming, and message persistence.

---

## Current State Analysis

### What We're Using (✅ Correct!)

```typescript
import { Agent } from 'agents';  // ✅ Official Cloudflare SDK

export class InteractionAgent extends Agent<Env, InteractionState> {
  // We're extending the OFFICIAL base class
}
```

**Confirmed:** Our `Agent` import is from the official `@cloudflare/agents` package, not a custom class!

### Package Versions

```
Current:
- agents@0.2.13 ✅ Latest
- ai@3.4.33 ⚠️ (starter uses 5.0.68, but agents@0.2.13 includes ai@5.0.68)
- workers-ai-provider@0.2.2 ⚠️ (starter uses 2.0.0)

Action: Upgrade ai and workers-ai-provider, resolve peer dependency conflicts
```

---

## Key Discoveries from Starter Pack

### 1. `AIChatAgent` Class (Built-in Chat Support)

The official SDK provides `AIChatAgent` which extends `Agent` with:

```typescript
class AIChatAgent<Env, State> extends Agent<Env, State> {
  messages: UIMessage[];  // ✅ Automatic message storage
  
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ): Promise<Response | undefined>;
  
  async saveMessages(messages: UIMessage[]): Promise<void>;  // ✅ Auto persistence
  async persistMessages(messages: UIMessage[], excludeBroadcastIds?: string[]): Promise<void>;
}
```

**Benefits:**
- ✅ No manual message state management
- ✅ Built-in persistence to Durable Object storage
- ✅ WebSocket broadcasting to connected clients
- ✅ Automatic abort controller management
- ✅ Cleaner lifecycle (`onChatMessage` vs `onRequest`)

### 2. `routeAgentRequest` Helper

```typescript
import { routeAgentRequest } from 'agents';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return await routeAgentRequest(request, env) 
      || new Response('Not found', { status: 404 });
  }
};
```

**Convention-based routing:**
- `/agent/Chat/session-id` → routes to `Chat` DO with ID `session-id`
- `/agent/Research/dmd-research` → routes to `Research` DO
- Automatic stub creation and forwarding

### 3. Streaming Responses with `createUIMessageStream`

```typescript
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    const result = streamText({
      model,
      messages,
      tools
    });
    writer.merge(result.toUIMessageStream());
  }
});

return createUIMessageStreamResponse({ stream });
```

**Benefits:**
- ✅ Real-time streaming to client
- ✅ Tool calls streamed as they happen
- ✅ Better UX (no waiting for full response)

### 4. Human-in-the-Loop Tool Confirmation

**Tools without `execute`:**
```typescript
const dangerousTool = tool({
  description: "Delete all data",
  inputSchema: z.object({ confirm: z.boolean() })
  // No execute = requires user confirmation
});

export const executions = {
  dangerousTool: async ({ confirm }) => {
    // Only runs after user approves
    if (confirm) deleteEverything();
  }
};
```

### 5. Testing with `@cloudflare/vitest-pool-workers`

```typescript
import { env } from 'cloudflare:test';

describe('Agent', () => {
  it('should work', async () => {
    const stub = env.MY_AGENT.get(env.MY_AGENT.idFromName('test'));
    const response = await stub.fetch(/* ... */);
    expect(response.status).toBe(200);
  });
});
```

**Real Durable Objects in tests** - no mocking needed!

---

## Refactoring Plan

### Phase 1: Foundation & Infrastructure (Low Risk)

**Goal:** Set up testing, upgrade packages, organize code

#### 1.1 Upgrade Dependencies

```bash
npm install ai@^5.0.68 workers-ai-provider@^2.0.0
npm install @ai-sdk/ui-utils@latest
npm install --save-dev @cloudflare/vitest-pool-workers@^0.9.12
```

**Files Changed:**
- `package.json`
- `package-lock.json`

**Testing:** `npm install && npm run dev` should still work

#### 1.2 Add Testing Infrastructure

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

**Create `tests/agent-management.test.ts`:**
```typescript
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}

describe('Agent Management', () => {
  it('should create research agent', async () => {
    const id = env.INTERACTION_AGENT.idFromName('test-session');
    const stub = env.INTERACTION_AGENT.get(id);
    
    // Test agent creation
    const response = await stub.fetch(new Request('http://test/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Create a DMD research agent' })
    }));
    
    expect(response.status).toBe(200);
  });
});
```

**Add to `package.json`:**
```json
{
  "scripts": {
    "test": "vitest"
  }
}
```

**Files Changed:**
- NEW: `vitest.config.ts`
- NEW: `tests/agent-management.test.ts`
- `package.json`

**Testing:** `npm test` should run and pass

#### 1.3 Separate Tools into Dedicated Files

**Create `backend/tools/interaction_tools.ts`:**
```typescript
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { Env } from '../types';
import { createAgentManagementTools } from './agent_management';

export const createInteractionTools = (env: Env, storage: DurableObjectStorage) => {
  const agentMgr = createAgentManagementTools(env, storage);
  
  return {
    create_agent: tool({
      description: 'Create a new research agent for a specific domain',
      inputSchema: z.object({
        name: z.string().describe('Agent name (e.g., duchenne_md_research)'),
        description: z.string().describe('What this agent researches'),
        message: z.string().describe('Initial research task'),
      }),
      execute: async (params) => agentMgr.create_agent(
        params.name,
        params.description,
        params.message
      )
    }),
    
    list_agents: tool({
      description: 'List all known research agents',
      inputSchema: z.object({}),
      execute: async () => agentMgr.list_agents()
    }),
    
    message_agent: tool({
      description: 'Send a message to a specific research agent',
      inputSchema: z.object({
        agent_id: z.string().describe('The ID of the agent'),
        message: z.string().describe('Message to send'),
      }),
      execute: async (params) => agentMgr.message_agent(params.agent_id, params.message)
    })
  } satisfies ToolSet;
};
```

**Create `backend/tools/research_tools.ts`:**
```typescript
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { VirtualFs } from './file_system';

export const createResearchTools = (fs: VirtualFs, agentName: string, relayFn: (msg: string) => Promise<void>) => {
  return {
    write_file: tool({
      description: 'Write content to a file in the agent workspace',
      inputSchema: z.object({
        path: z.string().describe('Relative path within agent workspace'),
        content: z.string().describe('Text content to write'),
      }),
      execute: async (params) => {
        await fs.writeFile(params.path, params.content, { author: agentName });
        return { ok: true };
      }
    }),
    
    read_file: tool({
      description: 'Read content from a file in the agent workspace',
      inputSchema: z.object({
        path: z.string().describe('Relative path within agent workspace'),
      }),
      execute: async (params) => {
        const text = await fs.readFile(params.path);
        return { content: text };
      }
    }),
    
    list_files: tool({
      description: 'List files in a directory of the agent workspace',
      inputSchema: z.object({
        dir: z.string().optional().describe('Relative directory within agent workspace'),
      }),
      execute: async (params) => {
        const files = await fs.listFiles(params.dir);
        return { files };
      }
    }),
    
    send_message: tool({
      description: 'Send a status update back to the InteractionAgent',
      inputSchema: z.object({
        message: z.string().describe('Status or summary to report back'),
      }),
      execute: async (params) => {
        await relayFn(params.message);
        return { ok: true };
      }
    })
  } satisfies ToolSet;
};
```

**Files Changed:**
- NEW: `backend/tools/interaction_tools.ts`
- NEW: `backend/tools/research_tools.ts`
- MODIFY: `backend/agents/InteractionAgent.ts` (use tools from file)
- MODIFY: `backend/agents/ResearchAgent.ts` (use tools from file)

**Testing:** `npm run dev` should work, behavior unchanged

---

### Phase 2: Adopt Official Patterns (Medium Risk)

**Goal:** Use `AIChatAgent`, streaming, and routing helpers

#### 2.1 Upgrade InteractionAgent to `AIChatAgent`

**Before:**
```typescript
import { Agent } from 'agents';

export class InteractionAgent extends Agent<Env, InteractionState> {
  initialState: InteractionState = { messages: [] };
  
  async onRequest(request: Request): Promise<Response> {
    switch (url.pathname) {
      case '/chat': return this.handleChat(request);
      // ...
    }
  }
  
  private async handleChat(request: Request): Promise<Response> {
    const { message } = await request.json();
    this.setMessages([...this.getMessages(), { role: 'user', content: message }]);
    
    const result = await generateText({ model, messages, tools });
    
    this.setMessages([...this.getMessages(), { role: 'assistant', content: result.text }]);
    return Response.json({ message: result.text });
  }
}
```

**After:**
```typescript
import { AIChatAgent } from 'agents/ai-chat-agent';
import { type StreamTextOnFinishCallback, type ToolSet, streamText, createUIMessageStream, createUIMessageStreamResponse, convertToModelMessages } from 'ai';
import { createInteractionTools } from '../tools/interaction_tools';

export class InteractionAgent extends AIChatAgent<Env> {
  // ✅ No initialState needed - messages managed automatically
  // ✅ No onRequest needed - handled by AIChatAgent
  // ✅ No manual message management
  
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ): Promise<Response | undefined> {
    const tools = createInteractionTools(this.env, this.ctx.storage);
    
    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    
    const systemPrompt = 
      'You are the Interaction Agent for a medical innovation research system. ' +
      'You can manage research agents via tools.';
    
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          system: systemPrompt,
          messages: convertToModelMessages(this.messages),  // ✅ this.messages from AIChatAgent
          model,
          tools,
          onFinish: onFinish as StreamTextOnFinishCallback<typeof tools>,
          abortSignal: options?.abortSignal
        });
        
        writer.merge(result.toUIMessageStream());
      }
    });
    
    return createUIMessageStreamResponse({ stream });
  }
}
```

**Benefits:**
- ❌ Remove ~50 lines of manual state management
- ✅ Get automatic message persistence
- ✅ Get streaming responses
- ✅ Get WebSocket support for free
- ✅ Cleaner, more maintainable code

**Files Changed:**
- MODIFY: `backend/agents/InteractionAgent.ts`

**Testing:** 
- `npm run dev`
- Test `/api/chat` endpoint
- Verify messages persist
- Verify agent creation still works

#### 2.2 Update Worker Entry Point to Use `routeAgentRequest`

**Before:**
```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/api/chat')) {
      const id = env.INTERACTION_AGENT.idFromName('default');
      const stub = env.INTERACTION_AGENT.get(id);
      const response = await stub.fetch(
        new Request(`${stub}${url.pathname.replace('/api', '')}`, request)
      );
      return new Response(response.body, {
        status: response.status,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders }
      });
    }
    
    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  }
};
```

**After:**
```typescript
import { routeAgentRequest } from 'agents';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Health check
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' }, { headers: corsHeaders });
    }
    
    // Route to agents via official helper
    const response = await routeAgentRequest(request, env);
    if (response) {
      // Add CORS headers
      return new Response(response.body, {
        status: response.status,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders }
      });
    }
    
    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  }
} satisfies ExportedHandler<Env>;
```

**URL Pattern Changes:**
- Old: `/api/chat` → New: `/agent/InteractionAgent/default`
- Old: Custom routing → New: Convention-based

**Compatibility Option:** Keep `/api/chat` for backward compatibility:
```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Backward compatibility: /api/chat → /agent/InteractionAgent/default
    if (url.pathname === '/api/chat') {
      return fetch(new Request(
        url.origin + '/agent/InteractionAgent/default',
        request
      ));
    }
    
    return await routeAgentRequest(request, env)
      || Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  }
};
```

**Files Changed:**
- MODIFY: `backend/index.ts`

**Testing:**
- Test `/api/chat` still works (if keeping compatibility)
- Test `/agent/InteractionAgent/default` works
- Test `/health` works

#### 2.3 Update Wrangler Config

**Change `wrangler.toml` → `wrangler.jsonc` (optional, for comments):**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "medical-innovation-agent",
  "main": "backend/index.ts",
  "compatibility_date": "2025-10-11",
  "compatibility_flags": ["nodejs_compat"],
  
  "observability": {
    "enabled": true
  },
  
  // Workers AI binding
  "ai": {
    "binding": "AI"
  },
  
  // D1 Database
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "medical-innovation-db",
      "database_id": ""  // Fill after: wrangler d1 create medical-innovation-db
    }
  ],
  
  // R2 Storage
  "r2_buckets": [
    {
      "binding": "R2",
      "bucket_name": "medical-innovation-files"
    }
  ],
  
  // Durable Objects
  "durable_objects": {
    "bindings": [
      {
        "name": "INTERACTION_AGENT",
        "class_name": "InteractionAgent"
      },
      {
        "name": "RESEARCH_AGENT",
        "class_name": "ResearchAgent"
      }
    ]
  },
  
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["InteractionAgent", "ResearchAgent"]
    }
  ],
  
  "vars": {
    "ENVIRONMENT": "development"
  }
}
```

**Files Changed:**
- RENAME: `wrangler.toml` → `wrangler.jsonc` (optional)
- MODIFY: Package scripts if renamed

---

### Phase 3: Advanced Features (Low Risk, High Value)

**Goal:** Add HITL tool confirmation, scheduling, polish

#### 3.1 Human-in-the-Loop Tool Confirmation

**Identify high-risk tools:**
- `create_agent` - Maybe? (spawns new resources)
- `message_agent` - No (low risk)
- `send_message` (in ResearchAgent) - No (informational)

**For future email/trigger tools:**
```typescript
// backend/tools/interaction_tools.ts
export const createInteractionTools = (env: Env, storage: DurableObjectStorage) => {
  const tools = {
    // Auto-execute tools
    list_agents: tool({ /* ... */ }),
    
    // Requires confirmation
    create_agent: tool({
      description: 'Create a new research agent',
      inputSchema: z.object({ /* ... */ })
      // No execute = requires confirmation
    })
  } satisfies ToolSet;
  
  const executions = {
    create_agent: async (params) => {
      // Only runs after user confirms
      return agentMgr.create_agent(/* ... */);
    }
  };
  
  return { tools, executions };
};
```

**Update InteractionAgent:**
```typescript
import { processToolCalls } from '../utils/tool-processing';

async onChatMessage(onFinish, options) {
  const { tools, executions } = createInteractionTools(this.env, this.ctx.storage);
  
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Process pending confirmations
      const processedMessages = await processToolCalls({
        messages: this.messages,
        dataStream: writer,
        tools,
        executions
      });
      
      const result = streamText({
        messages: convertToModelMessages(processedMessages),
        model,
        tools,
        onFinish
      });
      
      writer.merge(result.toUIMessageStream());
    }
  });
  
  return createUIMessageStreamResponse({ stream });
}
```

**Files Changed:**
- MODIFY: `backend/tools/interaction_tools.ts`
- NEW: `backend/utils/tool-processing.ts` (copy from starter)
- NEW: `backend/shared.ts` (APPROVAL constants)
- MODIFY: `backend/agents/InteractionAgent.ts`

#### 3.2 Add Scheduling Support to ResearchAgent

```typescript
import { type Schedule } from 'agents';

export class ResearchAgent extends Agent<Env, ResearchState> {
  // ... existing code ...
  
  async executeTask(description: string, task: Schedule<string>): Promise<void> {
    // Called when scheduled task fires
    await this.handleMessage({
      json: async () => ({ message: `Scheduled task: ${description}` })
    } as Request);
  }
}
```

**Add scheduling tool:**
```typescript
// backend/tools/research_tools.ts
import { scheduleSchema } from 'agents/schedule';

schedule_task: tool({
  description: 'Schedule a task for later execution',
  inputSchema: scheduleSchema,
  execute: async ({ when, description }, context) => {
    const { agent } = getCurrentAgent<ResearchAgent>();
    
    if (when.type === 'scheduled') {
      agent.schedule(when.date, 'executeTask', description);
    } else if (when.type === 'delayed') {
      agent.schedule(when.delayInSeconds, 'executeTask', description);
    } else if (when.type === 'cron') {
      agent.schedule(when.cron, 'executeTask', description);
    }
    
    return `Task scheduled: ${description}`;
  }
})
```

**Files Changed:**
- MODIFY: `backend/agents/ResearchAgent.ts`
- MODIFY: `backend/tools/research_tools.ts`

#### 3.3 Project Structure Polish

**Optional restructuring:**
- RENAME: `backend/` → `src/` (aligns with starter)
- MOVE: `docs/` → `docs/` (keep as is)
- MOVE: `tasks/` → `tasks/` (keep as is)

**Update imports if renaming:**
```bash
# If renaming backend → src
sed -i '' 's|backend/|src/|g' wrangler.jsonc
sed -i '' 's|backend/|src/|g' tsconfig.json
```

---

## Testing Strategy

### Unit Tests
```bash
npm test
```

**Coverage:**
- Agent creation/listing/messaging
- File system operations (VirtualFs)
- Tool execution
- Message persistence

### Integration Tests
```bash
npm run dev
# Manual testing with curl/Postman
```

**Test Cases:**
1. Create research agent
2. List agents
3. Message agent
4. Agent persists files to R2
5. Agent relays message back
6. Streaming works in UI

### E2E Tests
```bash
npm run deploy
# Test on deployed worker
```

**Test Cases:**
1. Full agent lifecycle in production
2. Durable Object persistence
3. R2 file operations
4. Multiple concurrent sessions

---

## Risk Assessment

| Change | Risk Level | Mitigation |
|--------|-----------|------------|
| Package upgrades | Low | Test locally first |
| Add testing | Low | Doesn't affect runtime |
| Separate tools | Low | Just reorganization |
| Use AIChatAgent | Medium | Test thoroughly, keep backup |
| Use routeAgentRequest | Low | Can keep compatibility layer |
| HITL confirmation | Low | Additive feature |
| Scheduling | Low | Additive feature |
| Rename directories | Low | Update imports carefully |

**Overall Risk:** Medium-Low (incremental changes, can rollback any step)

---

## Rollback Strategy

Each phase is independent and can be rolled back:

**Phase 1:**
- `git revert <commit>` - Testing/tools organization changes don't affect runtime

**Phase 2:**
- Keep old InteractionAgent implementation in `InteractionAgent.legacy.ts`
- Can swap back if issues arise
- Keep compatibility layer for `/api/chat` endpoint

**Phase 3:**
- All additive features
- Can disable by removing tool definitions

---

## Success Metrics

### Code Quality
- [ ] Reduced LOC in InteractionAgent by ~40%
- [ ] Test coverage > 70%
- [ ] All tests passing
- [ ] No TypeScript errors

### Functionality
- [ ] All existing features work
- [ ] Streaming responses work
- [ ] Message persistence works
- [ ] Multi-agent communication works
- [ ] File system operations work

### Performance
- [ ] Response time < 2s
- [ ] Streaming latency < 500ms
- [ ] No regressions

---

## Timeline

### Week 1: Phase 1 (Foundation)
- Day 1: Upgrade packages, add testing
- Day 2: Write tests for existing functionality
- Day 3: Separate tools into files
- Day 4: Testing & validation

### Week 2: Phase 2 (Core Patterns)
- Day 1: Upgrade InteractionAgent to AIChatAgent
- Day 2: Update worker entry point
- Day 3: Testing & bug fixes
- Day 4: Deploy to staging, validate

### Week 3: Phase 3 (Polish)
- Day 1: Add HITL confirmation
- Day 2: Add scheduling support
- Day 3: Project structure polish
- Day 4: Final testing, deploy to production

**Total: 3 weeks, incremental delivery**

---

## Next Steps

1. ✅ Review this refactoring plan
2. ⬜ Get approval from team/stakeholders
3. ⬜ Create feature branch: `refactor/cloudflare-starter-patterns`
4. ⬜ Start Phase 1: Upgrade packages
5. ⬜ Create PR after each phase for review

---

## Questions & Decisions

### Decision 1: Keep `/api/chat` endpoint?
**Options:**
- A. Keep for backward compatibility (add redirect)
- B. Switch to `/agent/InteractionAgent/default` only
- C. Support both

**Recommendation:** Option C (support both) for smooth transition

### Decision 2: Rename `backend/` to `src/`?
**Recommendation:** Later, after Phase 2 is stable (not critical)

### Decision 3: Add HITL for `create_agent`?
**Recommendation:** Yes, good pattern for user to review before spawning resources

### Decision 4: When to add frontend UI?
**Recommendation:** After Phase 2 is complete and stable

---

## Summary

**Current State:** Using official SDK correctly, but manually implementing patterns that are built-in.

**Target State:** Leverage official `AIChatAgent`, streaming, routing, and testing infrastructure.

**Value:** 
- 40% less code
- Better UX (streaming)
- More maintainable
- Easier testing
- Aligned with Cloudflare best practices

**Risk:** Medium-Low (incremental, testable, reversible)

**Timeline:** 3 weeks

**Ready to Execute:** Yes! Let's start with Phase 1.

