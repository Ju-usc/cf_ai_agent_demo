import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { Env } from '../types';
import type { VirtualFs } from './file_system';
import { createAgentManagementTools } from './agent_management';

/**
 * Creates tools for InteractionAgent
 */
export function createInteractionTools(env: Env, storage: DurableObjectState['storage']): ToolSet {
  const agentMgr = createAgentManagementTools(env, storage);

  return {
    create_agent: tool({
      description: 'Create a new research agent for a specific domain',
      inputSchema: z.object({
        name: z.string().describe('Agent name (e.g., duchenne_md_research)'),
        description: z.string().describe('What this agent researches'),
        message: z.string().describe('Initial research task'),
      }),
      execute: async ({ name, description, message }) => {
        return agentMgr.create_agent(name, description, message);
      },
    }),

    list_agents: tool({
      description: 'List all known research agents',
      inputSchema: z.object({}),
      execute: async () => {
        return agentMgr.list_agents();
      },
    }),

    message_agent: tool({
      description: 'Send a message to a specific research agent',
      inputSchema: z.object({
        agent_id: z.string().describe('The ID of the agent'),
        message: z.string().describe('Message to send'),
      }),
      execute: async ({ agent_id, message }) => {
        return agentMgr.message_agent(agent_id, message);
      },
    }),
  };
}

/**
 * Creates tools for ResearchAgent
 */
export function createResearchTools(
  fs: VirtualFs,
  agentName: string,
  relayCallback: (message: string) => Promise<void>
): ToolSet {
  return {
    write_file: tool({
      description: 'Write content to a file in the agent workspace',
      inputSchema: z.object({
        path: z.string().describe('Relative path within agent workspace'),
        content: z.string().describe('Text content to write'),
      }),
      execute: async ({ path, content }) => {
        await fs.writeFile(path, content, { author: agentName });
        return { ok: true };
      },
    }),

    read_file: tool({
      description: 'Read content from a file in the agent workspace',
      inputSchema: z.object({
        path: z.string().describe('Relative path within agent workspace'),
      }),
      execute: async ({ path }) => {
        const text = await fs.readFile(path);
        return { content: text };
      },
    }),

    list_files: tool({
      description: 'List files in a directory of the agent workspace',
      inputSchema: z.object({
        dir: z.string().optional().describe('Relative directory within agent workspace'),
      }),
      execute: async ({ dir }) => {
        const files = await fs.listFiles(dir);
        return { files };
      },
    }),

    send_message: tool({
      description: 'Send a status update back to the InteractionAgent',
      inputSchema: z.object({
        message: z.string().describe('Status or summary to report back'),
      }),
      execute: async ({ message }) => {
        await relayCallback(message);
        return { ok: true };
      },
    }),
  };
}

