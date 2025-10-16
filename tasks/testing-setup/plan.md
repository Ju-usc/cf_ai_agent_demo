# Testing Setup Implementation Plan

## Overview

Implement spec-driven testing for the Cloudflare Agents project using Vitest + `@cloudflare/vitest-pool-workers`. Tests will be defined in plain-English `.spec.md` files, with the AI agent generating corresponding `.test.ts` implementations.

---

## Prerequisites

✅ `vitest.config.ts` already configured
✅ Research completed (`research.md`)
✅ AGENTS.md updated with spec-driven workflow

---

## Phase 1: Test Infrastructure Setup

### Goal
Create the folder structure, TypeScript configuration, and master documentation for testing.

### Tasks

#### 1.1 Create Test Folder Structure
```
tests/
├── TESTS.md                    # Master documentation (NEW)
├── unit/                       # Unit tests (NEW)
│   └── .gitkeep
├── integration/                # Integration tests (NEW)
│   └── .gitkeep
├── health.test.ts              # Existing (MOVE to unit/)
└── interaction-agent.test.ts   # Existing (MOVE to integration/)
```

**Actions:**
- Create `tests/unit/` and `tests/integration/` directories
- Move existing tests to appropriate locations
- Rename/reorganize existing tests if needed

#### 1.2 TypeScript Configuration for Tests

Create `tests/tsconfig.json`:
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["@cloudflare/vitest-pool-workers", "vitest"],
    "moduleResolution": "bundler",
    "module": "ESNext"
  },
  "include": [
    "**/*.test.ts",
    "**/*.spec.ts",
    "../.wrangler/types/env.d.ts"
  ]
}
```

Create `tests/env.d.ts` (if not exists):
```ts
import { Env } from '../backend/types';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
```

#### 1.3 Update vitest.config.ts

Add Durable Objects bindings:
```ts
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        singleWorker: true,
        isolatedStorage: true,
        wrangler: { 
          configPath: './wrangler.toml',
        },
        miniflare: {
          durableObjects: {
            INTERACTION_AGENT: 'InteractionAgent',
            RESEARCH_AGENT: 'ResearchAgent',
          }
        },
      },
    },
  },
});
```

#### 1.4 Create TESTS.md

Master documentation explaining:
- Testing philosophy (spec-driven approach)
- File structure and naming conventions
- How to write test specifications
- How to run tests
- Testing patterns (unit vs integration)
- Examples of good specs

**Content Template:**
```markdown
# Testing Guide

## Philosophy

This project uses **Specification-Driven Testing**:
- Test specifications (`.spec.md`) define WHAT to test in plain English
- Test implementations (`.test.ts`) define HOW tests execute
- AI agent acts as "compiler" between spec and code
- Specs are living documentation that evolve with code

## Testing with Cloudflare Workers

### Miniflare
Tests run inside the Workers runtime using Miniflare (local simulator).
- Provides real bindings (KV, R2, D1, Durable Objects)
- Isolated storage per test (no cross-contamination)
- Same behavior as production

### Test APIs from `cloudflare:test`
- `env` - Access bindings (R2, D1, Durable Objects)
- `SELF` - Service binding to your Worker (for integration tests)
- `createExecutionContext()` - Create context for handlers
- `waitOnExecutionContext(ctx)` - Wait for `ctx.waitUntil()` promises
- `runInDurableObject(stub, fn)` - Run code inside DO instance

## File Structure

```
tests/
├── TESTS.md              # This file - testing guide
├── unit/                 # Unit tests (isolated components)
│   ├── tools.spec.md     # Test specification (human-editable)
│   ├── tools.test.ts     # Test implementation (AI-generated)
│   ├── agents.spec.md
│   └── agents.test.ts
└── integration/          # Integration tests (multiple components)
    ├── agent-communication.spec.md
    ├── agent-communication.test.ts
    ├── routing.spec.md
    └── routing.test.ts
```

## Writing Test Specifications

### Spec File Format

Each `.spec.md` file should contain:

1. **Overview** - What module/feature is being tested
2. **Test sections** - One per function/method
3. **Test cases** - Specific scenarios with inputs/outputs

### Example Spec Structure

```markdown
# Component Name Test Specification

## Overview
Brief description of what's being tested.

## function_name

### Purpose
What this test section verifies.

### Test Cases

#### Success: Description
- **Input**: `{ key: "value" }`
- **Expected**: Describe expected behavior
- **Verification**: How to verify it worked

#### Error: Description
- **Input**: `{ bad: "input" }`
- **Expected**: Error with message "..."
```

## Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Watch mode (auto-rerun on changes)
npm run test:watch

