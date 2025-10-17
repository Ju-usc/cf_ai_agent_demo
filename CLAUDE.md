# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Overview

**Medical Innovation Agent** - Multi-agent AI system for accelerating medical innovation distribution, built on Cloudflare Workers + Durable Objects. This is a Cloudflare Internship submission demonstrating multi-agent orchestration with autonomous research capabilities.

Two agent types communicate via JSRPC:
- **InteractionAgent** (orchestrator): Manages user chat, spawns/routes to ResearchAgents
- **ResearchAgent** (specialists): Autonomous research with persistent memory in R2 file system

---

## Development Commands

### Setup (First Time)
```bash
npm install

# Create D1 database
wrangler d1 create medical-innovation-db
# Copy the returned database_id into wrangler.toml [[d1_databases]] section

npm run db:init

# Create R2 bucket
wrangler r2 bucket create medical-innovation-files

# Set up local environment variables
cp .dev.vars.example .dev.vars
# Edit .dev.vars to add API keys
```

### Daily Development
```bash
npm run dev                # Start local dev server (backend + frontend together)
wrangler tail              # Stream logs from deployed worker

# Frontend-only development (if needed)
cd frontend && npm run dev

# Test endpoints
curl http://localhost:8787/health
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Research DMD treatments"}'
```

### Testing & Deployment
```bash
npm test                   # Run vitest tests
npm run deploy             # Deploy to Cloudflare

# Set production secrets
wrangler secret put PERPLEXITY_API_KEY
wrangler secret put EMAIL_API_KEY
```

---

## Architecture Essentials

### Multi-Agent Communication Pattern

**Synchronous (User → IA → RA):**
```typescript
User sends message
  → InteractionAgent.onChatMessage()
    → create_agent / message_to_research_agent tool
      → ResearchAgent.initialize() or .sendMessage() [JSRPC call]
        → Returns response immediately
```

**Asynchronous (RA → IA, background updates):**
```typescript
ResearchAgent (triggered or autonomous)
  → message_to_interaction_agent tool
    → InteractionAgent.relay() [JSRPC call]
      → Appends to IA's message history
```

### File System as Memory

All agents use R2 for persistent memory:
- **InteractionAgent**: `/memory/interaction/` (user profiles, conversation history, research index)
- **ResearchAgent**: `/memory/research_agents/{agent_name}/` (reports, evidence, correspondence, tracking, notes)

Files are sandboxed per agent - no cross-agent file access. See `backend/tools/file_system.ts` for VirtualFs implementation.

### Tool System Architecture

All tools are defined in **`backend/tools/tools.ts`** using the `getCurrentAgent()` pattern from Cloudflare Agents SDK:

```typescript
export const example_tool = tool({
  description: 'Tool description for LLM',
  inputSchema: z.object({ param: z.string() }),
  execute: async ({ param }) => {
    const { agent } = getCurrentAgent<AgentType>();
    const env = agent.getEnv();
    const storage = agent.getStorage();
    // Implementation
    return { result: 'value' };
  }
});
```

**InteractionAgent tools**: `create_agent`, `list_agents`, `message_to_research_agent`
**ResearchAgent tools**: `write_file`, `read_file`, `list_files`, `message_to_interaction_agent`

### Routing & SDK Integration

The Worker entry point (`backend/index.ts`) uses `routeAgentRequest()` from Cloudflare Agents SDK:
- Agent URLs follow kebab-case: `/agents/interaction-agent/main` or `/agents/research-agent/{id}`
- Legacy `/api/chat` endpoint forwards to `/agents/interaction-agent/main/chat`
- Manual fallback routing handles kebab-case → PascalCase conversion if SDK routing fails

### Model Selection

AI providers are configurable via `backend/agents/modelFactory.ts`:
- **Primary**: Workers AI (Llama 3.3 70B) - use `AI_PROVIDER=workers-ai`
- **Alternatives**: OpenAI (`openai`), Anthropic (`anthropic`)
- Set via `AI_PROVIDER` env var in `.dev.vars` or production secrets

---

## Key Files & Their Roles

