# Agent Communication Integration Test Specification

## Overview

This spec defines integration tests for multi-agent communication in the Medical Innovation Agent system. These tests verify the full request → response flow through Cloudflare Workers, Durable Objects, and JSRPC communication.

**Philosophy**: Test the actual behavior as it exists today. Tests will reveal what's working and what needs fixing.

---

## Test Setup

### Approach
- Test via `worker.fetch()` (full HTTP boundary)
- Use real Miniflare environment (`env` from `cloudflare:test`)
- Mock LLM responses for deterministic behavior (Phase 1)
- Use `runInDurableObject()` to inspect internal state
- One comprehensive test covering the full user journey

### Mocking Strategy

**Configurable LLM Mode** (via environment variable or test flag)
```typescript
const USE_REAL_LLM = process.env.TEST_WITH_REAL_LLM === 'true';

if (!USE_REAL_LLM) {
  vi.mock('ai', () => ({
    generateText: vi.fn(),
    streamText: vi.fn(),
    // ... mock returns
  }));
}
```

**Phase 1: Mock LLM (default)**
- Fast, deterministic tests
- Mock responses for specific scenarios
- Run in CI

**Phase 2: Real LLM (optional)**
- Set `TEST_WITH_REAL_LLM=true`
- Uses actual Workers AI / OpenAI
- Slower but tests real LLM behavior
- Run locally before deployment

**Recommendation**: Default to mocks, easy switch to real LLM when needed.
---

## Test 1: Complete Medical Research Journey

### Purpose
Verify the entire user flow from initial query through agent creation, communication, file operations, and state persistence. This is a comprehensive integration test that covers all critical paths.

### User Story
A clinician asks about DMD treatments. The system creates a research agent, the agent does research and writes files, the clinician follows up with questions, and the agent maintains state across interactions.

---

## Test Scenarios (One Comprehensive Test)

### Scenario 1: User Initiates Research

**User Action**: "Research Duchenne muscular dystrophy treatments"

**What Should Happen**:
1. User sends POST to `/agents/interaction/default/message`
2. InteractionAgent receives message
3. IA's LLM decides to create a research agent
4. IA calls `create_agent` tool with name like "dmd_research"
5. ResearchAgent Durable Object is created and initialized
6. IA calls `list_agents` tool to verify the agent was created
7. IA calls `message_to_research_agent` tool to send initial research task
8. ResearchAgent receives message and processes it
9. RA's LLM calls tools (like `write_file`) to save findings
10. RA responds back to IA (synchronous response)
11. IA synthesizes findings
12. IA responds to user

**What to Verify**:
- HTTP response status is 200
- Response mentions creating/starting research (content check)
- ResearchAgent Durable Object exists with correct name
- ResearchAgent has messages in its history
- Files were written to R2 (check `memory/research-agent/dmd_research/` prefix)

**Mocked LLM Behavior**:
- IA's LLM → Returns tool call to `create_agent`, then `message_to_research_agent`
- RA's LLM → Returns tool call to `write_file`, then text response

**Verification Details**:
- ✅ Check R2 directly (more reliable than trusting tool execution)
- ✅ Verify exact file paths (e.g., `memory/research-agent/dmd_research/reports/findings.md`)
- ✅ Verify file count in agent's workspace
- Note: Unit tests mock R2, but integration tests use real Miniflare R2

---

### Scenario 2: User Asks Follow-Up (Sticky Routing)

**User Action**: "What treatments did you find for DMD?"

**What Should Happen**:
1. User sends another POST to `/agents/interaction/default/message`
2. IA's LLM decides to message existing "dmd_research" agent
3. IA calls `message_to_research_agent` tool with agent_id "dmd_research"
4. **Same ResearchAgent instance** receives the message
5. RA reads its previous state (message history stored in Durable Object state)
6. RA has access to files it wrote in Scenario 1
7. RA responds with findings
8. IA synthesizes response to user

**Critical**: Verify ResearchAgent has full conversation history from Scenario 1. Message history must be persistent in Durable Object state, not lost between requests. 
**What to Verify**:
- HTTP response contains information about DMD treatments
- ResearchAgent's message count increased (proves same instance)
- ResearchAgent can access files it wrote earlier (state persisted)
- Different user message → same agent name → same Durable Object instance

