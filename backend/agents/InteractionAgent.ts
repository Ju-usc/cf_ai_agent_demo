import { DurableObject } from 'cloudflare:workers';
// @ts-expect-error External provider types provided at runtime
import { createWorkersAI } from 'workers-ai-provider';
// @ts-expect-error Using generic AI SDK types
import { generateText, tool } from 'ai';
import { z } from 'zod';
import type { Env, Message } from '../types';
import { createAgentManagementTools } from '../tools/agent_management';

export class InteractionAgent extends DurableObject<Env> {
  private messages: Message[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle different endpoints
    switch (url.pathname) {
      case '/chat':
        return this.handleChat(request);
      case '/history':
        return this.getHistory();
      case '/relay':
        return this.handleRelay(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleChat(request: Request): Promise<Response> {
    const { message } = await request.json<{ message: string }>();
    this.messages.push({ role: 'user', content: message });

    try {
      // Initialize Workers AI provider
      const workersai = createWorkersAI({ binding: this.env.AI });
      const model = workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast');

      // Get agent management implementation
      const agentMgr = createAgentManagementTools(this.env, this.ctx.storage);

      // Define tools explicitly for visibility and readability
      const tools = {
        create_agent: tool({
          description: 'Create a new research agent for a specific domain',
          parameters: z.object({
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
          parameters: z.object({}),
          execute: async () => {
            return agentMgr.list_agents();
          },
        }),
        
        message_agent: tool({
          description: 'Send a message to a specific research agent',
          parameters: z.object({
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

      // Generate response with tool execution
      const result = await generateText({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.messages,
        ],
        tools,
      });

      const assistantMessage = result.text || 'Okay.';
      this.messages.push({ role: 'assistant', content: assistantMessage });
      
      return Response.json({ message: assistantMessage });
    } catch (error: any) {
      console.error('InteractionAgent handleChat error:', error);
      const errorMessage = 'Sorry, I encountered an error processing your request.';
      this.messages.push({ role: 'assistant', content: errorMessage });
      return Response.json({ message: errorMessage, error: error.message }, { status: 500 });
    }
  }

  private async getHistory(): Promise<Response> {
    return Response.json({ messages: this.messages });
  }

  private async handleRelay(request: Request): Promise<Response> {
    const { agent_id, message } = await request.json<{ agent_id: string; message: string }>();
    this.messages.push({
      role: 'user',
      content: `Agent ${agent_id} reports: ${message}`,
    });
    return Response.json({ ok: true });
  }

  // Tool parsing and manual execution removed in favor of AI SDK tools auto-execution
}