### Backend (Cloudflare Workers)
- `backend/index.ts` - Worker entry point, agent routing, CORS handling
- `backend/agents/InteractionAgent.ts` - Orchestrator agent (extends AIChatAgent)
- `backend/agents/ResearchAgent.ts` - Domain specialist agents (extends Agent)
- `backend/agents/modelFactory.ts` - AI provider abstraction
- `backend/tools/tools.ts` - **All** tool definitions with getCurrentAgent() pattern
- `backend/tools/file_system.ts` - VirtualFs R2 wrapper for agent memory
- `backend/utils/toolProcessing.ts` - Tool call processing utilities
- `backend/db/schema.sql` - D1 schema (research_agents, triggers, agent_events)

### Frontend (React + Vite)
- `frontend/src/pages/Chat.tsx` - Main chat interface with streaming (AI SDK v5)
- `frontend/src/pages/Dashboard.tsx` - Agent registry view
- `frontend/src/lib/api.ts` - API configuration and helpers
- Entry points: `frontend/src/main.tsx` + `frontend/src/App.tsx`

### Documentation
- `docs/ARCHITECTURE.md` - Full system design (tool contracts, data models, flows)
- `docs/FRONTEND_AI_SDK_V5.md` - Frontend AI SDK v5 integration patterns ⭐ NEW
- `docs/MVP_PLAN.md` - Implementation roadmap
- `AGENTS.md` - Development guidelines (read this for workflow patterns)

---

## Development Workflow (from AGENTS.md)

### Spec-Driven Development

This project uses **plain-English specifications** as source of truth:
- Write `.spec.md` files describing WHAT to build (behavior, test cases, edge cases)
- AI generates implementation (`.test.ts` or `.ts`) from specs
- Use for all tests + complex modules (NOT for simple utilities)

Example structure:
```
tests/unit/tools.spec.md     → tests/unit/tools.test.ts
backend/tools/tools.spec.md  → backend/tools/tools.ts
```

### Task-Based Development

Store intermediate context in `tasks/<task-id>/` folders (semantic slug names):
1. **Research** (`research.md`) - Find existing patterns, search docs/internet, ask clarifying questions
2. **Planning** (`plan.md`) - Comprehensive plan reusing existing patterns. Wait for user approval.
3. **Implementation** - Create todo-list from plan, execute
4. **Verification** - Run tests, verify output, update status

### Testing Strategy

- **Unit**: Mock external APIs (Perplexity, email), test tools/utils in isolation
- **Integration**: Test full Durable Object → Workers AI → Response flow locally
- **E2E**: Deploy to staging, test multi-agent orchestration

Keep tests fast and deterministic. Save integration for critical flows.

---

## Important Conventions

1. **Follow contracts in `docs/ARCHITECTURE.md`** - Do not add ad-hoc tools or fields
2. **Single-shape I/O** - Validate at boundaries, fail fast
3. **TypeScript types are contracts** - Trust them, avoid defensive checks
4. **Workers are stateless** - State lives in Durable Objects only
5. **Agent sandboxing** - Agents only access their own `/memory/research_agents/{name}/` workspace
6. **Tool self-containment** - Schema + implementation together, no factory functions
7. **Cloudflare Agents SDK patterns** - Use `getCurrentAgent()` from AsyncLocalStorage for context injection

---

## Writing Style (from AGENTS.md)

- Write in plain, conversational English like a Senior Developer mentoring a junior
- Avoid long bullet lists or overly complex words
- Explain assumptions and conclusions clearly
- When answering follow-ups, respond in conversation - do NOT create markdown files unless explicitly asked
- Sacrifice grammar for concision

---

## Git Workflow

**CRITICAL: Never commit or push without explicit user permission**

---

## Current Status

✅ **Implemented:**
- InteractionAgent + ResearchAgent with JSRPC communication
- Tool system with getCurrentAgent() pattern
- File system memory (R2 via VirtualFs)
- Model factory (Workers AI, OpenAI, Anthropic)
- Minimal frontend with streaming chat + dashboard

⏸️ **Deferred:**
- Web search integration (Perplexity API)
- Email system
- Trigger/alarm system (Cloudflare Workflows)
- D1 database usage (schema exists but not actively used)

---

## Quick Reference

### Test a chat message
```bash
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Create an agent to research Duchenne MD treatments"}'
```

### Access InteractionAgent directly
```
http://localhost:8787/agents/interaction-agent/main
```

### Access ResearchAgent by ID
```
http://localhost:8787/agents/research-agent/{agent_id}
```

### View logs in real-time
```bash
wrangler tail
```

---

**Last Updated:** Oct 16, 2025
