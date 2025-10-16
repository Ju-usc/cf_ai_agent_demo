# Starter Pack Evaluation

**Date:** October 15, 2025  
**Context:** Considering whether to scaffold with `cloudflare/agents-starter` and merge/migrate

---

## The Simple Command

```bash
npm create cloudflare@latest my-agent -- --template=cloudflare/agents-starter
```

Or interactively:
```bash
npm create cloudflare@latest
# Then select "Agents starter"
```

---

## Current State Assessment

### What We Built (Custom Implementation)
- ✅ Custom `Agent` base class extending `DurableObject`
- ✅ InteractionAgent + ResearchAgent structure
- ✅ Manual tool schemas with Zod
- ✅ Direct Workers AI calls (`env.AI.run`)
- ✅ Agent management tools (create, list, message)
- ⚠️ Not using official Cloudflare Agents SDK
- ⚠️ Custom patterns that may diverge from CF best practices

### What Starter Pack Provides
- ✅ Official `Agent` class from `agents` package
- ✅ AI SDK abstraction (provider-agnostic, supports Workers AI)
- ✅ Tool builder pattern with Zod validation
- ✅ Proper testing with `@cloudflare/vitest-pool-workers`
- ✅ Example chat interface
- ✅ Durable Object routing patterns
- ✅ TypeScript + ESLint config

---

## Key Differences in Code Patterns

### Our Current Pattern (InteractionAgent.ts)

```typescript
import { Agent } from 'agents';  // Our custom base class
import { createWorkersAI } from 'workers-ai-provider';
import { generateText, tool } from 'ai';

export class InteractionAgent extends Agent<Env, InteractionState> {
  async onRequest(request: Request): Promise<Response> {
    // Manual routing
  }
  
  private async handleChat(request: Request): Promise<Response> {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    
    // Manual tool definitions inline
    const tools = {
      create_agent: tool({
        description: '...',
        parameters: z.object({ ... }),
        execute: async ({ ... }) => { ... }
      })
    };
    
    const result = await generateText({ model, messages, tools });
  }
}
```

### Starter Pack Pattern (Expected)

```typescript
import { Agent } from '@cloudflare/agents';  // Official SDK
import { defineTools } from '@cloudflare/agents';  // Tool builder
import { z } from 'zod';

// Tools defined separately with builder
const tools = defineTools({
  create_agent: {
    description: 'Create a new research agent',
    parameters: z.object({
      name: z.string(),
      description: z.string(),
      message: z.string()
    }),
    execute: async ({ name, description, message }, { env, ctx }) => {
      // Tool implementation with access to env/ctx
      return agentMgr.create_agent(name, description, message);
    }
  }
});

export class InteractionAgent extends Agent {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.registerTools(tools);  // Register tools with agent
  }
  
  // Simpler request handling via SDK
}
```

---

## Migration Strategy Options

### Option A: Side-by-Side Learning (Recommended for Now)

**Steps:**
1. Create starter in parallel directory for reference
2. Study their patterns (tool definition, routing, testing)
3. Incrementally refactor our code to match patterns
4. Keep our architecture and domain logic intact
5. Adopt best practices without throwing away work

**Pros:**
- Lower risk - we keep our working code
- Learn by comparison
- Can cherry-pick what we need
- Preserves our research and architecture docs

**Cons:**
- Slower to full alignment
- Potential to miss some patterns
- Still maintaining custom code

**Command:**
```bash
cd /Users/juyounglee/Desktop/Projects
npm create cloudflare@latest cf-agents-reference -- --template=cloudflare/agents-starter
cd cf_ai_agent_demo
```

### Option B: Fresh Scaffold + Port Architecture

**Steps:**
1. Backup current repo
2. Create new project with starter template
3. Port our architecture from `docs/`
4. Reimplement agents using starter patterns
5. Copy over tool implementations (agent_management, file_system)
6. Test from scratch

**Pros:**
- Clean slate with correct patterns
- Faster to "correct" implementation
- No legacy code to migrate
- Better testing setup from start

**Cons:**
- Lose all current progress (psychologically harder)
- Need to reimplement everything
- Higher upfront cost
- May lose some research insights

### Option C: Hybrid Refactor

