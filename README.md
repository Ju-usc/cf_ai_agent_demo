# Medical Innovation Agent

Multi-agent AI system for accelerating medical innovation distribution. Built on Cloudflare Workers, Durable Objects, and Workers AI.

**Cloudflare Internship Submission** - Demonstrates multi-agent orchestration with autonomous research capabilities.

---

## Architecture

- **Interaction Agent**: Orchestrates user queries, spawns research agents
- **Research Agents**: Autonomous domain specialists with persistent memory
- **Trigger System**: Background scheduling via Cloudflare Workflows
- **File System**: Agent memory stored in R2
- **Database**: Agent registry and triggers in D1

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full design.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Cloudflare account
- Wrangler CLI

### Setup

```bash
# Install dependencies
npm install

# Create D1 database
wrangler d1 create medical-innovation-db
# Copy the database_id to wrangler.toml

# Initialize database schema
npm run db:init

# Create R2 bucket
wrangler r2 bucket create medical-innovation-files

# Set up environment variables
cp .dev.vars.example .dev.vars
# Add your API keys to .dev.vars

# Start development server
npm run dev
```

### Test

```bash
# Health check
curl http://localhost:8787/health

# Send chat message
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Research new treatments for Duchenne muscular dystrophy"}'
```

---

## Project Structure

```
cf_ai_agent_demo/
├── backend/            # Backend (Cloudflare Workers)
│   ├── index.ts       # Worker entry point
│   ├── types.ts       # TypeScript types
│   ├── agents/        # Durable Objects
│   │   ├── InteractionAgent.ts
│   │   └── ResearchAgent.ts
│   ├── tools/         # Agent tools (to be added)
│   └── db/
│       └── schema.sql # D1 schema
│
├── frontend/          # React app (to be added)
│   ├── pages/        # Chat + Dashboard
│   ├── components/   # UI components
│   └── hooks/        # React hooks
│
├── docs/             # Architecture docs
├── wrangler.toml    # Cloudflare config
└── AGENTS.md        # Development guidelines
```

**Note:** Frontend will be built separately and deployed to Cloudflare Pages.

---

## Development Roadmap

- [x] Basic project scaffold
- [ ] Tool system (web_search, email, file_system, triggers)
- [ ] Agent orchestration (spawn, message routing)
- [ ] Workflows integration
- [ ] Frontend (Chat + Dashboard)

See [MVP_PLAN.md](./MVP_PLAN.md) for full implementation plan.

---

## Deployment

```bash
# Deploy to Cloudflare
npm run deploy

# Set production secrets
wrangler secret put PERPLEXITY_API_KEY
wrangler secret put EMAIL_API_KEY
```

---

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [CLOUDFLARE_TECH_STACK.md](./CLOUDFLARE_TECH_STACK.md) - Tech stack research
- [MVP_PLAN.md](./MVP_PLAN.md) - Implementation plan

---

## License

MIT

