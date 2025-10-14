import { DurableObject } from 'cloudflare:workers';
import type { Env, Message } from '../types';

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
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleChat(request: Request): Promise<Response> {
    const { message } = await request.json<{ message: string }>();
    
    // Add user message
    this.messages.push({
      role: 'user',
      content: message,
    });

    // Simple LLM call (will expand with tools later)
    const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content: 'You are the Interaction Agent for a medical innovation research system.',
        },
        ...this.messages,
      ],
    });

    const assistantMessage = response.response as string;
    
    this.messages.push({
      role: 'assistant',
      content: assistantMessage,
    });

    return Response.json({ 
      message: assistantMessage,
    });
  }

  private async getHistory(): Promise<Response> {
    return Response.json({ messages: this.messages });
  }
}

