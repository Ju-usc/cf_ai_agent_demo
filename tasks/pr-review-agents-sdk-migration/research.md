# PR Review: Agents SDK Migration Research

## Overview

This document captures findings from reviewing the recent Agents SDK migration and ChatGPT Pro's suggestions for improvement.

## Current State Analysis

### What Was Changed (Recent Commits)

1. **Moved to Agents SDK** (commits: ab9bb15, d3998b0, 2946d7b)
   - `InteractionAgent` now extends `AIChatAgent` from `agents/ai-chat-agent`
   - `ResearchAgent` now extends `Agent` from `agents`
   - Using SDK's `streamText` and `generateText` instead of manual LLM calls
   - Router now uses `routeAgentRequest` from SDK

2. **Unified Tool Definitions** (commit: ab9bb15)
   - Deleted `backend/tools/schemas.ts`
   - Created single `backend/tools/tools.ts` using `tool()` from `ai` SDK
   - All tools use Zod schemas for validation
   - Execute functions are wired up inline in each agent

3. **Model Factory** (commit: ffd9879)
   - Created `backend/agents/modelFactory.ts`
   - Supports Workers AI, OpenAI, and Anthropic
   - Selectable via `AI_PROVIDER` environment variable

### Current Implementation Patterns

#### InteractionAgent (backend/agents/InteractionAgent.ts)

```typescript
export class InteractionAgent extends AIChatAgent<Env> {
  async onChatMessage(onFinish, _options) {
    const model = createChatModel(this.env);
    
    // Wire up execute functions inline
    const agentMgr = createAgentManagementTools(this.env, this.ctx.storage);
    const tools = {
      create_agent: {
        ...allTools.create_agent,
        execute: async ({ name, description, message }) => {
          return agentMgr.create_agent(name, description, message);
        },
      },
      // ... more tools
    };

    const result = await streamText({
      model,
      system: systemPrompt,
      messages: this.messages as any,  // ⚠️ Using inherited messages
      tools: tools as ToolSet,
      onFinish,
    });

    return result.toTextStreamResponse();
  }

  // Custom relay endpoint for ResearchAgent callbacks
  private async handleRelay(request: Request) {
    const { agent_id, message } = await request.json();
    
    // ⚠️ ISSUE: Manually pushing to messages array
    this.messages.push({
      role: 'user',
      content: `Agent ${agent_id} reports: ${message}`,
    } as any);
    
    // ⚠️ ISSUE: Manually calling saveMessages
    await this.saveMessages(this.messages);
    
    return Response.json({ ok: true });
  }
}
```

#### ResearchAgent (backend/agents/ResearchAgent.ts)

```typescript
export class ResearchAgent extends Agent<Env, ResearchState> {
  private fs: VirtualFs | null = null;
  initialState: ResearchState = { messages: [], name: '', description: '' };

  private async handleMessage(request: Request) {
    const { message } = await request.json();
    
    // Update state with new message
    this.setState({ 
      ...this.state, 
      messages: [...(this.state?.messages ?? []), { role: 'user', content: message }] 
    });

    const model = createChatModel(this.env);
    
    // Wire up execute functions inline
    const tools = {
      write_file: {
        ...allTools.write_file,
        execute: async ({ path, content }) => {
          await this.ensureFs().writeFile(path, content, { author: this.state?.name });
          return { ok: true };
        },
      },
      // ... more tools
    };

    const result = await generateText({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(this.state?.messages ?? []),
      ] as any,
      tools,
    });

    // Store assistant response
    this.setState({ 
      ...this.state, 
      messages: [...(this.state?.messages ?? []), { role: 'assistant', content: result.text }] 
    });
    
    return Response.json({ message: result.text });
  }
}
```

#### Tool Definitions (backend/tools/tools.ts)

```typescript
export const tools = {
  create_agent: tool({
    description: 'Create a new research agent for a specific domain',
    inputSchema: z.object({
      name: z.string().describe('Agent name'),
      description: z.string().describe('What this agent researches'),
      message: z.string().describe('Initial research task'),
    }),
    // Execute wired up in agent - NOT HERE
  }),
  // ... more tools
};
```

## Cloudflare Agents Starter Pattern Analysis

### How agents-starter Does It

