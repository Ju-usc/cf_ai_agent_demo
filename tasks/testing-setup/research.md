# Testing Setup Research

## Task Overview
Research official Cloudflare testing approaches and verify ChatGPT Pro's recommendations for testing Cloudflare Agents with Vitest.

---

## Executive Summary

✅ **ChatGPT Pro's advice is mostly accurate** but has some gaps:
- **Correct**: Vitest + `@cloudflare/vitest-pool-workers` is the official recommendation
- **Correct**: Tests run inside the Workers runtime (via Miniflare)
- **Correct**: `defineWorkersConfig`, `env`, `SELF`, `createExecutionContext` APIs
- **Missing**: Official docs don't show explicit streaming/tool-call testing patterns
- **Missing**: No guidance on mocking AI models in tests (just Workers AI/Vectorize)

---

## Key Foundational Concepts

### 1. **Why a Custom Test Runner?**

Cloudflare Workers don't run in Node.js—they use the V8 isolates runtime (workerd). Regular test frameworks like Jest or plain Vitest would test your code in Node, not in the actual Workers environment where bindings (KV, R2, D1, Durable Objects, Workers AI) exist.

**Solution**: `@cloudflare/vitest-pool-workers` runs your tests _inside_ the Workers runtime using Miniflare (a local simulator). This gives you:
- Real bindings access (not mocks)
- Isolated storage per test
- Same behavior as production
- Fast hot-reload for test iterations

> **Analogy**: It's like testing a mobile app on a real device vs. a simulator—you need the right environment.

---

### 2. **Two Testing Levels**

**Unit Tests**: Import your Worker/Agent class directly and call methods.
```ts
import worker from '../src/index';

it('returns 404 for /404 path', async () => {
  const request = new Request('http://example.com/404');
  const response = await worker.fetch(request, env, ctx);
  expect(response.status).toBe(404);
});
```

**Integration Tests**: Use `SELF` fetcher to make HTTP requests to your Worker.
```ts
import { SELF } from 'cloudflare:test';

it('returns 404 for /404 path via HTTP', async () => {
  const response = await SELF.fetch('http://example.com/404');
  expect(response.status).toBe(404);
});
```

Both run inside the Workers runtime, but integration tests go through the full HTTP stack.

---

### 3. **Core Test APIs from `cloudflare:test`**

These are provided by the test harness:

| API | Purpose | Use Case |
|-----|---------|----------|
| `env` | Access bindings (KV, R2, D1, Durable Objects, etc.) | Pass to Worker handlers |
| `SELF` | Service binding to your main Worker | Integration tests via HTTP |
| `createExecutionContext()` | Create ExecutionContext object | Pass as 3rd arg to handlers |
| `waitOnExecutionContext(ctx)` | Wait for all `ctx.waitUntil()` promises | Assert side effects after async work |
| `runInDurableObject(stub, callback)` | Run code inside a Durable Object instance | Access/spy on internal state |
| `fetchMock` | Mock outbound `fetch()` calls | Mock external APIs |

---

### 4. **Isolated Storage**

By default, each test gets a fresh, isolated copy of storage (KV, R2, D1, Durable Objects). This is set in your config:

```ts
// vitest.config.ts
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        isolatedStorage: true, // ← Each test gets clean storage
      },
    },
  },
});
```

**Why it matters**: Tests don't pollute each other. A Durable Object created in test A won't exist in test B.

---

## Official Testing Approach for Agents

### Setup (from Cloudflare Agents docs)

1. **Install packages**:
```bash
npm install --save-dev vitest @cloudflare/vitest-pool-workers
```

2. **Configure `vitest.config.ts`**:
```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        main: './src/index.ts',
        wrangler: {
          configPath: './wrangler.toml'
        },
        miniflare: {
          durableObjects: {
            INTERACTION_AGENT: 'InteractionAgent', // ← Map binding name to class
            RESEARCH_AGENT: 'ResearchAgent',
          }
        }
      }
    }
  }
});
```

3. **TypeScript types** (optional but recommended):
```bash
# Generate types for bindings
wrangler types
```

Create `test/tsconfig.json`:
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["@cloudflare/vitest-pool-workers"]
  },
  "include": ["**/*.test.ts", "../.wrangler/types/env.d.ts"]
}
```

Create `test/env.d.ts`:
```ts
import { Env } from '../.wrangler/types/env';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
```

---

### Writing Agent Tests

**Unit Test Example** (call agent directly):
```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('InteractionAgent', () => {
  it('responds to a basic chat message', async () => {
    // Get agent instance
    const id = env.INTERACTION_AGENT.idFromName('test-user');
    const stub = env.INTERACTION_AGENT.get(id);
    
    // Make request
    const request = new Request('http://example.com', {
      method: 'POST',
      body: JSON.stringify({ 
        messages: [{ role: 'user', content: 'Hello' }] 
      })
    });
    
    const ctx = createExecutionContext();
    const response = await stub.fetch(request);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('messages');
  });
});
```

**Integration Test Example** (via HTTP routing):
```ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('InteractionAgent via HTTP', () => {
  it('routes to correct agent via URL', async () => {
    const response = await SELF.fetch('http://example.com/agents/interaction-agent/test-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages: [{ role: 'user', content: 'Hello' }] 
      })
    });
    
    expect(response.status).toBe(200);
  });
});
```

---

## What Official Docs DON'T Cover

### 1. **Testing Streaming Responses**

Official docs mention SSE but don't show test examples. Pattern for reading streams:

```ts
it('streams responses back', async () => {
  const response = await SELF.fetch('http://example.com/agents/interaction-agent/test');
  
  const reader = response.body!.getReader();
  const chunks: string[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new TextDecoder().decode(value));
  }
  
  const fullContent = chunks.join('');
  expect(fullContent).toContain('data: '); // SSE format
});
```

### 2. **Testing Tool Calls**

No official examples. Approach:
- Either mock the AI model to return predictable tool calls
- Or test tool execution handlers in isolation
- Or make real AI calls in a small "smoke test" suite

### 3. **Mocking AI Models**

Official docs only show mocking Workers AI binding ([example](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/ai-vectorize)). For Vercel AI SDK models:

```ts
// Mock approach (not in official docs)
import { vi } from 'vitest';

