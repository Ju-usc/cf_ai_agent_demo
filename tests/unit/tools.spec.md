# Tools Test Specification

## Overview
Tests for agent tool wrappers in `backend/tools/tools.ts` that have **complex logic beyond simple delegation**.

**Out of Scope**: File system tools (`write_file`, `read_file`, `list_files`) are thin wrappers around VirtualFs. The real logic is tested in `file_system.test.ts`. Integration tests will verify the full flow.

**In Scope**: Tools with registry operations, inter-agent communication, name sanitization, and error handling logic.

## Tools to Test

### Agent Management Tools (InteractionAgent Context)
1. **create_agent** - Registry operations, name sanitization, agent initialization
2. **list_agents** - Registry reads, formatting
3. **message_to_research_agent** - Inter-agent communication, error handling

### Communication Tools (ResearchAgent Context)
4. **message_to_interaction_agent** - Best-effort relay pattern

---

## create_agent

### Purpose
Verify agent creation, name sanitization, registry management, and initialization flow.

### Test Cases

#### Success: Create new agent
- **Setup**: Mock InteractionAgent with empty storage
- **Input**: 
  ```json
  {
    "name": "dmd_research",
    "description": "Duchenne MD research",
    "message": "Find latest treatments"
  }
  ```
- **Expected**: 
  - `sanitizeName()` called with "dmd_research"
  - `RESEARCH_AGENT.idFromName("dmd_research")` called
  - Agent stub initialized with POST to `/init`
  - Registry saved to storage with agent entry
  - Returns success message with agent_id
- **Verification**: Registry contains new agent entry

#### Name sanitization: Special characters
- **Input**: `{ name: "DMD Research! v2", description: "...", message: "..." }`
- **Expected**: 
  - Name sanitized to "dmd_research_v2" (lowercase, underscores, no special chars)
  - Agent created with sanitized name
  - Registry key uses sanitized name

#### Name sanitization: Edge cases
- **Input**: Various edge cases
  - `"  Multiple   Spaces  "` → `"multiple_spaces"`
  - `"___underscores___"` → `"underscores"`
  - `"!!only-special!!"` → `"only_special"`
  - `"   "` (whitespace only) → `"agent"` (fallback)
- **Verification**: Sanitized names are valid, no consecutive underscores

#### Error: Agent initialization fails
- **Setup**: Mock RESEARCH_AGENT stub to reject /init request
- **Input**: `{ name: "dmd_research", ... }`
- **Expected**: 
  - Error caught and returned
  - Registry NOT updated (rollback or never saved)
  - Clear error message to user

#### Error: Duplicate agent name
- **Setup**: Registry already has "dmd_research" agent
- **Input**: `{ name: "dmd_research", ... }`
- **Expected**: Returns error message "Agent already exists: dmd_research"
- **Rationale**: Prevents silent overwrites and makes debugging easier
---

## list_agents

### Purpose
Verify registry reads and formatting of agent list.

### Test Cases

#### Success: List existing agents
- **Setup**: Registry storage contains:
  ```json
  {
    "dmd_research": { "description": "DMD research", "createdAt": "..." },
    "als_research": { "description": "ALS research", "createdAt": "..." }
  }
  ```
- **Input**: (no arguments)
- **Expected**: Returns formatted agent list
- **Verification**: 
  - All agents from registry included
  - Includes name and description fields

#### Success: Empty registry
- **Setup**: Storage has no registry or empty registry
- **Input**: (no arguments)
- **Expected**: Returns empty list or "No agents" message
- **Verification**: No errors thrown 
---

## message_to_research_agent

### Purpose
Verify inter-agent communication and error handling.

### Test Cases

#### Success: Send message to existing agent
- **Setup**: 
  - Registry has "dmd_research" agent
  - Mock RESEARCH_AGENT stub to return response
- **Input**: 
  ```json
  {
    "agent_id": "dmd_research",
    "message": "What's the status?"
  }
  ```
- **Expected**: 
  - `RESEARCH_AGENT.idFromName("dmd_research")` called
  - POST to agent's `/message` endpoint
  - Response from agent returned
  - Returns `{ response: "..." }` with agent's reply