1. **Tool Definition with Context Access**

```typescript
// src/tools.ts
import { getCurrentAgent } from "agents";
import type { Chat } from "./server";

const scheduleTask = tool({
  description: "Schedule a task to be executed at a later time",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    // ✅ Get agent context via AsyncLocalStorage
    const { agent } = getCurrentAgent<Chat>();
    
    if (!agent) throw new Error("Agent context not available");
    
    // Use agent methods directly
    agent.schedule(input, "executeTask", description);
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

// Auto-executing tool (no confirmation needed)
const getLocalTime = tool({
  description: "get the local time",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    return "10am";
  }
});

// Tool requiring human confirmation (no execute)
const getWeatherInformation = tool({
  description: "show the weather in a given city",
  inputSchema: z.object({ city: z.string() })
  // No execute = requires confirmation
});

// Export tools
export const tools = {
  getWeatherInformation,
  getLocalTime,
  scheduleTask
} satisfies ToolSet;

// Execution handlers for confirmation-required tools
export const executions = {
  getWeatherInformation: async ({ city }) => {
    return `The weather in ${city} is sunny`;
  }
};
```

2. **Agent Implementation**

```typescript
// src/server.ts
export class Chat extends AIChatAgent<Env> {
  async onChatMessage(onFinish, _options) {
    // ✅ Merge all tools (including MCP tools)
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // ✅ Clean up incomplete tool calls
        const cleanedMessages = cleanupMessages(this.messages);
        
        // ✅ Process tool confirmations (human-in-the-loop)
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful assistant...`,
          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,  // All tools in one place
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<typeof allTools>,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
}
```

3. **Human-in-the-Loop Processing**

```typescript
// src/utils.ts
export async function processToolCalls({
  dataStream,
  messages,
  executions
}) {
  const processedMessages = await Promise.all(
    messages.map(async (message) => {
      const parts = message.parts;
      if (!parts) return message;

      const processedParts = await Promise.all(
        parts.map(async (part) => {
          if (!isToolUIPart(part)) return part;

          const toolName = part.type.replace("tool-", "");
          
          // Only process confirmation-required tools
          if (!(toolName in executions) || part.state !== "output-available")
            return part;

          let result;
          if (part.output === APPROVAL.YES) {
            // Execute after user approves
            result = await executions[toolName](part.input, {
              messages: convertToModelMessages(messages),
              toolCallId: part.toolCallId
            });
          } else if (part.output === APPROVAL.NO) {
            result = "Error: User denied access";
          }

          // Stream result to client
          dataStream.write({
            type: "tool-output-available",
            toolCallId: part.toolCallId,
            output: result
          });

          return { ...part, output: result };
        })
      );

      return { ...message, parts: processedParts };
    })
  );

  return processedMessages;
}
```

## Key Findings from AIChatAgent API

From `node_modules/agents/dist/ai-chat-agent.d.ts`:

```typescript
declare class AIChatAgent<Env = unknown, State = unknown> extends Agent<Env, State> {
  /** Array of chat messages for the current conversation */
  messages: UIMessage[];  // ✅ Built-in property
  
  /**
   * Save messages on the server side
   */
  saveMessages(messages: UIMessage[]): Promise<void>;  // ✅ Built-in method
  
  persistMessages(
    messages: UIMessage[],
    excludeBroadcastIds?: string[]
  ): Promise<void>;  // ✅ Built-in method
  
