# Testing Guide

## Quick Start

```bash
# Run all tests
npx vitest

# Run specific test file
npx vitest tests/unit/file_system.test.ts

# Watch mode
npx vitest --watch
```

**Current Status**: ✅ 10/10 tests passing (file system tools)

---

## Philosophy

This project uses **Specification-Driven Testing**:
- Test specifications (`.spec.md`) define WHAT to test in plain English
- Test implementations (`.test.ts`) define HOW tests execute
- YOU (CODING AGENT such as Cursor, Factory CLI, Codex) acts as "compiler" between spec and code
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

## File Structure & Naming Convention

**IMPORTANT**: Test file names MUST match implementation file names.

**Naming Pattern**:
```
backend/X/Y.ts  →  tests/unit/Y.spec.md  +  tests/unit/Y.test.ts
```

**Examples**:
- `backend/tools/file_system.ts` → `tests/unit/file_system.spec.md` + `tests/unit/file_system.test.ts`
- `backend/tools/tools.ts` → `tests/unit/tools.spec.md` + `tests/unit/tools.test.ts`
- `backend/agents/modelFactory.ts` → `tests/unit/modelFactory.spec.md` + `tests/unit/modelFactory.test.ts`

**Directory Structure**:
```
tests/
├── TESTS.md                    # This file - testing guide
├── tsconfig.json               # TypeScript config for tests
├── env.d.ts                    # Type definitions
├── unit/                       # Unit tests (isolated components)
│   ├── file_system.spec.md     # Spec for backend/tools/file_system.ts
│   ├── file_system.test.ts     # Tests for backend/tools/file_system.ts
│   ├── tools.spec.md           # Spec for backend/tools/tools.ts
│   ├── tools.test.ts           # Tests for backend/tools/tools.ts
│   ├── modelFactory.spec.md    # Spec for backend/agents/modelFactory.ts
│   └── modelFactory.test.ts    # Tests for backend/agents/modelFactory.ts
└── integration/                # Integration tests (multiple components)
    ├── feature-name.spec.md
    └── feature-name.test.ts
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

#### Edge: Description
- **Setup**: Any needed setup
- **Input**: Input data
- **Expected**: Expected edge case behavior
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

## R2 as Filesystem Notes

This project uses R2 object storage to mimic a filesystem for agent workspaces.

### Key Concepts
- **Flat namespace**: R2 stores keys as strings, not hierarchical directories
- **"Directories" are prefixes**: `research/notes.md` is just a key with `/` in it
- **No mkdir needed**: Creating `a/b/c/file.md` automatically creates the "path"
- **Workspace isolation**: Each agent gets a prefix like `agents/interaction-agent/alice/`

### Important Edge Cases
- **Path validation**: Reject `..` to prevent escaping workspace
- **Directory reads**: `read_file("research/")` should error with helpful message
- **Empty workspace**: `list_files()` on new agent shows "No files"
- **Overwrites**: Show diff when replacing existing file

See individual test specs for detailed edge case coverage.
