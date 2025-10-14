# Cloudflare Tech Stack for Multi-Agent Systems

Research findings for building the Medical Innovation Agent on Cloudflare infrastructure.

**Last Updated:** Oct 14, 2025

---

## Overview

Cloudflare provides a complete stack for building multi-agent AI systems:
- **Workers AI**: LLM inference
- **Durable Objects**: Persistent state management & coordination
- **Workflows**: Durable execution & background orchestration
- **Storage**: D1 (SQL), KV (key-value), R2 (object storage)

---

## 1. Cloudflare Agents SDK

**Official Docs:** https://developers.cloudflare.com/agents

### Key Features
- Purpose-built for AI agent development on Cloudflare
- Integrates Workers AI, Durable Objects, and Workflows
- Code-first approach (not DSL/config-based)
- Production-ready patterns for multi-agent orchestration

### Common Patterns
- **Coordinator-Worker**: One agent orchestrates, delegates to specialists
- **Pipeline**: Sequential processing, each agent adds value
- **Collaborative**: Agents share context and results
- **Hierarchical**: Multi-level with supervisors and workers

### Best Practices
- Clear agent responsibilities and boundaries
- Proper error handling and retry logic
- Monitoring and observability
- Rate limiting and resource management

**Relevant Links:**
- Patterns: https://developers.cloudflare.com/agents/patterns
- Examples: https://developers.cloudflare.com/durable-objects/examples/agents
- API Reference: https://developers.cloudflare.com/agents/api-reference/run-workflows

---

## 2. Durable Objects (State Management)

**Official Docs:** https://developers.cloudflare.com/durable-objects

### What They Provide
- **Strongly consistent storage** with single-threaded execution
- **Persistent state** that survives across requests
- **Coordination primitives** for distributed systems

### Key Characteristics
- **Single-threaded consistency**: Eliminates race conditions within an object
- **Automatic replication**: Data persists, no manual durability management
- **Transactional storage**: Atomic operations guaranteed

### API Pattern
```typescript
class AgentDurableObject {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    // Get data
    let value = await this.state.storage.get("key");
    
    // Put data
    await this.state.storage.put("key", value);
    
    // Atomic transaction
    await this.state.storage.transaction(async txn => {
      let count = await txn.get("counter") || 0;
      await txn.put("counter", count + 1);
    });
  }
}
```

### Multi-Agent Coordination Patterns
- **Leader election**: Single DO as coordinator
- **Message queues**: Queue agent tasks
- **Shared state**: Coordinate agent decisions
- **Locks/Semaphores**: Prevent concurrent operations

### Best Practices
- **Control and data plane pattern**: Separate orchestration from data
- **Invoke methods directly**: Use RPC-style calls instead of HTTP fetch
- **Batch operations**: Minimize storage API calls

**Relevant Links:**
- Best Practices: https://developers.cloudflare.com/durable-objects/best-practices
- Storage API: https://developers.cloudflare.com/durable-objects/api/state
- Control/Data Plane Pattern: https://developers.cloudflare.com/reference-architecture/diagrams/storage/durable-object-control-data-plane-pattern

---

## 3. Workflows (Background Orchestration)

**Official Docs:** https://developers.cloudflare.com/workflows  
**Blog Post:** https://blog.cloudflare.com/workflows-ga-production-ready-durable-execution

### What Workflows Enable
- **Durable execution**: Automatic state persistence and retries
- **Background tasks**: Long-running operations (minutes to hours)
- **Scheduling**: Sleep and schedule operations
- **Event-driven**: Wait for webhooks, human approval, external events

### Key Capabilities
1. **Automatic State Persistence**: Progress not lost on failures
2. **Automatic Retries**: Resilient to real-world failures
3. **Sleep Operations**: `await sleep("1 hour")`, `await sleep.until("2026-05-15")`
4. **Human-in-the-Loop**: Pause for approval, then continue
5. **Event Waiting**: Wait for webhooks (Stripe, GitHub, etc.)

### Programming Model
- **Code-first**: "Workflows are just code" - full programming language power
- **No DSL**: Unlike config-based systems, use JavaScript/TypeScript
- **Dynamic**: Define steps on-the-fly, conditional branching, loops

### Integration with Agents
- Works seamlessly with Agents SDK
- Ideal for trigger system (scheduled research checks)
- Handle long-running research tasks

### Quick Start
```bash
npm create cloudflare@latest workflows-starter -- --template "cloudflare/workflows-starter"
```

### Use Cases for Our System
- **Triggers**: Schedule research agent reactivation
- **Email waiting**: Sleep until expert responds
- **Retry logic**: Auto-retry failed web searches
- **Long research**: Multi-hour literature review workflows

**Relevant Links:**
- Overview: https://developers.cloudflare.com/workflows
- Product Page: https://workers.cloudflare.com/product/workflows
- Video Tutorial: https://www.youtube.com/watch?v=L6gR4Yr3UW8

---

## 4. Storage Options Comparison

**Official Guide:** https://developers.cloudflare.com/workers/platform/storage-options

| Storage Type | Best For | Our Use Case |
|--------------|----------|--------------|
| **Durable Objects** | Strong consistency, coordination, real-time state | Agent memory (conversation logs, tool calls) |
| **D1** | Relational data, SQL queries, structured data | Agent registry, triggers table, conversation metadata |
| **KV** | Global low-latency reads, eventually consistent | User profiles, research index (optional cache) |
| **R2** | Large files, object storage, S3-compatible | File system memory (reports, evidence, correspondence) |

