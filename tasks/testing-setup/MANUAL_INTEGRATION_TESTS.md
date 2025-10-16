# Manual Integration Testing Guide

This document describes how to manually test agent communication via HTTP endpoints. These tests verify real Durable Object communication that cannot be automated in vitest.

**Reference**: [Cloudflare Workers Testing Docs](https://developers.cloudflare.com/workers/testing/vitest-integration/) recommend testing Durable Objects via HTTP boundary, not internal inspection.

---

## Setup

```bash
# Start the local development server
npm run dev

# Server runs at http://localhost:8787
# Logs appear in your terminal
```

---

## Test Scenarios

### Scenario 1: Health Check (Baseline)

Verify the worker is running:

```bash
curl http://localhost:8787/health
```

**Expected Response**:
```json
{
  "status": "ok"
}
```

**What it tests**: Basic HTTP routing works.

---

### Scenario 2: CORS Preflight

Verify CORS headers are correct:

```bash
curl -X OPTIONS http://localhost:8787/agents/interaction-agent/default/message \
  -H "Origin: https://example.com"
```

**Expected Response**:
- Status: `200`
- Headers:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type`

**What it tests**: Frontend can communicate with backend.

---

### Scenario 3: Create Agent via Interaction Agent

Send a message to the InteractionAgent, which creates a ResearchAgent:

```bash
curl -X POST http://localhost:8787/agents/interaction-agent/default/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Research Duchenne muscular dystrophy treatments"
  }'
```

**Expected Response**:
- Status: `200`
- Body: JSON response from ResearchAgent (may take 5-10 seconds while LLM processes)

**What it tests**:
- ✅ InteractionAgent receives message
- ✅ Calls `create_agent` tool successfully
- ✅ ResearchAgent created and initialized
- ✅ ResearchAgent responds with research results

**Troubleshooting**:
- If timeout: Check `npm run dev` logs for errors
- If 404: Make sure server is running on port 8787
- If error about missing tools: Check `backend/tools/tools.ts` exports

---

### Scenario 4: Follow-up Message (Sticky Routing)

Send another message to the same agent:

```bash
curl -X POST http://localhost:8787/agents/interaction-agent/default/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What other therapies should I consider?"
  }'
```

**Expected Response**:
- Status: `200`
- Body: Updated research response (should reference previous context)

**What it tests**:
- ✅ Message routed to same ResearchAgent (sticky routing)
- ✅ Agent remembered previous message (state persistence)
- ✅ Context maintained across messages

---

### Scenario 5: Multiple Agents (Isolation)

Create a second research topic:

```bash
curl -X POST http://localhost:8787/agents/interaction-agent/default/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Also research CAR-T therapy for lymphoma"
  }'
```

**Expected Response**:
- Status: `200`
- Body: Research for CAR-T therapy (should NOT mention DMD)

**What it tests**:
- ✅ New ResearchAgent created (not reusing existing one)
- ✅ Separate state per agent (CAR-T research isolated from DMD research)
- ✅ Multiple agents can coexist

---

### Scenario 6: 404 on Invalid Path

Try an endpoint that doesn't exist:

```bash
curl -X POST http://localhost:8787/invalid/path \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

**Expected Response**:
- Status: `404`
- Body: `{ "error": "Not found" }`

**What it tests**: Invalid routes handled gracefully.

---

## Validation Checklist

After running Scenarios 1-6, verify:

- [ ] Scenario 1: Health check returns 200 OK
- [ ] Scenario 2: CORS headers present and correct
- [ ] Scenario 3: ResearchAgent created, returns research
- [ ] Scenario 4: Follow-up uses same agent (sticky routing)
- [ ] Scenario 5: New agent created (separate state)
- [ ] Scenario 6: 404 on invalid path

**All checks passing**: Integration working! ✅

---

## Debugging

### Check logs in npm run dev terminal

```
[wrangler] POST /agents/interaction-agent/default/message
[wrangler] ✅ InteractionAgent.initialize called
[wrangler] ✅ create_agent tool executed
[wrangler] ✅ ResearchAgent.initialize called
[wrangler] ✅ Response returned to client
```

### Common Errors

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `Cannot read properties of undefined (reading 'idFromName')` | Durable Object stub not initialized | Check agent class is exported in `backend/index.ts` |
| `Tool not found: create_agent` | Tools not exported | Verify `backend/tools/tools.ts` exports all tools |
| Timeout (>30 seconds) | LLM call hanging | Check API key in `.env.local` |
| 404 on `/agents/**` path | Routing not working | Verify `backend/index.ts` includes `routeAgentRequest` |

---

## Next Steps

Once all manual tests pass:

1. **Unit tests** verify tool logic in isolation ✅ (already automated)
2. **Manual integration tests** verify HTTP + Durable Object communication ✅ (this guide)
3. **Deploy to staging** for full end-to-end testing
4. **Automated DO tests** can be added later if vitest improves DO support

**Current Status**:
- Unit tests: 26/26 automated ✅
- Integration tests: 6 manual scenarios 📋
- Ready for staging deployment: Yes ✅