# Run specific file
npx vitest tests/unit/tools.test.ts
```

## Unit vs Integration Tests

### Unit Tests (`tests/unit/`)
- Test single function/method in isolation
- Mock external dependencies
- Fast execution
- Use real Miniflare bindings (R2, D1, etc.)
- Example: Test a tool's execute function

### Integration Tests (`tests/integration/`)
- Test multiple components together
- Use `SELF` fetcher for HTTP requests
- Test full request → response flow
- Example: Test agent communication via HTTP

## Best Practices

### Keep Tests Isolated
Each test should be independent. Use `beforeEach` to reset state.

### Test Behavior, Not Implementation
Focus on what the code does, not how it does it.

### Use Descriptive Names
Test names should clearly describe what's being tested:
- ✅ `it('writes file to R2 with valid path')`
- ❌ `it('test1')`

### One Assertion Per Test (When Possible)
Makes failures easier to debug.

### Use Real Bindings
Don't mock R2/D1 - Miniflare provides real implementations.

## Common Patterns

### Testing Tool Functions

```ts
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { myTool } from '../../backend/tools/tools';

describe('myTool', () => {
  it('executes successfully', async () => {
    const result = await myTool.execute({ input: 'test' }, env);
    expect(result).toContain('success');
  });
});
```

### Testing Durable Object State

```ts
import { env, runInDurableObject } from 'cloudflare:test';

it('persists state across requests', async () => {
  const id = env.MY_DO.idFromName('test');
  const stub = env.MY_DO.get(id);
  
  await stub.fetch('http://test.com', { method: 'POST', body: 'data' });
  
  const state = await runInDurableObject(stub, (instance) => {
    return instance.getSomeState();
  });
  
  expect(state).toBe('expected');
});
```

### Testing HTTP Routing

```ts
import { SELF } from 'cloudflare:test';

it('routes to correct agent', async () => {
  const response = await SELF.fetch('http://test.com/agents/my-agent/test');
  expect(response.status).toBe(200);
});
```

## Troubleshooting

### Tests failing with "binding not found"
- Check `vitest.config.ts` has correct Durable Object mappings
- Run `wrangler types` to regenerate type definitions

### Tests passing locally but failing in CI
- Ensure `isolatedStorage: true` in config
- Check for hardcoded paths or environment-specific logic

### Slow tests
- Are you mocking external API calls?
- Use `vi.mock()` for expensive operations


#### 1.5 Phase 1 Implementation Order

1. ✅ Create directories (`tests/unit/`, `tests/integration/`)
2. ✅ Create TypeScript config (`tests/tsconfig.json`, `tests/env.d.ts`)
3. ✅ Update `vitest.config.ts` with Durable Object bindings
4. ✅ Create `TESTS.md` with full content above
5. ✅ Verified test infrastructure works

#### 1.6 Testing Approach (Important)

**Do NOT import the full worker** (`backend/index.ts`) in unit tests due to `agents` SDK dependency chain issue (MCP SDK → ajv CommonJS).

**Instead, import components directly**:
```ts
// ✅ Unit tests - import modules directly
import { write_file, read_file } from '../../backend/tools/file_system';
import { InteractionAgent } from '../../backend/agents/InteractionAgent';

// ❌ Avoid in unit tests
import worker from '../../backend/index'; // Breaks due to agents SDK
```

This is actually **better unit testing practice**:
- Tests one component at a time
- Faster execution
- Clearer failures
- Matches official Cloudflare examples

For integration tests (full HTTP routing), test in staging or wait for SDK fix.

---

## Phase 2: First Test Specification (File System Tools)

### Goal
Create first working example of spec → test generation using file system tools.

### Why Start Here?
- Simple, straightforward logic (read/write files)
- Easy to verify (write file, read it back)
- No AI/LLM mocking needed
- Uses real Miniflare R2 bindings

### Tasks

#### 2.1 Write Test Specification

Create `tests/unit/tools.spec.md`:
```markdown
# File System Tools Test Specification

## Overview
Tests for R2-based file operations used by agents.

## write_file

### Purpose
Verify that files can be written to R2 storage safely.

### Test Cases

#### Success: Write valid file
- **Input**: `{ path: "test.md", content: "# Hello world" }`
- **Expected**: Success message returned
- **Verification**: File exists in R2 with correct content
comment: the path is relative to the agent workspace
sandboxing is important to prevent malicious code from being executed.

comment: the path is not allowed to contain .. to prevent directory traversal attacks.

comment: seems like we not really testing /testfilepath/test.md path to be sure it's working. but do u think we should then make sure /testfilepath directory exists for write operation to be working? or should we dynamically create the directory if it doesn't exist?

