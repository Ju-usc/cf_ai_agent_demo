import { Agent } from 'agents';
import { createWorkersAI } from 'workers-ai-provider';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import type { Env, Message } from '../types';
import { createAgentManagementTools } from '../tools/agent_management';

type InteractionState = {
  messages: Message[];
};

export class InteractionAgent extends Agent<Env, InteractionState> {
  initialState: InteractionState = { messages: [] };

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

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

  private getMessages(): Message[] {
    return this.state?.messages ?? this.initialState.messages;
  }

  private setMessages(nextMessages: Message[]) {
    this.setState({ messages: nextMessages });
  }

  private async handleChat(request: Request): Promise<Response> {
    const { message } = await request.json<{ message: string }>();
    this.setMessages([...this.getMessages(), { role: 'user', content: message }]);

    try {
      const workersai = createWorkersAI({ binding: this.env.AI });
      const model = workersai.chat('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any);
      const agentMgr = createAgentManagementTools(this.env, this.ctx.storage);

      const tools = {
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

      const messages = [
        { role: 'system', content: systemPrompt },
        ...this.getMessages(),
      ];

      const result = await generateText({
        model,
        messages: messages as any,
        tools,
      });

      const assistantMessage = result.text || 'Okay.';
      this.setMessages([...this.getMessages(), { role: 'assistant', content: assistantMessage }]);

      return Response.json({ message: assistantMessage });
    } catch (error: any) {
      console.error('InteractionAgent handleChat error:', error);
      const errorMessage = 'Sorry, I encountered an error processing your request.';
      this.setMessages([...this.getMessages(), { role: 'assistant', content: errorMessage }]);
      return Response.json({ message: errorMessage, error: error.message }, { status: 500 });
    }
  }

  private async getHistory(): Promise<Response> {
    return Response.json({ messages: this.getMessages() });
  }

  private async handleRelay(request: Request): Promise<Response> {
    const { agent_id, message } = await request.json<{ agent_id: string; message: string }>();
    this.setMessages([
      ...this.getMessages(),
      {
        role: 'user',
        content: `Agent ${agent_id} reports: ${message}`,
      },
    ]);
    return Response.json({ ok: true });
  }
}
