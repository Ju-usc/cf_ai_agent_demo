# MVP Implementation Plan

Medical Innovation Agent - Cloudflare Internship Demo

**Last Updated:** Oct 14, 2025

---

## MVP Scope Summary

### Core Features
✅ **Full Tool Set**: web_search, email_send/check, triggers, file_system, agent_management  
✅ **Real-Time Chat**: Clean UI for user ↔ Interaction Agent  
✅ **Debug Dashboard**: Separate page with live sync to inspect agents  
✅ **Real Perplexity API**: Actual medical research  
✅ **Parallel Async Agents**: Multiple agents working simultaneously  
✅ **Trigger System**: Real timers + manual fire for demo  

### User Experience
- **Chat Interface** (`/`) - Main user interaction
- **Debug Dashboard** (`/dashboard`) - Real-time agent inspection
- **Both pages sync in real-time** - See chat updates in dashboard, vice versa

---

## System Architecture

### High-Level Flow
```
User Browser (Chat)          Reviewer Browser (Dashboard)
       ↓                              ↓
   Cloudflare Pages (React)
       ↓
   Cloudflare Workers (API)
       ↓
   ┌──────────────────────────────────────┐
   │  Interaction Agent (Durable Object)  │
   └──────────────────────────────────────┘
              ↓         ↓         ↓
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Research│  │ Research│  │ Research│
   │ Agent 1 │  │ Agent 2 │  │ Agent 3 │
   │   (DO)  │  │   (DO)  │  │   (DO)  │
   └─────────┘  └─────────┘  └─────────┘
        ↓            ↓            ↓
   ┌─────────────────────────────────────┐
   │  Workers AI (Llama 3.3)             │
   └─────────────────────────────────────┘
        ↓            ↓            ↓
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │   R2    │  │   D1    │  │Workflows│
   │  Files  │  │Database │  │ Triggers│
   └─────────┘  └─────────┘  └─────────┘
```

### Real-Time Sync Strategy
**WebSocket or Server-Sent Events (SSE)**
- Chat page: User sends messages, receives responses
- Dashboard page: Subscribes to all agent events
- Both connected to same Durable Object instance
- Events broadcast to all connected clients

---

## Tech Stack (Finalized)

### Frontend
- **Framework**: React + TypeScript
- **Routing**: React Router (/, /dashboard)
- **UI Library**: Tailwind CSS + shadcn/ui
- **Real-time**: WebSocket or EventSource (SSE)
- **Deployment**: Cloudflare Pages

### Backend
- **Runtime**: Cloudflare Workers
- **Agents**: Durable Objects (IA + Research Agents)
- **LLM**: Workers AI (@cf/meta/llama-3.3-70b-instruct-fp8-fast)
- **Triggers**: Cloudflare Workflows
- **Database**: D1 (SQLite)
- **File Storage**: R2 (object storage)

### External APIs
- **Perplexity API**: Web search with medical domain filters
- **Email**: Resend or SendGrid

---

## File Structure

```
cf_ai_agent_demo/
├── backend/                      # Cloudflare Workers
│   ├── index.ts                 # Main API worker
│   ├── agents/                   # Durable Objects
│   │   ├── InteractionAgent.ts
│   │   └── ResearchAgent.ts
│   │
│   ├── tools/                    # Agent tools
│   │   ├── web_search.ts
│   │   ├── email.ts
│   │   ├── file_system.ts
│   │   ├── triggers.ts
│   │   └── agent_management.ts
│   │
│   ├── workflows/                # Cloudflare Workflows
│   │   ├── trigger_scheduler.ts
│   │   └── agent_reactivation.ts
│   │
│   ├── db/
│   │   └── schema.sql           # D1 database schema
│   │
│   └── types.ts                 # TypeScript types
│
├── frontend/                     # React app (Cloudflare Pages)
│   ├── pages/
│   │   ├── Chat.tsx             # Main chat interface
│   │   └── Dashboard.tsx        # Debug dashboard
│   ├── components/
│   │   ├── ChatMessage.tsx
│   │   ├── AgentList.tsx
│   │   ├── FileExplorer.tsx
│   │   ├── TriggerSchedule.tsx
│   │   └── AgentInspector.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   └── useAgentState.ts
│   └── App.tsx
│
├── tests/
│   ├── unit/
│   │   ├── tools.test.ts
│   │   └── agents.test.ts
│   └── integration/
│       └── e2e.test.ts
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CLOUDFLARE_TECH_STACK.md
│   ├── MVP_PLAN.md              # This file
│   └── PROMPTS.md               # System prompts
│
├── wrangler.toml                # Cloudflare config
├── package.json
├── tsconfig.json
└── README.md
```

---

## Database Schema (D1)

