/**
 * Tool definitions for agents
 * 
 * Following Cloudflare agents-starter pattern:
 * - Tools defined in separate file for clarity
 * - Imported and initialized in agents
 * - Execute functions wired up per-agent with dependencies
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * InteractionAgent tools - agent management
 */
export const interactionTools = {
  create_agent: tool({
    description: 'Create a new research agent for a specific domain',
    inputSchema: z.object({
      name: z.string().describe('Agent name (e.g., duchenne_md_research)'),
      description: z.string().describe('What this agent researches'),
      message: z.string().describe('Initial research task'),
    }),
    // Execute wired up in agent
  }),

  list_agents: tool({
    description: 'List all known research agents',
    inputSchema: z.object({}),
    // Execute wired up in agent
  }),

  message_agent: tool({
    description: 'Send a message to a specific research agent',
    inputSchema: z.object({
      agent_id: z.string().describe('The ID of the agent'),
      message: z.string().describe('Message to send'),
    }),
    // Execute wired up in agent
  }),
};

/**
 * ResearchAgent tools - file operations and relay
 */
export const researchTools = {
  write_file: tool({
    description: 'Write content to a file in the agent workspace',
    inputSchema: z.object({
      path: z.string().describe('Relative path within agent workspace'),
      content: z.string().describe('Text content to write'),
    }),
    // Execute wired up in agent
  }),

  read_file: tool({
    description: 'Read content from a file in the agent workspace',
    inputSchema: z.object({
      path: z.string().describe('Relative path within agent workspace'),
    }),
    // Execute wired up in agent
  }),

  list_files: tool({
    description: 'List files in a directory of the agent workspace',
    inputSchema: z.object({
      dir: z.string().optional().describe('Relative directory within agent workspace'),
    }),
    // Execute wired up in agent
  }),

  send_message: tool({
    description: 'Send a status update back to the InteractionAgent',
    inputSchema: z.object({
      message: z.string().describe('Status or summary to report back'),
    }),
    // Execute wired up in agent
  }),
};

