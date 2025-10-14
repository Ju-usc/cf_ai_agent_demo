import { DurableObject } from 'cloudflare:workers';
import type { Env, Message } from '../types';

export class ResearchAgent extends DurableObject<Env> {
  private messages: Message[] = [];
  private name: string = '';
  private description: string = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/init':
        return this.initialize(request);
      case '/message':
        return this.handleMessage(request);
      case '/info':
        return this.getInfo();
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async initialize(request: Request): Promise<Response> {
    const { name, description, message } = await request.json<{
      name: string;
      description: string;
      message: string;
    }>();

    this.name = name;
    this.description = description;
    
    this.messages.push({
      role: 'system',
      content: `You are a specialized medical research agent for: ${description}`,
    });
    
    this.messages.push({
      role: 'user',
      content: message,
    });

    return Response.json({ success: true });
  }

  private async handleMessage(request: Request): Promise<Response> {
    const { message } = await request.json<{ message: string }>();
    
    this.messages.push({
      role: 'user',
      content: message,
    });

    // Simple LLM call (will expand with tools later)
    const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: this.messages,
    });

    const assistantMessage = response.response as string;
    
    this.messages.push({
      role: 'assistant',
      content: assistantMessage,
    });

    return Response.json({ message: assistantMessage });
  }

  private async getInfo(): Promise<Response> {
    return Response.json({
      name: this.name,
      description: this.description,
      messageCount: this.messages.length,
    });
  }
}

