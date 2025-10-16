# Codex Review Cleanup — Implementation Plan

## 1. Relay Persistence Alignment
- Update `backend/agents/InteractionAgent.ts` relay method to stop mutating `this.messages`/`saveMessages`.
- Use `persistMessages([...this.messages, relayMessage])`, mirroring `cloudflare/agents-starter/src/server.ts` (`Chat.executeTask`).
- Verify no other code paths manually persist relay messages.

## 2. Message Cleanup & Human-in-the-Loop Scaffolding
- Introduce `cleanupMessages` and `processToolCalls` utilities (ported from `cloudflare/agents-starter/src/utils.ts`) into a backend `utils` module.
- In `InteractionAgent.onChatMessage`, run `cleanupMessages(this.messages)` and feed results through `processToolCalls` before invoking `streamText`.
- Define an `executions` map (initially empty/no-op) and export tools + executions for future confirmation-required actions.
- Ensure typings stay consistent with `ToolSet` expectations.

## 3. Documentation Synchronization
- Remove `convertToAiSdkTools` references in `tasks/core-tools-implementation` docs.
- Document the new cleanup/approval pattern where appropriate (e.g., summarize in `plan.md` once implemented).

## 4. Verification
- Extend/adjust unit tests (`tests/unit/tools.test.ts`) to cover the new execution pipeline as needed.
- Run existing test suite (`npm test` or repo-standard command) to confirm no regressions.
- Capture key changes in the PR summary, highlighting alignment with Cloudflare’s starter patterns.