**Mocked LLM Behavior**:
- IA's LLM → Returns tool call to `message_to_research_agent` (NOT `create_agent`)
- RA's LLM → Returns tool call to `read_file`, then text response with findings

**Verification Details**:
- ✅ Check **both** message count and state (proves same DO instance)
- ✅ RA should actually call `read_file` tool (verify in tool execution logs or file access)
- ✅ Verify message count increased: initial messages + follow-up = higher count
- ✅ Verify RA's state contains all previous messages (conversation history intact)
---

### Scenario 3: Create Second Agent (Isolation)

**User Action**: "Also research CAR-T therapy for lymphoma"

**What Should Happen**:
1. User sends POST request
2. IA's LLM decides to create a NEW agent (different topic)
3. IA calls `create_agent` tool with name like "car_t_therapy"
4. New ResearchAgent Durable Object created
5. This agent has its own separate state
6. Files written to separate workspace (`memory/research-agent/car_t_therapy/`)

**What to Verify**:
- Second ResearchAgent exists with different name
- Both agents are in the registry (list_agents shows 2 agents)
- File workspaces are separate (no overlap in R2 prefixes) IMPORTANT!
- Each agent maintains independent message history IMPORTANT!
- Agents don't interfere with each other IMPORTANT!

**Mocked LLM Behavior**:
- IA's LLM → Creates second agent, messages it
- Second RA's LLM → Writes files, responds

**Verification Details (ALL CRITICAL)**:
- ✅ **Workspace isolation**: Verify R2 prefixes are completely separate
  - `dmd_research` files: `memory/research-agent/dmd_research/*`
  - `car_t_therapy` files: `memory/research-agent/car_t_therapy/*`
  - No file overlap between agents
- ✅ **Message history isolation**: Verify each agent has only its own messages
  - Check message counts are independent
  - Check message content doesn't leak between agents
- ✅ **State isolation**: Verify agents don't interfere with each other
  - Both agents can operate simultaneously
  - Changes to one agent don't affect the other

---

### Scenario 4: Async Relay (Background Notification)

**Context**: Simulate a background trigger where ResearchAgent proactively notifies InteractionAgent

**Important Clarification**: 
- In current implementation, relay does NOT push to user immediately
- Relay message is added to IA's conversation history
- User sees it when they send their next message
- **Real-time push requires WebSocket/SSE** (not implemented in MVP)
- This scenario tests the relay **plumbing** works correctly

**What Should Happen**:
1. ResearchAgent (independently, simulating background trigger) has an update
2. RA calls `message_to_interaction_agent` tool (which internally calls `bestEffortRelay()`)
3. `bestEffortRelay()` calls IA's JSRPC `relay()` method
4. IA's `relay()` method adds message to its conversation history
5. Message sits in IA's history (not pushed to user yet - no WebSocket)
6. User sends next message: "Any updates?"
7. IA's LLM sees the relay message in its context
8. IA mentions the update in its response to user

**What to Verify**:
- ✅ ResearchAgent can call `message_to_interaction_agent` tool successfully
- ✅ `message_to_interaction_agent` calls `bestEffortRelay()` which calls IA's `relay()`
- ✅ Relay message appears in IA's message history with correct format
- ✅ Relay message identifies which agent sent it (e.g., "Agent dmd_research reports: ...")
- ✅ Next user interaction, IA's LLM has relay in context and mentions it
- ✅ Best-effort behavior: No errors thrown if relay fails (silent failure)

**Test Approach**:
- Test via `message_to_interaction_agent` tool (full path including LLM calling the tool)
- Manually trigger relay (simulate background task calling the tool)
- Verify relay appears in IA's next response to user

**Mocked LLM Behavior**:
- RA's LLM → Calls `message_to_interaction_agent` tool with update message
- IA's LLM (next user message) → Sees relay in history, mentions it in response

**Future Enhancement** (not in this test):
- WebSocket/SSE push to user (real proactive notification)
- IA decides whether to push based on message priority
- User receives notification without sending a message

---

### Scenario 5: Error Handling

**User Action**: "Create agent with same name twice"