#### Error: Invalid path with ..
- **Input**: `{ path: "../etc/passwd", content: "hack" }`
- **Expected**: Throws error with message "Invalid path"
- **Verification**: No file written to R2

comment: in this case directory exists (for other agent's workspace) but since we wanna operate for each agent workspace independently, this has to be a error. 

#### Edge: Empty content
- **Input**: `{ path: "empty.md", content: "" }`
- **Expected**: File created with zero bytes
- **Verification**: File exists in R2 but is empty

#### Edge: Overwrite existing file
- **Setup**: Create file "test.md" with content "Original"
- **Input**: `{ path: "test.md", content: "Updated" }`
- **Expected**: File overwritten
- **Verification**: File contains "Updated", not "Original"

comment: also probably good idea to give success message of the old content snippets -> new content snippets so that agent is aware of the changes/overwrites that old snippets were gone.

## read_file

### Purpose
Verify that files can be read from R2 storage.

### Test Cases

#### Success: Read existing file
- **Setup**: Write file "test.md" with content "# Hello world"
- **Input**: `{ path: "test.md" }`
- **Expected**: Returns content "# Hello world"

comment: this is good but do u think we should also test the path to be sure it's working? like /testfilepath/test.md path to be sure it's working.

#### Error: Missing file
- **Input**: `{ path: "nonexistent.md" }`
- **Expected**: Throws error with message "File not found"

## list_files

### Purpose
Verify directory listing works correctly.

### Test Cases

#### Success: List files in directory
- **Setup**: Write files "report-a.md", "report-b.md", "dir/notes.md"
- **Input**: `{ path: "/" }`
- **Expected**: Returns array with "report-a.md", "report-b.md", "dir/"

comment: we should think about how expected output really be i believe tools outputs r all strings not objects. LMK if i'm wrong. also do we really need input for list files in directory? bc each agent workspace has its own directory structure and we should list files in that directory. Expected output should be also formmatted to be like a file structure tree -- think how we approach file structure tree of our codebase for u.

#### Success: Empty directory
- **Input**: `{ path: "/empty/" }`
- **Expected**: Returns empty array
```

#### 2.2 Generate Test Implementation

AI generates `tests/unit/tools.test.ts` following patterns:
```ts
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileTool, readFileTool, listFilesTool } from '../../backend/tools/file_system';

describe('File System Tools', () => {
  describe('write_file', () => {
    it('writes valid file to R2', async () => {
      // Implementation from spec
    });

    it('rejects invalid paths with ..', async () => {
      // Implementation from spec
    });

    // ... more tests
  });

  describe('read_file', () => {
    // Tests from spec
  });

  describe('list_files', () => {
    // Tests from spec
  });
});
```

#### 2.3 Verify Tests Pass

Run tests:
```bash
npx vitest tests/unit/tools.test.ts
```

**Success criteria:**
- All tests pass
- Tests match spec exactly
- No manual test code written (all generated from spec)

---

## Phase 3: Agent State Tests

### Goal
Test Durable Object state persistence and message history.

### Tasks

#### 3.1 Write Specification

Create `tests/unit/agents.spec.md`:
- Test message history persistence
- Test agent state isolation (different names = different state)
- Test state survives across requests

#### 3.2 Generate Implementation

Create `tests/unit/agents.test.ts`:
- Use `runInDurableObject()` to inspect internal state
- Test with `env.INTERACTION_AGENT` and `env.RESEARCH_AGENT`
- Verify isolated storage works

#### 3.3 Verify Tests Pass

---

## Phase 4: Integration Tests

### Goal
Test multi-agent communication and routing.

### Tasks

#### 4.1 Write Specification

Create `tests/integration/agent-communication.spec.md`:
- Test interaction agent → research agent messaging
- Test tool execution through full agent flow
- Verify both agents maintain correct state

#### 4.2 Generate Implementation

Create `tests/integration/agent-communication.test.ts`:
- Use `SELF` fetcher for HTTP requests
- Test via routing (`/agents/:agent/:name`)
- Inspect both agents' states after interaction

#### 4.3 Write Routing Tests

Create `tests/integration/routing.spec.md` and `.test.ts`:
- Test correct agent resolution by name
- Test sticky routing (same name = same instance)
- Test error handling (invalid agent names)

---

## Phase 5: Existing Test Migration

### Goal
Convert existing tests to spec-driven format.

### Tasks

#### 5.1 Create Specs for Existing Tests

- `tests/unit/worker.spec.md` (from health.test.ts)
- `tests/integration/interaction-agent.spec.md` (from interaction-agent.test.ts)

#### 5.2 Regenerate Test Files

Generate new `.test.ts` files from specs to ensure consistency.

#### 5.3 Remove Old Tests

Delete original tests once specs + generated tests pass.

---

## Phase 6: Documentation & Patterns

### Goal
Document learned patterns and best practices.

### Tasks

#### 6.1 Update TESTS.md

Add sections based on learnings:
- Common patterns that emerged
- Gotchas and edge cases
- Examples from real tests

#### 6.2 Create Test Helpers (if needed)

If patterns repeat, extract to `tests/helpers/`:
- `tests/helpers/agent-helpers.ts` - Common agent setup
- `tests/helpers/file-helpers.ts` - File fixture creation

#### 6.3 CI/CD Integration

Add test commands to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest tests/unit",
    "test:integration": "vitest tests/integration",
    "test:watch": "vitest --watch"
  }
}
```