```sql
-- Research Agents
CREATE TABLE research_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL
);

-- Triggers
CREATE TABLE triggers (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  schedule TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fire_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES research_agents(id)
);

CREATE INDEX idx_triggers_fire_at ON triggers(fire_at, status);
CREATE INDEX idx_triggers_agent_id ON triggers(agent_id);

-- Conversation (metadata only, full history in Durable Object)
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Agent Events (for dashboard real-time feed)
CREATE TABLE agent_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  event_type TEXT NOT NULL,  -- 'spawn', 'tool_call', 'message', 'file_write', 'trigger_create'
  event_data TEXT NOT NULL,  -- JSON
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_events_timestamp ON agent_events(timestamp DESC);
CREATE INDEX idx_events_agent ON agent_events(agent_id);
```

---

## R2 File Structure

```
/memory/
  /interaction/
    /user_profile/
      preferences.md
    /conversation_history/
      2025-10-week-42-summary.md
    /sessions/
      2025-10-14_dmd_session.md
    /research_index/
      active_investigations.md
  
  /research_agents/
    /duchenne_md_research/
      /reports/
        2025-10-14_comprehensive_landscape.md
      /evidence/
        fda_approvals.md
        clinical_trials.md
      /correspondence/
        sarepta_exchange_2025-10-14.md
      /tracking/
        active_trials.md
      /notes/
        scheduled_checks.md
```

---

## API Design

### REST Endpoints

```typescript
// Chat
POST   /api/chat              // Send message to IA
GET    /api/chat/history      // Get conversation history

// Agents
GET    /api/agents            // List all research agents
GET    /api/agents/:id        // Get agent details
POST   /api/agents/:id/message // Message specific agent
DELETE /api/agents/:id        // Delete agent

// Files
GET    /api/files             // List files (with path param)
GET    /api/files/content     // Read file content
POST   /api/files             // Write file (admin only)

// Triggers
GET    /api/triggers          // List all triggers
POST   /api/triggers/:id/fire // Manually fire trigger (demo mode)
DELETE /api/triggers/:id      // Cancel trigger

// Dashboard
GET    /api/dashboard/state   // Get full system state
GET    /api/events            // Get recent agent events (SSE)
```

### WebSocket Events

```typescript
// Client → Server
{
  type: 'chat_message',
  message: string
}

{
  type: 'subscribe_agent',
  agent_id: string
}

// Server → Client
{
  type: 'agent_spawned',
  agent: { id, name, description }
}

{
  type: 'tool_called',
  agent_id: string,
  tool: string,
  args: any
}

{
  type: 'file_written',
  agent_id: string,
  file_path: string
}

{
  type: 'trigger_created',
  trigger: { id, schedule, instruction }
}

{
  type: 'trigger_fired',
  trigger_id: string,
  agent_id: string
}

{
  type: 'message_received',
  from: 'ia' | agent_id,
  message: string,
  priority: 'normal' | 'high'
}
```

---

## Implementation Checklist

### Foundation
- [ ] Project setup (Wrangler, React, TypeScript)
- [ ] D1 database schema
- [ ] R2 bucket configured
- [ ] Basic Durable Objects (IA + Research Agent)
- [ ] Workers AI integration

### Core Agent System
- [ ] Agent orchestration (spawn, message, route)
- [ ] Agent management tools
- [ ] Communication tools (respond, wait, send_message)

### Research Tools
- [ ] Perplexity API integration
- [ ] File system (R2)
- [ ] Email service

### Trigger System
- [ ] Workflows integration
- [ ] Trigger creation/management
- [ ] Agent reactivation

### UI
- [ ] Chat interface
- [ ] Debug dashboard
- [ ] Real-time sync (WebSocket/SSE)

### Polish
- [ ] Error handling
- [ ] Documentation
- [ ] Demo preparation

---

## System Prompts

### Interaction Agent
```
You are the Interaction Agent for a medical innovation research system.

Your role:
- Interface with clinicians (users) via conversational chat
- Route research queries to appropriate research agents
- Synthesize findings from multiple agents
- Decide what to surface to users vs. suppress

Tools available:
- list_research_agents(): See existing agents
- spawn_research_agent(name, description, message): Create new agent
- message_agent(agent_id, message): Route to existing agent
- respond(message): Reply to user
- wait(): Suppress low-signal updates
- write_file(file_path, content): Manage user profile/session logs
- read_file(file_path): Read your own files
- list_files(): Browse your workspace

Guidelines:
- Clarify user requirements before spawning agents
- Keep context minimal (you don't need full research details)
- Suppress routine background updates (use wait())
- Surface high-priority breakthroughs immediately
- Maintain user profile in /user_profile/preferences.md
- Log sessions in /sessions/

Personality: Professional, evidence-based, proactive but not overwhelming.
```

