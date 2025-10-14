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

### Interaction Agent Tools

```typescript
// Agent Management
list_research_agents() → [{id, name, description}]
message_agent(agent_id, message)
spawn_research_agent(name, description, message) → {agent_id}

// User Communication
respond(message)
wait()  // Suppress low-signal messages

// File System (sandboxed to /memory/interaction/)
write_file(file_path, content) → {file_path}
read_file(file_path) → {content}
list_files() → [{file_path, size, modified_at}]
```

### Research Agent Tools

```typescript
// Research
web_search(query, domains?, max_results?) → [{title, url, snippet, source, date}]
  // domains: ["medical_journals", "regulatory", "clinical_trials", "news"]
email_send(to, subject, body) → {email_id}
email_check(email_id) → {has_reply, reply_content}

// Triggers
create_trigger(schedule, instruction) → {trigger_id}
  // schedule: "2026-05-15", "+3 months", "weekly", "monthly"
update_trigger(trigger_id, new_schedule?, new_instruction?)
list_triggers() → [{trigger_id, schedule, instruction, status}]
delete_trigger(trigger_id)

// Communication
send_message(message, priority?) // priority: "normal" | "high"

// File System (sandboxed to /memory/research_agents/{agent_name}/)
write_file(file_path, content) → {file_path}
read_file(file_path) → {content}
list_files() → [{file_path, size, modified_at}]
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

## Implementation Notes

**Interface:** Web-based chat UI (user ↔ IA only)  
**Integrations:** Perplexity API (web search), Email service, Database, Background scheduler  
**Tech Stack:** TBD (React/Next.js frontend, Cloudflare hosting for internship)

---

**Version:** 1.0 | **Updated:** Oct 14, 2025