**What Should Happen**:
1. First `create_agent` succeeds
2. Second `create_agent` with same name should fail
3. IA receives error from tool
4. IA communicates error to user gracefully

**What to Verify**:
- Duplicate agent creation throws error
- Error message is clear
- System doesn't crash
- IA handles error gracefully

**Mocked LLM Behavior**:
- IA's LLM → Tries to create duplicate agent
- Tool throws error
- IA's LLM → Formats error message for user

**Additional Error Scenarios** (add as we discover issues):
- Agent initialization fails during creation
- JSRPC call times out or fails
- Invalid agent_id in `message_to_research_agent`
- File system errors (invalid paths, write failures)
- Start with duplicate agent, add more as needed based on test findings

---

## Test Structure

**Decision**: Option A (one comprehensive test)
### Option A: One Big Test (Recommended)
```
describe("Full Medical Research Journey - End to End", () => {
  it("handles complete user research flow with multiple agents", async () => {
    // All scenarios in sequence
    // Act 1: Create first agent
    // Act 2: Follow-up question (sticky routing)
    // Act 3: Create second agent (isolation)
    // Act 4: Async relay
    // Act 5: Error handling
  });
});
```

**Pros**:
- Tests real user journey (scenarios happen in sequence)
- State carries across scenarios (realistic)
- Single test = easier to understand flow
- Catches integration issues between scenarios

**Cons**:
- If one scenario fails, subsequent ones might not run
- Harder to debug (need to find which part failed)
- Longer test execution

### Option B: Separate Tests
```
describe("Agent Communication", () => {
  it("creates research agent and saves files", async () => { ... });
  it("routes follow-up to same agent instance", async () => { ... });
  it("isolates multiple agents", async () => { ... });
  it("handles async relay notifications", async () => { ... });
  it("handles duplicate agent errors", async () => { ... });
});
```

**Pros**:
- Isolated failures (one test fails, others still run)
- Easier to debug
- Can run tests independently

**Cons**:
- Each test needs setup (create agents, mock LLMs)
- Doesn't test realistic sequential flow
- More boilerplate

---

## Questions to Resolve

### 1. Test Structure
- **Option A** (one big test) or **Option B** (separate tests)?
- My recommendation: **Option A** for integration tests, since we want to test the full journey

### 2. Mocking Depth
- Mock just LLM responses, or also mock tool executions?
- My recommendation: Mock LLM, let tools execute normally (test real tool behavior)

### 3. Verification Strategy
- ✅ **Decided**: Check both key indicators AND critical state
- Verify: message count, file existence (exact paths), agent names, state persistence
- Deep inspection where critical (message history, workspace isolation)

### 4. R2 File Verification
- ✅ **Decided**: Verify exact file paths and existence
- Check R2 directly (real Miniflare R2 storage)
- Verify workspace separation by R2 prefix
- File content verification optional (existence is primary check)

### 5. Async Relay Priority
- ✅ **Decided**: Include Scenario 4 to test relay plumbing
- Tests the foundation for future real-time notifications
- Verifies RA → IA async communication works
- Real-time push to user (WebSocket) is future enhancement

### 6. Error Scenarios
- Which errors are most important to test?
- My recommendation: Start with duplicate agent, add others if needed

---

## Success Criteria

When this spec is implemented, we should have:

✅ One comprehensive integration test covering full user journey  
✅ Tests run in Miniflare with real Durable Objects  
✅ Mocked LLM for deterministic behavior  
✅ Verification of agent creation, communication, and state persistence  
✅ Test reveals any bugs (duplication, errors, etc.) we need to fix  
✅ Clear path to add real LLM tests later (Phase 2)

---

## Next Steps

1. **Review this spec** - Discuss questions, finalize approach
2. **Implement test** - Write test code following Cloudflare patterns
3. **Run test** - See what passes/fails
4. **Fix issues** - Based on test findings, fix code
5. **Iterate** - Until test passes

---

## Notes

- This spec describes WHAT to test, not HOW to implement
- Implementation will follow Cloudflare's testing patterns (from agents-starter)
- Tests should be readable and maintainable
- Focus on behavior, not implementation details
- Let tests guide us to fixes