**Steps:**
1. Install official `@cloudflare/agents` package in current repo
2. Replace our custom `Agent` base class with official one
3. Refactor tool definitions to use builder pattern
4. Adopt AI SDK patterns (we're already using `ai` package)
5. Add testing setup from starter
6. Keep our multi-agent architecture

**Pros:**
- Best of both worlds
- Incremental, testable changes
- Keeps our domain logic
- Aligns with CF best practices

**Cons:**
- Requires careful refactoring
- Need to understand both patterns deeply
- Risk of missing some nuances

---

## Specific Gaps We'd Fix with Starter

### 1. Tool Definition Pattern ❗ HIGH IMPACT

**Current (works but verbose):**
```typescript
const tools = {
  create_agent: tool({
    description: 'Create a new research agent for a specific domain',
    parameters: z.object({
      name: z.string().describe('Agent name (e.g., duchenne_md_research)'),
      description: z.string().describe('What this agent researches'),
      message: z.string().describe('Initial research task'),
    }),
    execute: async ({ name, description, message }: { name: string; description: string; message: string }) => {
      return agentMgr.create_agent(name, description, message);
    },
  }),
  // More tools inline...
}
```

**Starter Pattern (cleaner):**
```typescript
// tools.ts - separate file
export const agentTools = defineTools({
  create_agent: {
    description: 'Create a new research agent',
    parameters: z.object({
      name: z.string(),
      description: z.string(),
      message: z.string()
    }),
    execute: async (params, context) => {
      // context has { env, ctx, state }
      const agentMgr = createAgentManagementTools(context.env, context.ctx);
      return agentMgr.create_agent(params.name, params.description, params.message);
    }
  }
});

// InteractionAgent.ts
import { agentTools } from './tools';

export class InteractionAgent extends Agent {
  constructor(ctx, env) {
    super(ctx, env);
    this.registerTools(agentTools);
  }
}
```

### 2. Testing Infrastructure ❗ HIGH IMPACT

**Current:** No tests

**Starter Provides:**
```typescript
// test/agent.test.ts
import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('InteractionAgent', () => {
  it('should create research agent', async () => {
    const id = env.INTERACTION_AGENT.idFromName('test');
    const stub = env.INTERACTION_AGENT.get(id);
    
    const response = await stub.fetch(new Request('http://test/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Research DMD' })
    }));
    
    expect(response.status).toBe(200);
  });
});
```

### 3. AI SDK Provider Pattern ⚠️ MEDIUM IMPACT

**Current (direct Workers AI):**
```typescript
const workersai = createWorkersAI({ binding: this.env.AI });
const model = workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
```

**Starter (abstracted):**
```typescript
import { createWorkersAI } from '@ai-sdk/cloudflare';

// More flexible - easy to swap providers for testing
const model = createWorkersAI({ apiKey: env.CF_API_KEY })('llama-3.3');
```

### 4. Project Structure 📁 MEDIUM IMPACT

**Current:**
```
backend/
  agents/
  tools/
  db/
  index.ts
  types.ts
```

**Starter:**
```
src/
  agents/
  tools/
  lib/          # Shared utilities
  types.ts
  index.ts
test/
  agent.test.ts
  tools.test.ts
vitest.config.ts
```

---

## Decision Matrix

| Factor | Option A (Side-by-Side) | Option B (Fresh Start) | Option C (Hybrid Refactor) |
|--------|------------------------|------------------------|---------------------------|
| **Time to First Value** | Fast (reference only) | Slow (rebuild everything) | Medium (incremental) |
| **Learning Value** | High | Medium | Highest |
| **Risk** | Low | High | Medium |
| **Final Code Quality** | Medium | Highest | High |
| **Preserves Work** | ✅ Yes | ❌ No | ✅ Yes |
| **Testing Setup** | Manual port | ✅ Included | Manual port |
| **Alignment with CF** | Partial | ✅ Complete | ✅ Complete |

---

## Recommendation

**Start with Option A → Transition to Option C**

### Phase 1: Learn (Today)
```bash
cd /Users/juyounglee/Desktop/Projects
npm create cloudflare@latest cf-agents-reference -- --template=cloudflare/agents-starter
cd cf-agents-reference
npm install
npm run dev
```

**Actions:**
- Explore the starter structure
- Read their code in detail
- Understand tool registration pattern
- See how testing works
- Try running it locally

### Phase 2: Document Differences (Today)
Create `tasks/starter-pack-evaluation/pattern-comparison.md`:
- List all pattern differences
- Identify what we need to change
- Create refactoring checklist

### Phase 3: Incremental Refactor (Tomorrow)
1. Install `@cloudflare/agents` in our repo
2. Create new `Agent` class that wraps official SDK
3. Refactor tools to separate files with builder pattern
4. Add testing infrastructure
5. Test each change thoroughly

### Phase 4: Validate
- Deploy both versions
- Compare behavior
- Ensure all features work
- Get starter-level code quality with our architecture

---

## Next Steps

1. ✅ Run the starter creation command
2. ✅ Explore the generated project
3. ✅ Document key pattern differences
4. ⬜ Create refactoring plan
5. ⬜ Execute incremental refactor

---

## Questions to Answer by Exploring Starter

1. How does official `Agent` class differ from ours?
2. What's the exact tool registration API?
3. How do they handle multi-agent communication?
4. What testing patterns do they use?
5. How do they structure file organization?
6. What's the recommended way to handle state?
7. Any utilities we're missing?