  /**
   * Handle incoming chat messages and generate a response
   */
  onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal: AbortSignal | undefined }
  ): Promise<Response | undefined>;
}
```

**Key Insight**: `AIChatAgent` already handles message persistence! We don't need to manually call `saveMessages()` or manage `this.messages` ourselves.

## Issues Identified

### 1. ❌ Redundant Message Management in InteractionAgent

**Problem**: Manually pushing to `this.messages` and calling `saveMessages()` in the relay handler.

```typescript
// In handleRelay()
this.messages.push({ role: 'user', content: `Agent ${agent_id} reports: ${message}` });
await this.saveMessages(this.messages);
```

**Why it's redundant**: `AIChatAgent` already persists messages automatically. The SDK handles message lifecycle.

**Impact**: 
- Duplicated state management logic
- Potential for state divergence
- Unnecessary manual persistence calls

### 2. ❌ Factory Pattern for Tool Execution

**Problem**: Using `createAgentManagementTools()` factory and wiring execute functions inline.

```typescript
const agentMgr = createAgentManagementTools(this.env, this.ctx.storage);
const tools = {
  create_agent: {
    ...allTools.create_agent,
    execute: async ({ name, description, message }) => {
      return agentMgr.create_agent(name, description, message);
    },
  },
};
```

**Why it's not ideal**:
- Factory requires passing `env` and `storage` manually
- Lots of boilerplate code
- Execute functions are separated from tool definitions

**Cloudflare pattern**: Use `getCurrentAgent()` with AsyncLocalStorage to access agent context directly in tool definitions.

### 3. ❌ Missing Human-in-the-Loop Pattern

**Problem**: No support for tool confirmations. All tools auto-execute.

**Cloudflare pattern**: 
- Tools without `execute` require user confirmation
- `executions` object provides handlers after approval
- `processToolCalls()` manages the confirmation workflow

### 4. ❌ No Message Cleanup

**Problem**: No handling of incomplete tool calls before sending to LLM.

**Cloudflare pattern**: Use `cleanupMessages()` to filter out incomplete tool invocations.

### 5. ❌ Obsolete References in Docs

**Problem**: `convertToAiSdkTools()` mentioned in docs but deleted from code.

**Files referencing it**:
- `tasks/core-tools-implementation/refactor-review.md`
- `REFACTOR_SUMMARY.md`
- `tasks/core-tools-implementation/explicit-tools-improvement.md`

### 6. ❌ Empty Test Suite

**Problem**: `tests/` folder has minimal tests, no tool execution tests.

**Cloudflare pattern**: agents-starter includes Vitest config and comprehensive tests.

## Benefits of Aligning with agents-starter Pattern

### 1. **Cleaner Tool Definitions**

**Before** (our current pattern):
```typescript
// backend/tools/tools.ts
export const tools = {
  create_agent: tool({
    description: '...',
    inputSchema: z.object({...}),
    // Execute wired up elsewhere
  }),
};

// backend/agents/InteractionAgent.ts
const agentMgr = createAgentManagementTools(this.env, this.ctx.storage);
const tools = {
  create_agent: {
    ...allTools.create_agent,
    execute: async ({ name, description, message }) => {
      return agentMgr.create_agent(name, description, message);
    },
  },
};
```

**After** (agents-starter pattern):
```typescript
// backend/tools/agent_management.ts
import { getCurrentAgent } from 'agents';
import type { InteractionAgent } from '../agents/InteractionAgent';

export const create_agent = tool({
  description: 'Create a new research agent',
  inputSchema: z.object({...}),
  execute: async ({ name, description, message }) => {
    // Get agent context from AsyncLocalStorage
    const { agent } = getCurrentAgent<InteractionAgent>();
    
    // Access env and storage directly
    const doId = agent.env.RESEARCH_AGENT.idFromName(name);
    // ... rest of logic
    
    return { agent_id: name };
  }
});
```

### 2. **Less Boilerplate**

- No factory functions needed
- No manual dependency injection
- Tools are self-contained with full context access

### 3. **Human-in-the-Loop Support**

- Dangerous operations (like `delete_agent`) can require user confirmation
- Separate tool definition from execution logic
- Built-in approval workflow

### 4. **Better Message Management**

- Rely on SDK's built-in persistence
- Automatic cleanup of incomplete tool calls
- Proper message lifecycle handling

### 5. **More Maintainable**

- Follows official Cloudflare patterns
- Easier to understand for new developers
- Better aligned with SDK updates

## Recommended Changes Summary

Based on this research, ChatGPT Pro's suggestions are valid:

1. ✅ **Remove redundant message tracking** in InteractionAgent
2. ✅ **Adopt getCurrentAgent pattern** for context injection
3. ✅ **Add processToolCalls** for human-in-the-loop
4. ✅ **Add cleanupMessages** before sending to LLM
5. ✅ **Delete obsolete helper references** from docs
6. ✅ **Add tests** for tool execution and routing

## Next Steps

Will create a detailed improvement plan with specific code changes and migration steps.