---

## Success Criteria

### Phase 1 ✅ COMPLETE
- ✅ Test folder structure created (`tests/unit/`, `tests/integration/`)
- ✅ TypeScript config working (`tests/tsconfig.json`, `tests/env.d.ts`)
- ✅ Vitest config with Durable Objects bindings
- ✅ TESTS.md comprehensive documentation
- ✅ Can run `npx vitest` successfully (2 passing tests for constants)
- ✅ Testing approach documented (import components directly, not full worker)

### Phase 2 ✅ COMPLETE
- ✅ File system tools spec written (`tests/unit/file_system.spec.md`)
- ✅ Constants created (`backend/constants.ts` with `AGENT_WORKSPACE_ROOT = 'memory/'`)
- ✅ Implementation updated (`ResearchAgent.ts` uses constant)
- ✅ Tests created (`tests/unit/file_system.test.ts` - **10/10 passing!**)
- ✅ **SDK limitation fixed** by mocking R2 instead of using cloudflare:test env

### Phase 2.5: Agent Management Tools ✅ COMPLETE
**Goal**: Test complex tool logic (agent creation, registry, inter-agent communication)

- ✅ Spec written (`tests/unit/tools.spec.md`)
  - `create_agent` - Registry operations, name sanitization, agent initialization
  - `list_agents` - Registry reads and formatting
  - `message_agent` - Inter-agent communication via JSRPC
  - `send_message` - Best-effort relay pattern from ResearchAgent
- ✅ Spec reviewed and clarified:
  - Duplicate agent names should return error (Option B)
  - Registry corruption test removed (trust TypeScript types)
  - `list_agents` takes no arguments
- ✅ Tests implemented (`tests/unit/tools.test.ts` - **16/16 passing!**)
- ✅ Implementation updated:
  - Added duplicate agent check to `create_agent`
  - Best-effort relay pattern verified

**Final Test Count**: 16 tests covering 4 complex tools
- `create_agent`: 7 tests (success, sanitization edge cases, duplicate error, init failure)
- `list_agents`: 3 tests (with agents, empty, null registry)
- `message_agent`: 3 tests (success, sanitization, communication failure)
- `send_message`: 3 tests (success, best-effort failure, empty message)

### Phase 3-4
- ✅ Agent and integration tests implemented
- ✅ All tests passing
- ✅ Coverage of critical paths

### Phase 5-6
- ✅ All tests migrated to spec-driven
- ✅ Documentation complete
- ✅ CI/CD integrated

---

## Future: Backend Module Specs (Phase 7+)

After testing is stable, evaluate spec-driven approach for complex backend modules:

### Candidates for Specs
1. **`backend/tools/tools.ts`** - Complex tool orchestration logic
2. **`backend/agents/InteractionAgent.ts`** - State management, message handling

### Evaluation Criteria
- Does spec add value (vs just reading code)?
- Is maintenance overhead worth it?
- Does it improve AI agent's ability to modify code?

**Decision point**: After Phase 6 completion, discuss whether to proceed with backend specs.

---

## Timeline Estimate

- **Phase 1**: 30 minutes (setup)
- **Phase 2**: 1 hour (first spec + tests)
- **Phase 3**: 45 minutes (agent tests)
- **Phase 4**: 1 hour (integration tests)
- **Phase 5**: 30 minutes (migrate existing)
- **Phase 6**: 30 minutes (documentation)

**Total**: ~4 hours of focused work

---

## Next Steps

1. ✅ User approves this plan
2. → Start Phase 1: Create folder structure and TESTS.md
3. → Generate first test spec (tools.spec.md)
4. → Verify pattern works end-to-end
5. → Continue through phases

---

## Open Questions

1. **Test data fixtures**: Should we create shared test data (sample files, messages)?
2. **Mocking strategy**: When we get to AI model tests, mock at model factory level or deeper?
3. **Coverage targets**: What % coverage are we aiming for? (Suggest: 80% for unit, 60% for integration)

These can be answered as we progress through implementation.