vi.mock('../src/agents/modelFactory', () => ({
  createChatModel: () => ({
    // Return a fake model that yields predictable responses
    doStream: async function* () {
      yield { type: 'text-delta', textDelta: 'Test response' };
      yield { type: 'finish', finishReason: 'stop' };
    }
  })
}));
```

---

## Comparison: ChatGPT Pro vs. Official Docs

| Aspect | ChatGPT Pro Said | Official Docs Say | Verdict |
|--------|------------------|-------------------|---------|
| Use Vitest + workers pool | ✅ Yes | ✅ Yes | **Correct** |
| `defineWorkersConfig` | ✅ Yes | ✅ Yes | **Correct** |
| `env`, `SELF`, `createExecutionContext` | ✅ Yes | ✅ Yes | **Correct** |
| TypeScript setup with `wrangler types` | ✅ Yes | ✅ Yes | **Correct** |
| Durable Objects in `durableObjects` config | ✅ Yes | ✅ Yes (but called `miniflare.durableObjects`) | **Mostly correct** |
| Unit vs Integration tests | ✅ Yes | ✅ Yes | **Correct** |
| Isolated storage | ✅ Yes | ✅ Yes | **Correct** |
| Mock by default, real LLM rarely | ✅ Good advice | ❓ Silent (no guidance) | **Reasonable approach** |
| Streaming test patterns | ❓ Basic pattern shown | ❓ Not in docs | **Gap in both** |
| Tool call testing | ❓ Mock suggested | ❓ Not in docs | **Gap in both** |

**Overall**: ChatGPT Pro gave solid advice grounded in official docs, with reasonable extensions for testing agents/AI.

---

## Recommended Testing Strategy

Based on official docs + practical needs:

### Level 1: Tool Handler Tests (Pure Logic)
- Test each tool's `execute` function in isolation
- Mock any external dependencies (R2, D1, fetch calls)
- Fast, deterministic, no AI needed

### Level 2: Agent State Tests (Unit + Durable Objects)
- Use `runInDurableObject` to test message history storage
- Verify state persistence across multiple calls
- Test routing with `routeAgentRequest` helper

### Level 3: Agent Behavior Tests (Mocked AI)
- Mock the AI model to return scripted tool calls
- Verify agent calls correct tools with correct args
- Test full conversation flows without network calls

### Level 4: Smoke Tests (Real AI - Optional)
- Small suite with real Workers AI or external models
- Run nightly or on-demand (not in PR CI)
- Verify credentials and basic wiring only

---

## Example Test Structure (Proposed)

```
tests/
├── tsconfig.json              # Test-specific TS config
├── env.d.ts                   # Declare ProvidedEnv
├── tools/                     # Level 1: Pure tool logic
│   ├── write_file.test.ts
│   ├── read_file.test.ts
│   └── create_agent.test.ts
├── agents/                    # Level 2-3: Agent behavior
│   ├── interaction.unit.test.ts      # State, routing
│   ├── interaction.integration.test.ts # HTTP + mocked AI
│   └── research.test.ts
└── e2e/                       # Level 4: Real AI (opt-in)
    └── smoke.test.ts          # Run with --run flag, not watch
```

---

## Key Takeaways

1. **Official approach is solid**: Vitest + workers pool is the right path.
2. **Tests run in Workers runtime**: You get real bindings, not mocks.
3. **Isolated storage by default**: Each test is independent.
4. **Two test levels**: Unit (direct calls) and Integration (HTTP via `SELF`).
5. **Gaps in docs**: No official patterns for streaming/tool calls—we'll need to build our own.
6. **Mock AI by default**: Keep tests fast and deterministic; save real LLM calls for rare smoke tests.

---

## Next Steps

1. Review current `vitest.config.ts` (✅ already configured)
2. Create test structure (`tests/` folder with tool and agent tests)
3. Write first test for a simple tool (e.g., `write_file`)
4. Write agent test with mocked AI model
5. Document patterns as we go

---

## References

- [Vitest Integration Overview](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Write Your First Test](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/)
- [Test APIs Reference](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)
- [Testing Agents](https://developers.cloudflare.com/agents/getting-started/testing-your-agent/)
- [Recipes (Durable Objects example)](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/durable-objects)
- [Recipes (Workers AI mocking)](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-pool-workers-examples/ai-vectorize)
