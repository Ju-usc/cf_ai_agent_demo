<!-- ee8689ec-55b0-49e4-a2b2-844bb39544b8 15c40529-eae4-47fc-aa21-cd309cb23e04 -->
# Core Tools Implementation Plan

## Goal

Build the foundational tools that enable our multi-agent system:

- Agent management (create, list, message)
- File system (write, read, list) using R2
- LLM function calling integration
- End-to-end working demo

## Scope

**Phase 1 (This Plan):**

- Agent management tools
- R2-backed file system tools
- Function calling integration with Workers AI
- InteractionAgent and ResearchAgent with tools

**Phase 2 (Future):**

- Web search (Perplexity API)
- Email tools (Resend)
- Trigger system (Workflows)

## Architecture Decisions

**Storage Strategy:**

- Durable Object storage: Agent registry, working state
- R2: Agent files (reports, notes, evidence)
- Skip D1 database for MVP (can add later)

**Communication Pattern:**

- RPC-style method calls between Durable Objects
- TypeScript types for type safety

**Function Calling:**

- Structured JSON output parsing
- LLM returns tool calls as JSON
- We parse and execute manually

## Implementation Steps

### 1. Setup R2 File System Wrapper

**File:** `backend/tools/file_system.ts`

Create VirtualFs class that wraps R2 and provides file-system-like API with sandboxing:

```typescript
export class VirtualFs {
  constructor(
    private bucket: R2Bucket,
    private workspacePath: string  // e.g., "memory/agents/dmd-research/"
  ) {}
  
  async writeFile(path: string, content: string): Promise<void>
  async readFile(path: string): Promise<string | null>
  async listFiles(dir?: string): Promise<string[]>
  async deleteFile(path: string): Promise<void>
}
```

Key features:

- Prefix all operations with workspace path (sandboxing)
- Store metadata in customMetadata (timestamp, author)
- Handle errors with retries

### 2. Create Agent Management Tools

**File:** `backend/tools/agent_management.ts`

Implement three core tools for InteractionAgent:

```typescript
export interface AgentManagementTools {
  create_agent(name: string, description: string, message: string): Promise<{agent_id: string}>
  list_agents(): Promise<Array<{id: string, name: string, description: string}>>
  message_agent(agent_id: string, message: string): Promise<{response: string}>
}
```

Implementation details:

- Store agent registry in InteractionAgent's Durable Object storage
- Use RPC to communicate with ResearchAgent instances
- Generate agent IDs from sanitized names

### 3. Define Tool Schemas for LLM

**File:** `backend/tools/schemas.ts`

Define JSON schemas for each tool that the LLM will use:

```typescript
export const TOOL_SCHEMAS = {
  create_agent: {
    name: "create_agent",
    description: "Create a new research agent for a specific domain",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Agent name (e.g., 'duchenne_md_research')" },
        description: { type: "string", description: "What this agent researches" },
        message: { type: "string", description: "Initial research task" }
      },
      required: ["name", "description", "message"]
    }
  },
  // ... other tools
}
```

### 4. Update InteractionAgent with Tools

**File:** `backend/agents/InteractionAgent.ts`

Major changes:

- Add VirtualFs instance for file operations
- Add agent management methods
- Implement tool execution router
- Add system prompt with tool descriptions
- Parse LLM responses for tool calls
- Execute tools and feed results back to LLM

Flow:

1. User message → LLM with tool schemas
2. LLM returns JSON with tool_calls
3. Parse and execute each tool
4. Feed results back to LLM
5. LLM generates final response
6. Return to user

### 5. Update ResearchAgent with Tools

**File:** `backend/agents/ResearchAgent.ts`

Add capabilities:

