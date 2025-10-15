/**
 * Unified tool definitions
 * 
 * Following Cloudflare agents-starter pattern:
 * - All tools defined in one place (single source of truth)
 * - Agents import only the tools they need
 * - Execute functions wired up per-agent with dependencies
 * - No duplication if tools overlap between agents
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * All available tools - agents can selectively import what they need
 */
export const tools = {
  // Agent management tools
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

  // File system tools
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

  // Communication tools
  send_message: tool({
    description: 'Send a status update back to the InteractionAgent',
    inputSchema: z.object({
      message: z.string().describe('Status or summary to report back'),
    }),
    // Execute wired up in agent
  }),
};

