export const TOOL_SCHEMAS = {
  create_agent: {
    name: 'create_agent',
    description: 'Create a new research agent for a specific domain',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Agent name (e.g., 'duchenne_md_research')" },
        description: { type: 'string', description: 'What this agent researches' },
        message: { type: 'string', description: 'Initial research task' },
      },
      required: ['name', 'description', 'message'],
    },
  },
  list_agents: {
    name: 'list_agents',
    description: 'List all known research agents',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  message_agent: {
    name: 'message_agent',
    description: 'Send a message to a specific research agent',
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The ID (sanitized name) of the agent' },
        message: { type: 'string', description: 'Message to send' },
      },
      required: ['agent_id', 'message'],
    },
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to a file in the agent workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path within agent workspace' },
        content: { type: 'string', description: 'Text content to write' },
      },
      required: ['path', 'content'],
    },
  },
  read_file: {
    name: 'read_file',
    description: 'Read content from a file in the agent workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path within agent workspace' },
      },
      required: ['path'],
    },
  },
  list_files: {
    name: 'list_files',
    description: 'List files in a directory of the agent workspace',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Relative directory within agent workspace' },
      },
    },
  },
  send_message: {
    name: 'send_message',
    description: 'Send a status update back to the InteractionAgent',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Status or summary to report back' },
      },
      required: ['message'],
    },
  },
};

// Builder-based tools (Agents/AI SDK style)
// These factories return tool definitions with Zod schemas and execute handlers.
// They enable auto-execution via the AI SDK tools interface.

import { z } from 'zod';
import type { Env } from '../types';
import { createAgentManagementTools } from './agent_management';
import { VirtualFs } from './file_system';

export type AiSdkToolDef = {
  description: string;
  parameters: any; // Zod schema
  execute: (args: any) => Promise<any>;
};

export function getInteractionTools(env: Env, storage: any): Record<string, AiSdkToolDef> {
  const mgr = createAgentManagementTools(env, storage);
  return {
    create_agent: {
      description: 'Create a new research agent for a specific domain',
      parameters: z.object({
        name: z.string(),
        description: z.string(),
        message: z.string(),
      }),
      execute: async ({ name, description, message }: { name: string; description: string; message: string }) => {
        return mgr.create_agent(name, description, message);
      },
    },
    list_agents: {
      description: 'List all known research agents',
      parameters: z.object({}),
      execute: async () => mgr.list_agents(),
    },
    message_agent: {
      description: 'Send a message to a specific research agent',
      parameters: z.object({
        agent_id: z.string(),
        message: z.string(),
      }),
      execute: async ({ agent_id, message }: { agent_id: string; message: string }) => mgr.message_agent(agent_id, message),
    },
  };
}

export function getResearchTools(
  ensureFs: () => VirtualFs,
  bestEffortRelay: (message: string) => Promise<void>,
): Record<string, AiSdkToolDef> {
  return {
    write_file: {
      description: 'Write content to a file in the agent workspace',
      parameters: z.object({
        path: z.string(),
        content: z.string(),
      }),
      execute: async ({ path, content }: { path: string; content: string }) => {
        await ensureFs().writeFile(path, content, { author: 'research-agent' });
        return { ok: true };
      },
    },
    read_file: {
      description: 'Read content from a file in the agent workspace',
      parameters: z.object({
        path: z.string(),
      }),
      execute: async ({ path }: { path: string }) => {
        const text = await ensureFs().readFile(path);
        return { content: text };
      },
    },
    list_files: {
      description: 'List files in a directory of the agent workspace',
      parameters: z.object({
        dir: z.string().optional(),
      }),
      execute: async ({ dir }: { dir?: string }) => {
        const files = await ensureFs().listFiles(dir);
        return { files };
      },
    },
    send_message: {
      description: 'Send a status update back to the InteractionAgent',
      parameters: z.object({
        message: z.string(),
      }),
      execute: async ({ message }: { message: string }) => {
        await bestEffortRelay(message);
        return { ok: true };
      },
    },
  };
}