### Research Agent Template
```
You are a specialized medical research agent for: {DOMAIN}

Your mission: {INITIAL_MESSAGE}

Tools available:
- web_search(query, domains?, max_results?): Search medical literature
  domains: ["medical_journals", "regulatory", "clinical_trials", "news"]
- email_send(to, subject, body): Contact experts
- email_check(email_id): Check for replies
- create_trigger(schedule, instruction): Schedule future work
- write_file(file_path, content): Save research artifacts
- read_file(file_path): Read your own files
- list_files(): Browse your workspace
- send_message(message, priority?): Report to Interaction Agent

Guidelines:
- Work autonomously until evidence threshold met
- Organize files logically:
  /reports/ - comprehensive syntheses
  /evidence/ - specific evidence collections
  /correspondence/ - email exchanges
  /tracking/ - ongoing monitoring
  /notes/ - working notes
- When evidence insufficient: email experts or schedule follow-up
- Create triggers for future checks (trial completions, publications)
- Report findings via send_message() when complete or stuck
- Iterate: search → evaluate → email → schedule → repeat

Personality: Thorough, autonomous, evidence-driven.
```

---

## Demo Flow (Example)

### Act 1: User Query
**User:** "Research new treatments for Duchenne muscular dystrophy"

**IA:**
1. Clarifies: "Should I focus on FDA-approved, ongoing trials, or both?"
2. User: "Both, comprehensive"
3. IA spawns "Duchenne MD Research" agent
4. IA responds: "Starting comprehensive DMD research..."

**Dashboard shows:**
- New agent appears in list
- Event: "Agent spawned: Duchenne MD Research"

---

### Act 2: Agent Research
**DMD Agent (parallel tool calls):**
1. `web_search("DMD FDA approved 2024-2025", domains=["regulatory"])`
2. `web_search("DMD clinical trials", domains=["clinical_trials"])`
3. `write_file("reports/2025-10-14_landscape.md", [full report])`
4. `email_send(to="clinical@sarepta.com", subject="Safety data request")`
5. `create_trigger("+1 week", "Check email for response")`
6. `send_message("Completed DMD research. Report: reports/2025-10-14_landscape.md")`

**Dashboard shows (real-time):**
- Tool calls appearing as they happen
- File created: `reports/2025-10-14_landscape.md`
- Trigger scheduled for Oct 21
- Agent message sent to IA

---

### Act 3: User Sees Result
**IA:**
1. Receives message from DMD agent
2. Evaluates: high relevance
3. `respond("Completed DMD research. Key findings: [summary]. 📄 [View Full Report](reports/2025-10-14_landscape.md)")`

**User sees:** Conversational summary + link to detailed report

**Dashboard:** Event feed shows full interaction chain

---

### Act 4: Trigger Fires (Demo Mode)
**Reviewer clicks "Fire Trigger" in dashboard**

**System:**
1. Workflow activates DMD agent
2. Agent: `email_check(previous_email_id)`
3. Agent: Finds reply with data
4. Agent: `write_file("evidence/long_term_safety.md", [data])`
5. Agent: `send_message("Update: Received safety data...", priority="high")`

**IA:**
1. Receives high-priority message
2. `respond("Important DMD update: Received long-term safety data...")`

**User sees:** Proactive update in chat

**Dashboard:** Full trace visible in real-time

---

## Testing Strategy

### Unit Tests
- Individual tool functions (web_search, email, file_system)
- Agent message routing logic
- File path sanitization (prevent escaping sandbox)
- Trigger scheduling logic

### Integration Tests
- IA spawns Research Agent → agent responds
- Agent creates file → file appears in R2
- Agent creates trigger → trigger fires → agent reactivates
- WebSocket events broadcast correctly

### Mock Testing
- Mock Perplexity API responses
- Mock email service
- Mock Workers AI responses
- Ensure demo works without external APIs

---

## Deployment Checklist

- [ ] Environment variables configured (Perplexity API key, email service)
- [ ] D1 database deployed
- [ ] R2 bucket created
- [ ] Workflows enabled
- [ ] Domain configured (optional)
- [ ] README with setup instructions
- [ ] PROMPTS.md with all system prompts used
- [ ] Demo video or live deployment link
- [ ] Repository clean, well-documented

---

## Success Criteria

### Functional
✅ User can chat with IA  
✅ IA spawns research agents  
✅ Agents perform real web searches  
✅ Agents write files to R2  
✅ Agents create triggers  
✅ Triggers fire and reactivate agents  
✅ Dashboard shows real-time agent activity  

### Technical
✅ Built entirely on Cloudflare stack  
✅ Durable Objects for agent instances  
✅ Workflows for trigger system  
✅ Workers AI for LLM inference  
✅ Clean, type-safe TypeScript codebase  

### Demo Quality
✅ Clean, professional UI  
✅ Real-time updates work smoothly  
✅ Dashboard provides deep inspection  
✅ Demo flow is compelling  
✅ Documentation is clear  

---

## Next Steps

1. **Initialize project** with Wrangler
2. **Set up D1 database** with schema
3. **Create basic Durable Object** for IA
4. **Build minimal chat UI**
5. **Implement Workers AI integration**
6. **Start Phase 1** (Foundation)

**Ready to start building?** Let me know and I'll help scaffold the project!

