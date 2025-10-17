/**
 * Unified Tool Definitions
 * 
 * All tools in one place - agents import what they need.
 * Uses getCurrentAgent() pattern for context injection.
 */

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { getCurrentAgent } from 'agents';
import type { InteractionAgent } from '../agents/InteractionAgent';
import type { ResearchAgent } from '../agents/ResearchAgent';
import type { ResearchAgentInfo, AgentRegistryEntry } from '../types';
import type { ExecutionsMap } from '../utils/toolProcessing';

// ============================================================================
// Agent Management Tools (for InteractionAgent)
// ============================================================================

const REGISTRY_KEY = 'agent_registry';

const sanitizeName = (name: string): string => {
  const trimmed = name.trim().toLowerCase();
  const sanitized = trimmed
    .replace(/[^a-z0-9-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'agent';
};

async function loadRegistry(
  storage: DurableObjectState['storage']
): Promise<Record<string, AgentRegistryEntry>> {
  const existing = await storage.get<Record<string, AgentRegistryEntry>>(REGISTRY_KEY);
  return existing ?? {};
}

async function saveRegistry(
  storage: DurableObjectState['storage'],
  registry: Record<string, AgentRegistryEntry>
): Promise<void> {
  await storage.put(REGISTRY_KEY, registry);
}

export const create_agent = tool({
  description: 'Create a new research agent for a specific domain',
  inputSchema: z.object({
    name: z.string().describe('Agent name (e.g., duchenne_md_research)'),
    description: z.string().describe('What this agent researches'),
    message: z.string().describe('Initial research task'),
  }),
  execute: async ({ name, description, message }) => {
    const { agent } = getCurrentAgent<InteractionAgent>();
    if (!agent) throw new Error('Agent context not available');

    const now = Date.now();
    const idName = sanitizeName(name);

    // Check for duplicate agent name
    const storage = agent.getStorage();
    const registry = await loadRegistry(storage);
    if (registry[idName]) {
      throw new Error(`Agent already exists: ${idName}`);
    }

    const env = agent.getEnv();
    const doId = env.ResearchAgent.idFromName(idName);
    const stub = env.ResearchAgent.get(doId);

    try {
      await stub.initialize(idName, description, message);
    } catch (error: any) {
      const errText = error?.message ?? String(error);
      throw new Error(`Failed to initialize agent: ${errText}`);
    }

    // Add to registry
    registry[idName] = {
      id: idName,
      name: idName,
      description,
      createdAt: now,
      lastActive: now,
    };
    await saveRegistry(storage, registry);

    return { agent_id: idName };
  },
});

export const list_agents = tool({
  description: 'List all known research agents',
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<InteractionAgent>();
    if (!agent) throw new Error('Agent context not available');

    const storage = agent.getStorage();
    const registry = await loadRegistry(storage);
    const list: ResearchAgentInfo[] = Object.values(registry).map(
      ({ id, name, description }) => ({ id, name, description })
    );
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  },
});

export const message_to_research_agent = tool({
  description: 'Send a message to a specific research agent',
  inputSchema: z.object({
    agent_id: z.string().describe('The ID of the agent'),
    message: z.string().describe('Message to send'),
  }),
  execute: async ({ agent_id, message }) => {
    const { agent } = getCurrentAgent<InteractionAgent>();
    if (!agent) throw new Error('Agent context not available');

    const idName = sanitizeName(agent_id);
    const env = agent.getEnv();
    const doId = env.ResearchAgent.idFromName(idName);
    const stub = env.ResearchAgent.get(doId);

    // JSRPC: Direct method call instead of HTTP
    const reply = await stub.sendMessage(message);

    const storage = agent.getStorage();
    const registry = await loadRegistry(storage);
    if (registry[idName]) {
      registry[idName].lastActive = Date.now();
      await saveRegistry(storage, registry);
    }

    return { response: reply };
  },
});

// ============================================================================
// Research Agent Tools (for ResearchAgent)
// ============================================================================

export const write_file = tool({
  description: 'Write content to a file in the agent workspace',
  inputSchema: z.object({
    path: z.string().describe('Relative path within agent workspace'),
    content: z.string().describe('Text content to write'),
  }),
  execute: async ({ path, content }) => {
    const { agent } = getCurrentAgent<ResearchAgent>();
    if (!agent) throw new Error('Agent context not available');

    await agent.ensureFs().writeFile(path, content, {
      author: agent.state?.name || 'research-agent',
    });
    
    return { ok: true };
  },
});

export const read_file = tool({
  description: 'Read content from a file in the agent workspace',
  inputSchema: z.object({
    path: z.string().describe('Relative path within agent workspace'),
  }),
  execute: async ({ path }) => {
    const { agent } = getCurrentAgent<ResearchAgent>();
    if (!agent) throw new Error('Agent context not available');

    const text = await agent.ensureFs().readFile(path);
    
    if (text === null) {
      throw new Error(`File not found: ${path}`);
    }
    
    return { content: text };
  },
});

export const list_files = tool({
  description: 'List files in a directory of the agent workspace',
  inputSchema: z.object({
    dir: z.string().optional().describe('Relative directory within agent workspace'),
  }),
  execute: async ({ dir }) => {
    const { agent } = getCurrentAgent<ResearchAgent>();
    if (!agent) throw new Error('Agent context not available');

    const files = await agent.ensureFs().listFiles(dir);
    return { files };
  },
});

export const message_to_interaction_agent = tool({
  description: 'Send a status update back to the InteractionAgent',
  inputSchema: z.object({
    message: z.string().describe('Status or summary to report back'),
  }),
  execute: async ({ message }) => {
    const { agent } = getCurrentAgent<ResearchAgent>();
    if (!agent) throw new Error('Agent context not available');

    await agent.bestEffortRelay(message);
    return { ok: true };
  },
});

// ============================================================================
// Exported Tool Collections
// ============================================================================

export const agentManagementTools = {
  create_agent,
  list_agents,
  message_to_research_agent,
} satisfies ToolSet;

export const researchTools = {
  write_file,
  read_file,
  list_files,
  message_to_interaction_agent,
} satisfies ToolSet;

// Tool executions for approval workflow (currently unused - reserved for future tool gating feature)
// When implemented, this will allow tools to require user approval before execution
export const toolExecutions: ExecutionsMap = {};