### Recommended Stack for Our System
1. **Durable Objects**: Each agent instance (IA and research agents)
2. **D1**: Database for agents, triggers, conversation metadata
3. **R2**: File system storage for agent workspaces (`/memory/`)
4. **KV**: Optional caching layer for frequently accessed data

---

## 5. Workers AI (LLM Inference)

**Official Docs:** https://developers.cloudflare.com/workers-ai

### Supported Models
- Llama 3.1 (8B, 70B)
- Llama 3.3 (70B) - Recommended for internship
- Mistral 7B
- Many others

### Integration
```typescript
const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
  messages: [
    { role: 'system', content: 'You are a medical research agent...' },
    { role: 'user', content: 'Research DMD treatments' }
  ],
  tools: [...] // Tool definitions
});
```

### Cost Considerations
- **Free tier**: 10,000 neurons/day
- **Paid**: $0.011 per 1M neurons
- Much cheaper than external LLM APIs (OpenAI, Anthropic)

### Trade-offs
- **Pros**: Integrated, low latency, cost-effective, serverless
- **Cons**: Smaller models than GPT-4/Claude, limited control
- **Recommendation**: Start with Workers AI, can add external LLMs later

---

## 6. Recommended Architecture

### Component Mapping

| Our System Component | Cloudflare Product |
|---------------------|-------------------|
| **Interaction Agent** | Durable Object + Workers AI |
| **Research Agents** | Durable Objects + Workers AI |
| **Trigger Scheduler** | Workflows (sleep/schedule) |
| **Agent Registry** | D1 (SQL database) |
| **File System Memory** | R2 (object storage) |
| **Background Execution** | Workflows |
| **API/Frontend** | Workers + Pages |

### Proposed Stack
```
Frontend: Cloudflare Pages (React)
    ↓
API: Cloudflare Workers
    ↓
Orchestration: Workflows (triggers, background tasks)
    ↓
Agents: Durable Objects (one per agent)
    ↓
LLM: Workers AI (Llama 3.3)
    ↓
Storage:
  - Agent registry: D1 (SQL)
  - File memory: R2 (object storage)
  - Metadata: Durable Object state
```

### Data Flow Example
1. User sends message → Worker
2. Worker → Interaction Agent (Durable Object)
3. IA spawns Research Agent → New Durable Object
4. Research Agent calls Workers AI → tool calls
5. Agent writes report → R2 file storage
6. Agent creates trigger → Workflow scheduled
7. Workflow fires later → reactivates Durable Object
8. Agent continues research → sends message to IA
9. IA responds to user → Worker → Frontend

---

## 7. Implementation Considerations

### What to Use Cloudflare For
✅ **Core orchestration**: Workers, Durable Objects, Workflows  
✅ **Database**: D1 for structured data  
✅ **File storage**: R2 for agent workspaces  
✅ **LLM inference**: Workers AI (Llama 3.3)  
✅ **Frontend**: Pages  

### What Might Be External
❓ **Perplexity API**: Web search (no Cloudflare equivalent)  
❓ **Email service**: SendGrid/Resend (Cloudflare Email Routing is different)  
❓ **External LLM**: Optional fallback to Claude/GPT-4 for complex reasoning

### Internship Showcase Strategy
- **Primary**: Build on 100% Cloudflare stack where possible
- **Hybrid**: Use external APIs where Cloudflare lacks capability
- **Highlight**: Workers AI, Durable Objects, Workflows (newest products)
- **Document**: Show why each product was chosen

---

## 8. Quick Start Template

```bash
# Create new Cloudflare Workers project
npm create cloudflare@latest medical-innovation-agent

# Choose options:
# - Framework: None (we'll add React later)
# - TypeScript: Yes
# - Deploy: No (not yet)

# Add dependencies
cd medical-innovation-agent
npm install @cloudflare/ai @cloudflare/workflows

# Project structure
/src
  /workers       # API endpoints
  /agents        # Durable Object classes
  /workflows     # Workflow definitions
  /tools         # Agent tools (web_search, email, etc.)
/memory          # R2 bucket structure (deployed separately)
/schema          # D1 database schemas
```

---

## 9. Key Resources

### Documentation
- Agents SDK: https://developers.cloudflare.com/agents
- Durable Objects: https://developers.cloudflare.com/durable-objects
- Workflows: https://developers.cloudflare.com/workflows
- Workers AI: https://developers.cloudflare.com/workers-ai
- Storage Options: https://developers.cloudflare.com/workers/platform/storage-options

### Blog Posts
- Building AI Agents: https://blog.cloudflare.com/build-ai-agents-on-cloudflare
- Workflows GA: https://blog.cloudflare.com/workflows-ga-production-ready-durable-execution
- R2 SQL: https://blog.cloudflare.com/r2-sql-deep-dive

### Examples & Patterns
- Agent Patterns: https://developers.cloudflare.com/agents/patterns
- Durable Object Examples: https://developers.cloudflare.com/durable-objects/examples
- Composable AI Architecture: https://developers.cloudflare.com/reference-architecture/diagrams/ai/ai-composable

---

## 10. Next Steps

1. **Prototype minimal agent** with Durable Object + Workers AI
2. **Test Workflows** for trigger scheduling
3. **Implement R2 file system** for agent memory
4. **Build D1 schema** for agent registry + triggers
5. **Create simple frontend** with Pages
6. **Add external integrations** (Perplexity, email)
7. **Document design decisions** for internship submission

---

**Status:** Research complete, ready for implementation planning

