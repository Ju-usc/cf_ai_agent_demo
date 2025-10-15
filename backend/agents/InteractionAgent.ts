import { AIChatAgent } from 'agents/ai-chat-agent';
import { streamText, tool, type StreamTextOnFinishCallback, type ToolSet } from 'ai';
import { z } from 'zod';
import type { Env } from '../types';
import { createAgentManagementTools } from '../tools/agent_management';
import { createChatModel } from './modelFactory';

export class InteractionAgent extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ): Promise<Response | undefined> {
    const model = createChatModel(this.env);
    const agentMgr = createAgentManagementTools(this.env, this.ctx.storage);

    const tools: ToolSet = {
      create_agent: tool({
        description: 'Create a new research agent for a specific domain',
        inputSchema: z.object({
          name: z.string().describe('Agent name (e.g., duchenne_md_research)'),
          description: z.string().describe('What this agent researches'),
          message: z.string().describe('Initial research task'),
        }),
        execute: async ({ name, description, message }: { name: string; description: string; message: string }) => {
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
        execute: async ({ agent_id, message }: { agent_id: string; message: string }) => {
          return agentMgr.message_agent(agent_id, message);
        },
      }),
    };

    const systemPrompt =
      'You are the Interaction Agent for a medical innovation research system. ' +
      'You can manage research agents via tools. Prefer creating a specialized ResearchAgent when asked to research.';

    const result = await streamText({
      model,
      system: systemPrompt,
      messages: this.messages as any,
      tools,
      onFinish,
    });

    return result.toTextStreamResponse();
  }

  // Keep relay endpoint for ResearchAgent callbacks
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/relay') {
      return this.handleRelay(request);
    }
    
    // Delegate all other requests to AIChatAgent's built-in routing
    return super.onRequest(request);
  }

  private async handleRelay(request: Request): Promise<Response> {
    const { agent_id, message } = await request.json<{ agent_id: string; message: string }>();
    
    // Add relay message to conversation
    this.messages.push({
      role: 'user',
      content: `Agent ${agent_id} reports: ${message}`,
    } as any);
    
    await this.saveMessages(this.messages);
    
    return Response.json({ ok: true });
  }
}
