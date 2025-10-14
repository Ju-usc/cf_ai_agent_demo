import { DurableObject } from 'cloudflare:workers';
import type { Env, Message, ToolCall } from '../types';
import { createAgentManagementTools } from '../tools/agent_management';
import { TOOL_SCHEMAS } from '../tools/schemas';

export class InteractionAgent extends DurableObject<Env> {
  private messages: Message[] = [];
  private agentTools = createAgentManagementTools(this.env, this.ctx.storage);

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

    // First call with tool schemas for agent management
    const aiResponse: any = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content:
            'You are the Interaction Agent for a medical innovation research system. You can manage research agents via tools. Prefer creating a specialized ResearchAgent when asked to research.',
        },
        ...this.messages,
      ],
      tools: [
        TOOL_SCHEMAS.create_agent,
        TOOL_SCHEMAS.list_agents,
        TOOL_SCHEMAS.message_agent,
      ],
    });

    const toolCalls = this.extractToolCalls(aiResponse);

    if (toolCalls.length > 0) {
      const results: Array<{ tool: string; result: any; error?: string }> = [];
      for (const call of toolCalls) {
        try {
          const result = await this.executeTool(call);
          results.push({ tool: call.tool, result });
        } catch (error: any) {
          results.push({ tool: call.tool, result: null, error: String(error?.message || error) });
        }
      }

      // Feed tool results back to the model to produce a user-facing message
      const followUp: any = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          {
            role: 'system',
            content:
              'You have executed tools. Summarize the result for the user succinctly and clearly.',
          },
          ...this.messages,
          {
            role: 'system',
            content: `Tool execution results: ${JSON.stringify(results)}`,
          },
        ],
      });

      const assistantMessage = (followUp.response as string) ?? 'Done.';
      this.messages.push({ role: 'assistant', content: assistantMessage });
      return Response.json({ message: assistantMessage, tool_results: results });
    }

    // No tool calls, return the model's direct response
    const assistantMessage = (aiResponse.response as string) ?? 'Okay.';
    this.messages.push({ role: 'assistant', content: assistantMessage });
    return Response.json({ message: assistantMessage });
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

  private extractToolCalls(aiResponse: any): ToolCall[] {
    const calls: ToolCall[] = [];
    const raw = aiResponse?.tool_calls ?? aiResponse?.tools ?? [];
    if (Array.isArray(raw)) {
      for (const item of raw) {
        // Support multiple shapes: { tool, args } or { name, arguments } or { function: { name, arguments } }
        const tool = item.tool || item.name || item.function?.name;
        let args = item.args ?? item.arguments ?? item.function?.arguments;
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { /* ignore */ }
        }
        if (tool && args && typeof args === 'object') {
          calls.push({ tool, args });
        }
      }
    }

    // Fallback: try to parse JSON from text response
    if (calls.length === 0 && typeof aiResponse?.response === 'string') {
      const text = aiResponse.response as string;
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          const arr = parsed.tool_calls ?? parsed.tools ?? [];
          if (Array.isArray(arr)) {
            for (const item of arr) {
              const tool = item.tool || item.name;
              const args = item.args || item.arguments;
              if (tool && args) calls.push({ tool, args });
            }
          }
        } catch { /* ignore */ }
      }
    }

    return calls;
  }

  private async executeTool(call: ToolCall): Promise<any> {
    const { tool, args } = call;
    if (tool === 'create_agent') {
      const { name, description, message } = args as { name: string; description: string; message: string };
      return this.agentTools.create_agent(name, description, message);
    }
    if (tool === 'list_agents') {
      return this.agentTools.list_agents();
    }
    if (tool === 'message_agent') {
      const { agent_id, message } = args as { agent_id: string; message: string };
      return this.agentTools.message_agent(agent_id, message);
    }
    throw new Error(`Unknown tool: ${tool}`);
  }
}

