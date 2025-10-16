# Tool Naming Proposal

## Current Problem

The current tool names are confusing because they don't clearly indicate:
1. **Direction** (IA → RA vs RA → IA)
2. **Sync vs Async** (wait for response vs fire-and-forget)

### Current Names:
```typescript
// InteractionAgent tools
message_agent(agent_id, message)  // IA → RA (sync)

// ResearchAgent tools
send_message(message)  // RA → IA (async)
```

**Confusion**: Both have "message" in the name, hard to tell apart.

---

## Communication Patterns

### Pattern 1: Synchronous Query (IA asks RA)

```
User → IA → message_agent tool → JSRPC stub.sendMessage() → RA processes
                                                                  ↓
                                  IA receives response ← ← ← ← ← ←
```

- **Use case**: User asks question → IA asks RA to research
- **Response**: Synchronous (waits for response)
- **Current name**: `message_agent`

### Pattern 2: Async Notification (RA notifies IA)

```
Background trigger → RA wakes up → send_message tool → IA.relay() → IA's history
                                                                          ↓
                                                        (Sits in history)
                                                                          ↓
                                          User sends next message → IA mentions it
```

- **Use case**: Background trigger fires, RA wants to notify IA
- **Response**: Fire-and-forget (no response expected)
- **Current name**: `send_message`

---

## Proposed New Names

### Option 1: Clear Direction + Sync/Async

```typescript
// InteractionAgent tools
query_research_agent(agent_id, message)
// - Clear: "query" implies asking and waiting for response
// - Clear direction: IA → research agent

// ResearchAgent tools  
notify_interaction_agent(message)
// - Clear: "notify" implies one-way push
// - Clear direction: RA → interaction agent
```

### Option 2: Action-Based

```typescript
// InteractionAgent tools
ask_agent(agent_id, message)
// - Simple: "ask" implies sync request/response

// ResearchAgent tools
relay_to_interaction(message)
// - Simple: "relay" implies forwarding message
// - Matches the `relay()` method name
```

### Option 3: Explicit Sync/Async

```typescript
// InteractionAgent tools
sync_message_to_agent(agent_id, message)

// ResearchAgent tools
async_notify_interaction(message)
```

---

## Recommendation

**DECISION MADE**: `message_to_research_agent` + `message_to_interaction_agent`

**Reasons**:
1. ✅ Clear direction (to_research_agent vs to_interaction_agent)
2. ✅ Consistent naming pattern (message_to_X)
3. ✅ Simple and straightforward (easy to remember)
4. ✅ Self-documenting (tool name explains what it does)

Original Option 1 (`query_research_agent` + `notify_interaction_agent`) was considered but rejected for inconsistency (query vs notify).

User preference: Use consistent "message_to_X" pattern for both tools.

---

## Implementation Plan

### Step 1: Add New Tool Names (Keep Old Ones)

```typescript
// Add aliases first
export const query_research_agent = message_agent;
export const notify_interaction_agent = send_message;
```

### Step 2: Update Tests to Use New Names

```typescript
// In integration tests
IA calls: query_research_agent(agent_id, message)
RA calls: notify_interaction_agent(message)
```

### Step 3: Update Agent Prompts

```typescript
// InteractionAgent system prompt
"You can query_research_agent(agent_id, message) to ask a research agent for findings."

// ResearchAgent system prompt
"You can notify_interaction_agent(message) to send updates back to the coordinator."
```

### Step 4: Deprecate Old Names (Future)

- Keep `message_agent` and `send_message` for backward compatibility
- Add deprecation warnings
- Remove in next major version

---

## Alternative: Keep Current Names?

**Arguments for keeping `message_agent` + `send_message`**:
- Already implemented and working
- Tests already use these names
- Could add better documentation instead

**Arguments for changing**:
- Confusing for new developers
- Hard to remember which is sync vs async
- Better names improve code readability
- Better to fix now before more code uses them

---

## Decision

✅ **IMPLEMENTED**: Renamed tools before integration tests

**Chosen**: Option 1 - Rename before integration tests.

**Reason**: Integration tests will use these tool names extensively. Better to have clear names from the start than refactor later.

### Actual Names Used
- `message_to_research_agent` (sync: IA → RA)
- `message_to_interaction_agent` (async: RA → IA)

### Files Updated
1. ✅ `backend/tools/tools.ts` - Tool definitions
2. ✅ `tests/unit/tools.test.ts` - Unit tests
3. ✅ `tests/unit/tools.spec.md` - Unit test spec
4. ✅ `tests/integration/agent-communication.spec.md` - Integration test spec
5. ✅ `tasks/testing-setup/tool-naming-proposal.md` - This file

---

## Summary

**Before**: `message_agent` + `send_message` (confusing)

**After**: `message_to_research_agent` + `message_to_interaction_agent` (clear)

**Status**: ✅ Implemented and updated across all files

**Next Steps**: Update agent system prompts to use new tool names