- VirtualFs instance (scoped to agent's workspace)
- File system tools (write_file, read_file, list_files)
- send_message tool (report back to InteractionAgent)
- System prompt with available tools
- Tool execution logic

Agent workspace: `memory/agents/{agent_name}/`

### 6. Update Type Definitions

**File:** `backend/types.ts`

Add:

- Tool call types
- Tool response types
- Agent info types
- File system types
```typescript
export interface ToolCall {
  tool: string;
  args: Record<string, any>;
}

export interface ToolResponse {
  tool: string;
  result: any;
  error?: string;
}
```


### 7. Update Worker Entry Point

**File:** `backend/index.ts`

Ensure R2 bucket is properly bound and accessible to Durable Objects through env.

### 8. Testing Strategy

Test each component incrementally:

**Test 1: VirtualFs**

- Write file to R2
- Read it back
- List files
- Verify sandboxing

**Test 2: Agent Creation**

- Create research agent via InteractionAgent
- Verify it's registered in storage
- Verify workspace created

**Test 3: Tool Execution**

- Send message that triggers tool call
- Verify LLM returns tool call JSON
- Verify tool executes correctly
- Verify result fed back to LLM

**Test 4: End-to-End**

- User: "Research DMD treatments"
- IA creates research agent
- RA writes file with findings
- IA responds to user with summary

## File Structure

```
backend/
├── tools/
│   ├── file_system.ts       (NEW - VirtualFs class)
│   ├── agent_management.ts  (NEW - create/list/message)
│   └── schemas.ts           (NEW - Tool JSON schemas)
├── agents/
│   ├── InteractionAgent.ts  (UPDATE - add tools)
│   └── ResearchAgent.ts     (UPDATE - add tools)
├── types.ts                 (UPDATE - add tool types)
└── index.ts                 (UPDATE - verify bindings)
```

## Key Implementation Details

### Tool Execution Flow

```
User: "Research DMD"
  ↓
InteractionAgent.handleChat()
  ↓
Workers AI (with tool schemas in system prompt)
  ↓
Returns: { tool_calls: [{ tool: "create_agent", args: {...} }] }
  ↓
Parse JSON, execute create_agent()
  ↓
Create ResearchAgent Durable Object
  ↓
Feed result back to LLM: "Agent created successfully"
  ↓
LLM generates user-facing response
  ↓
User: "Started research on DMD with new agent"
```

### R2 Workspace Structure

```
medical-innovation-files/
└── memory/
    ├── interaction/
    │   ├── agent_registry.json
    │   └── sessions/
    │       └── 2025-10-14.log
    └── agents/
        ├── duchenne_md_research/
        │   ├── reports/
        │   │   └── findings.md
        │   ├── notes/
        │   │   └── todo.md
        │   └── evidence/
        │       └── trials.json
        └── cart_lymphoma_research/
            └── reports/
                └── latest.md
```

### Error Handling

- Wrap R2 operations in try/catch with retries
- Validate tool arguments before execution
- Return structured error messages to LLM
- Log errors for debugging

## Success Criteria

1. InteractionAgent can create ResearchAgent via tool call
2. ResearchAgent can write files to R2 in sandboxed workspace
3. ResearchAgent can read its own files
4. InteractionAgent can list all active agents
5. End-to-end flow: User message → Agent creation → File written → Response
6. All operations tested with curl commands

## Next Steps After This Phase

1. Add web search tool (Perplexity API)
2. Add email tools (Resend)
3. Add trigger system (Workflows)
4. Build minimal frontend
5. Add D1 database for production-grade registry

### To-dos

- [ ] Create VirtualFs wrapper class for R2 with sandboxing
- [ ] Implement create_agent, list_agents, message_agent tools
- [ ] Define JSON schemas for all tools
- [ ] Update InteractionAgent with tool execution and function calling
- [ ] Update ResearchAgent with file tools and send_message
- [ ] Add TypeScript types for tools and responses
- [ ] Test VirtualFs read/write/list/sandbox operations
- [ ] Test creating research agent via InteractionAgent
- [ ] Test LLM function calling and tool execution flow
- [ ] Test end-to-end: User message → Agent creation → File write → Response