#### Error: Agent not found in registry
- **Setup**: Registry doesn't have "nonexistent" agent
- **Input**: `{ agent_id: "nonexistent", message: "hi" }`
- **Expected**: 
  - Error message: "Agent not found: nonexistent"
  - Doesn't attempt to call RESEARCH_AGENT stub

#### Error: Agent communication fails
- **Setup**: Agent exists but stub.fetch() rejects
- **Input**: `{ agent_id: "dmd_research", message: "hi" }`
- **Expected**: 
  - Error caught
  - Clear error message returned
  - Doesn't crash InteractionAgent

---

## message_to_interaction_agent

### Purpose
Verify best-effort relay pattern from ResearchAgent back to InteractionAgent.

### Test Cases

#### Success: Relay message
- **Setup**: Mock ResearchAgent with bestEffortRelay method
- **Input**: `{ message: "Analysis complete. Found 5 papers." }`
- **Expected**: 
  - `agent.bestEffortRelay()` called with message
  - Returns success confirmation
  - Message format preserved

#### Success: Relay fails silently (best-effort)
- **Setup**: Mock bestEffortRelay to throw error
- **Input**: `{ message: "Update" }`
- **Expected**: 
  - Error caught internally
  - Tool returns success (best-effort, no crash)
  - Error logged but not thrown

#### Edge case: Empty message
- **Input**: `{ message: "" }`
- **Expected**: 
  - Either rejects empty message
  - Or relays as-is (check implementation)
- **Rationale**: Document expected behavior

---

## Testing Patterns

### Mocking InteractionAgent Context
```typescript
// Mock storage for registry operations
const mockStorage = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
};

// Mock InteractionAgent with context
const mockAgent = {
  ctx: { storage: mockStorage },
  env: {
    RESEARCH_AGENT: {
      idFromName: vi.fn().mockReturnValue('test-id'),
      get: vi.fn().mockReturnValue(mockStub)
    }
  },
  state: { ... }
};

// Mock getCurrentAgent to return our mock
vi.mock('agents', () => ({
  getCurrentAgent: () => ({ agent: mockAgent })
}));
```

### Mocking ResearchAgent Context
```typescript
const mockResearchAgent = {
  bestEffortRelay: vi.fn(),
  state: { name: 'test-agent' },
  env: {
    INTERACTION_AGENT: {
      idFromName: vi.fn(),
      get: vi.fn()
    }
  }
};
```

### Mocking Durable Object Communication (JSRPC)
```typescript
// Mock stub for agent communication using JSRPC
const mockStub = {
  initialize: vi.fn().mockResolvedValue(undefined),
  sendMessage: vi.fn().mockResolvedValue('Agent response'),
  getAgentInfo: vi.fn().mockResolvedValue({ name: 'test', description: 'Test agent', messageCount: 5 }),
  relay: vi.fn().mockResolvedValue(undefined)
};
```

### Testing Zod Schemas
```typescript
// Test schema validation
describe('Tool Schemas', () => {
  it('create_agent schema accepts valid input', () => {
    const result = createAgentSchema.safeParse({
      name: 'dmd_research',
      description: 'Research DMD',
      message: 'Start research'
    });
    expect(result.success).toBe(true);
  });

  it('create_agent schema rejects missing fields', () => {
    const result = createAgentSchema.safeParse({ name: 'test' });
    expect(result.success).toBe(false);
  });
});
```

---

## Success Criteria

- [ ] create_agent: Name sanitization, registry operations, initialization tested
- [ ] list_agents: Registry reads, formatting, edge cases tested  
- [ ] message_to_research_agent: Inter-agent communication, error handling tested
- [ ] message_to_interaction_agent: Best-effort relay pattern tested
- [ ] getCurrentAgent() context injection works for both agent types
- [ ] Durable Object stub communication mocked properly
- [ ] Error handling verified (agent not found, network failures, etc.)
- [ ] Tool response formats consistent

**Estimated Tests**: ~15-18 tests covering 4 complex tools

**Note**: File system tools tested via `file_system.test.ts`. Integration tests will verify end-to-end flow.
