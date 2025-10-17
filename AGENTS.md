## AGENT RULES
This file contains the rules and guidelines for the agents.
Please follow these rules and guidelines when interacting with the user and the code.

## Useful Docs

Start with README.md for the high-level tour.

> Architecture evolves. Always cross-check /docs for current truth.

See also:
- `/docs/ARCHITECTURE.md` - System design
- `/docs/CLOUDFLARE_TECH_STACK.md` - Tech stack research
- `/docs/MVP_PLAN.md` - Implementation roadmap
---

## Dev Setup & Common Commands

```bash
# Install dependencies
npm install

# Create D1 database (one-time)
wrangler d1 create medical-innovation-db
# Copy database_id to wrangler.toml

# Initialize database schema
npm run db:init

# Create R2 bucket (one-time)
wrangler r2 bucket create medical-innovation-files

# Start local development server
npm run dev

# Deploy to Cloudflare
npm run deploy
```

---

## Quick Iteration Mode

* **Local dev server**: `npm run dev` - fastest loop for testing
* **wrangler tail**: `wrangler tail` - real-time logs from deployed worker
* **Direct curl**: Test endpoints without UI
* **Unit tests**: Mock Durable Objects, test tools in isolation

\`\`\`bash
# Send a test chat message
curl -X POST http://localhost:8787/api/chat \\
  -H "Content-Type: application/json" \\
  -d '{"message":"Test"}'

# Health check
curl http://localhost:8787/health

# Tail deployed worker logs
wrangler tail
\`\`\`

---

## Testing Strategy

* **Default:** Test tools and utilities without network calls
* **Mock external APIs:** Perplexity, email service responses
* **Integration:** Test full Durable Object → Workers AI → Response flow locally
* **E2E:** Deploy to staging, test real multi-agent orchestration

Keep most tests fast and deterministic. Save integration for critical flows.

---

## Spec-Driven Development

This project uses **Specification-Driven Development** for tests and complex modules.

### Philosophy
* Write specifications (`.spec.md`) in plain English describing WHAT to test/build
* AI agent acts as "compiler" generating/verifying code (`.test.ts` or `.ts`) from specs
* Specs are source of truth - living documentation that evolves with code

### When to Use Specs
* ✅ **All tests** - Test specifications define behavior in plain English
* ✅ **Complex modules** - Multi-step logic, state management, agent communication (after tests proven)
* ❌ **Simple utilities** - One-liners, type definitions, config files

### Workflow
1. **Human writes/edits** `.spec.md` files (high-level intent, test cases, edge cases)
2. **AI generates** corresponding implementation files
3. **Human reviews** generated code
4. **Human updates specs** when requirements change → AI updates code

### File Structure
```
tests/
├── TESTS.md              # Testing philosophy and patterns
├── unit/
│   ├── tools.spec.md     # Test specification (human-editable)
│   └── tools.test.ts     # Test implementation (AI-generated)
backend/
├── tools/
│   ├── tools.spec.md     # Module specification (for complex modules)
│   └── tools.ts          # Implementation
```

See `tests/TESTS.md` for detailed testing patterns and examples.

---

## Coding conventions (enforced by review)

* Follow contracts in `docs/ARCHITECTURE.md` - do not add ad-hoc tools or fields
* Single-shape I/O per function/module; validate at boundaries, **fail fast**
* Keep modules small; avoid globals
* TypeScript types are contracts - trust them, avoid defensive checks
* Reuse helpers/utilities; delete duplicate code
* Cloudflare Workers are stateless - state lives in Durable Objects only
* Follow Cloudflare Agents SDK patterns (see agents-starter for examples)

---

## Git Workflow Rules

**CRITICAL: Never commit or push without explicit user permission**

* ❌ **DO NOT** commit changes on your own initiative
* ❌ **DO NOT** push to remote without user approval
---

## Writing style 

- Avoid long bullet lists.
- Write in plain, natural English. Be conversational.
- Do not use overly complex words or structures.
- Write in complete, clear sentences.
- Speak like a Senior Developer mentoring a junior engineer.
- Provide enough context for the User to understand, but keep explanations short.
- Always state your assumptions and conclusions clearly.
- When user asks follow-up questions or requests explanations, answer directly in conversation. Do NOT create markdown files unless explicitly asked.
- Sacrifice grammar for the sake of concision.
- List any unresolved questions at the end, if any.
---

## Help the user learn

- when coding, always explain what you are doing and why
- your job is to help the user learn & upskill himself, above all
- assume the user is an intelligent, tech savvy person -- but do not assume he knows the details
- explain everything clearly, simply, in easy-to-understand language with a simple example or analogy may be helpful to understand intuitively.
- Always consider MULTIPLE different approaches, and analyze their tradeoffs just like a Senior Developer would

---

## Repo Pointers (Orientation)

* `backend/` — Backend (Cloudflare Workers + Durable Objects)
  * `agents/` — Agent classes (Interaction + Research)
  * `tools/` — Agent tool implementations (to be added)
  * `db/` — Database schemas
* `frontend/` — React app (to be added, deployed via Cloudflare Pages)
* `docs/` — Architecture, tech stack, MVP plan
* `wrangler.toml` — Cloudflare config
* `AGENTS.md` — This file - your guidelines


---

## Agentic Coding Workflow Guidlines 
Make sure in each tasks/ folder, we have research.md, plan.md, review.md files. These files should be updated as we progress through the task.

- Operating on a task basis. Store all intermediate context in markdown files in tasks/<task-id>/ folders.
- Use semantic task id slugs

1. Research

- Find existing patterns in this codebase
- Search internet, official docs, mcp tools if relevant (PREFER using nia tools than relying only on generic web search)
- Start by asking follow up questions to set the direction of research
- Report reusable findings in research.md file

2. Planning

- Read the research.md in tasks for <task-id>.
- Based on the research come up with a plan for implementing the user request. We should reuse existing patterns, components and code where possible.
- If needed, ask clarifying questions to user to understand the scope of the task
- Write the comprehensive plan to plan.md. The plan should include all context required for an engineer to implement the feature.
- Consider multiple design choices with their tradeoffs.
- Wait for user to read and approve the plan
- **When user adds comments to plan.md:**
  - If comments raise design questions → ask user in CONVERSATION, then update plan.md with DECISIONS
  - Do NOT add questions/options to plan.md - keep it clean with decisions only
  - Update plan.md to reflect user's feedback and agreed decisions

3. Implementation

- Read. plan.md and create a todo-list with all items, then execute on the plan.
- Go for as long as possible. If ambiguous, leave all questions to the end and group them.

4. Verification

- Once implementation is complete, you must verify that the implementation meets the requirements and is free of bugs.
- Do this by running tests, making tool calls and checking the output.
- If there are any issues, go back to the implementation step and make the necessary changes.
- Once verified, update the task status to "verified".
