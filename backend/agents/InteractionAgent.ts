import { AIChatAgent } from 'agents/ai-chat-agent';
import { streamText, type StreamTextOnFinishCallback, type ToolSet } from 'ai';
import type { Env } from '../types';
import { createInteractionTools } from '../tools/tools';
import { createChatModel } from './modelFactory';

export class InteractionAgent extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ): Promise<Response | undefined> {
    const model = createChatModel(this.env);
    const tools = createInteractionTools(this.env, this.ctx.storage);

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
