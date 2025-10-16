# Medical Innovation Agent - Architecture

**Inspired by:** [OpenPoke Architecture](https://www.shloked.com/writing/openpoke)

---

## Problem Statement

Real-world adoption of therapies lags behind scientific evidence and regulatory approval, especially for rare conditions. Barriers: insurer friction, fragmented care delivery, siloed information.

## Vision

Ambient AI agent that continuously monitors medical research, maintains dynamic memory, matches breakthroughs to clinician queries, and operates autonomously across weeks/months to track evidence maturation.

---

## Architecture Overview

### Interaction Agent (Orchestrator)
- Single interface for all clinician interactions
- Routes queries to research agents (existing or newly spawned)
- Synthesizes multi-agent findings into conversational responses
- Manages conversation memory with file-based compression
- Decides what to surface vs. suppress (`wait()` tool)
- Never exposes research agents directly to user

### Research Agents (Domain Specialists)
- Dynamically created per disease area (e.g., "Duchenne MD Research", "CAR-T Lymphoma")
- Persistent context via sandboxed file system
- Autonomous operation: web search, email experts, schedule follow-ups via triggers
- Iterate until evidence threshold met (user-defined)
- Report findings to Interaction Agent only (never directly to user)

### Trigger System
- Agents create triggers for future work (owned by creating agent)
- When trigger fires → reactivates agent → executes instruction → reports back
- Examples: "Check Phase 3 results May 2026", "Search Drug X weekly"

### Memory Architecture
- **File System**: Universal memory layer (sandboxed per agent)
- **Conversation Memory**: Interaction Agent compresses to files
- **Research Memory**: Agents write reports, evidence, correspondence to files
- **External Knowledge**: Perplexity API (medical journals, regulatory, clinical trials)

---

## Tool Interface

### Tool Implementation Pattern

Tools use Cloudflare Agents SDK with context injection:

```typescript
// All tools defined in backend/tools/tools.ts
import { tool } from 'ai';
import { getCurrentAgent } from 'agents';

export const example_tool = tool({
  description: 'Tool description for LLM',
  inputSchema: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async ({ param }) => {
    // Access agent context via AsyncLocalStorage
    const { agent } = getCurrentAgent<AgentType>();
    
    // Agent provides env and storage access
    const env = agent.getEnv();
    const storage = agent.getStorage();
    
    // Implementation
    return { result: 'value' };
  }
});
```

**Key Principles:**
- Tools are self-contained (schema + implementation together)
- No factory functions or manual dependency injection
- Agent context available via `getCurrentAgent()` from AsyncLocalStorage
- All tools in single `backend/tools/tools.ts` file

### Interaction Agent Tools

**Agent Management:**
```typescript
create_agent(name, description, message) → {agent_id}
list_agents() → [{id, name, description}]
message_agent(agent_id, message) → {response}
```

**Communication Pattern:**
- Synchronous: User → IA calls `message_agent` → ResearchAgent processes → HTTP response
- Response is immediate, returned as tool result to IA's LLM

### Research Agent Tools

**File System:** (sandboxed to `/memory/research_agents/{agent_name}/`)
```typescript
write_file(path, content) → {ok: true}
read_file(path) → {content}
list_files(dir?) → {files: []}
```

**Communication:**
```typescript
send_message(message) → {ok: true}
```
- Async: ResearchAgent calls `send_message` → POSTs to IA's `/relay` endpoint
- Used for: Progress updates, trigger-initiated reports, background notifications
- Not used for: Synchronous request/response (use HTTP response instead)

**Future Tools** (not yet implemented):
```typescript
// Research
web_search(query) → [{title, url, snippet}]
email_send(to, subject, body) → {email_id}

// Triggers (Cloudflare Workflows)
create_trigger(schedule, instruction) → {trigger_id}
```

**Note:** All file paths are relative to agent's workspace root. Agents cannot access other agents' files.

---

## Data Models

```typescript
research_agents {
  id: uuid
  name: string
  description: string
  workspace_path: string  // e.g., "/memory/research_agents/duchenne_md_research"
  created_at: timestamp
  last_active: timestamp
}

agent_memory {
  agent_id: uuid
  messages: jsonb[]  // Tool calls + file references (not full content)
  summary: text  // Compressed context
}

triggers {
  id: uuid
  agent_id: uuid
  schedule: string
  instruction: string
  status: "pending" | "completed" | "cancelled"
  fire_at: timestamp
}

conversation {
  user_id: uuid
  messages: jsonb[]  // User ↔ Interaction Agent
  summary: text
}
```

---

## File System Structure

### Default Directories (Auto-created)

**Interaction Agent:** `/memory/interaction/`
```
/user_profile/          # Preferences, practice areas
/conversation_history/  # Compressed summaries
/sessions/              # Session logs
/research_index/        # Lightweight index of research agents
```

**Research Agents:** `/memory/research_agents/{agent_name}/`
```
/reports/        # Comprehensive syntheses
/evidence/       # Specific evidence collections
/correspondence/ # Email logs, expert exchanges
/tracking/       # Ongoing monitoring (trials, regulatory)
/notes/          # Working notes, TODOs
```

---

## Architecture Flows

### Flow 1: New Query → Spawn Agent → Autonomous Research
1. User: "Research new DMD treatments"
2. IA clarifies requirements if needed
3. IA spawns "Duchenne MD Research" agent
4. Agent: web searches → emails experts → writes to files → creates triggers
5. Agent: `send_message()` with findings
6. IA: `respond()` to user with synthesized summary

### Flow 2: Trigger Fires → Continue Research
1. Scheduler detects trigger (e.g., "+1 week" elapsed)
2. Reactivates owning agent with instruction
3. Agent: checks email / searches for updates / reads own files
4. Agent: `send_message()` with updates (if significant)
5. IA: `respond()` or `wait()` based on relevance

### Flow 3: Route to Existing Agent
1. User: "Any DMD updates?"
2. IA: `list_research_agents()` → finds DMD agent
3. IA: `message_agent(dmd_agent_id, "User wants updates")`
4. Agent: reads own files → searches for new info
5. Agent: `send_message()` with updates
6. IA: `respond()` to user

---

## Key Design Principles

1. **Minimal Context in IA**: Only knows agent roster + current conversation, not full research history
2. **Rich Context in Research Agents**: Complete domain memory via files, can reference months-old findings
3. **No Direct User ↔ Agent Communication**: Agents always communicate via `send_message()` to IA
4. **Guidelines Over Rules**: Agents decide when to search/email/schedule based on context, not rigid rules
5. **Tools Define Capabilities**: Behavior emerges from tool availability + system prompt
6. **Autonomous Iteration**: Agents work until evidence threshold met (user-defined)
7. **Clarify First**: IA asks clarifying questions when ambiguous, embeds requirements in agent message
8. **Proactive**: Triggers enable continuous work, even when user offline
9. **Strict Sandboxing**: Agents can only access their own file workspace
10. **File System as Memory**: No compression loss, complete audit trail, shareable artifacts

---

## Implementation Stack

### Cloudflare Infrastructure

**Agents:** Durable Objects (InteractionAgent, ResearchAgent)
- Persistent state via `this.state` and Durable Object storage
- Strongly consistent, single-threaded execution
- HTTP-based communication between agents

**Storage:**
- R2 Bucket: File system (`/memory/` structure)
- D1 Database: Agent registry, metadata (not yet implemented)
- Durable Object Storage: Agent state, conversation history

**AI:**
- Workers AI (Llama 3.3 70B) - primary
- OpenAI/Anthropic - configurable via `AI_PROVIDER` env var

**Patterns:**
- Cloudflare Agents SDK (`agents` package)
- AI SDK (`ai` package) for LLM calls with tools
- `getCurrentAgent()` for context injection
- Unified tools in `backend/tools/tools.ts`

### Communication Patterns

**Synchronous (Request/Response):**
```
User → InteractionAgent → message_agent tool
                        ↓
                   ResearchAgent /message endpoint
                        ↓
                   HTTP response with result
```

**Asynchronous (Relay/Push):**
```
ResearchAgent (triggered/background)
      ↓
   send_message tool
      ↓
POST to InteractionAgent /relay endpoint
      ↓
Added to IA's message history
```

### Current Implementation Status

✅ **Implemented:**
- InteractionAgent with agent management tools
- ResearchAgent with file system tools
- Context injection pattern (getCurrentAgent)
- Sync/async communication patterns
- Model factory (Workers AI, OpenAI, Anthropic)

⏸️ **Deferred:**
- Web search integration (Perplexity API)
- Email system
- Trigger/alarm system (Cloudflare Workflows)
- D1 database for metadata
- Frontend UI

---

**Version:** 1.1 | **Updated:** Oct 16, 2025 | **Commit:** e8c0b76

