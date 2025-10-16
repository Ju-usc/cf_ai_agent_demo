import { AIChatAgent } from 'agents/ai-chat-agent';
import { streamText, convertToModelMessages, type StreamTextOnFinishCallback, type ToolSet } from 'ai';
import type { Env } from '../types';
import { agentManagementTools } from '../tools/tools';
import { createChatModel } from './modelFactory';

export class InteractionAgent extends AIChatAgent<Env> {
  // Public helper methods for tools to access protected properties
  getEnv(): Env {
    return this.env;
  }

  getStorage(): DurableObjectState['storage'] {
    return this.ctx.storage;
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ): Promise<Response | undefined> {
    const model = createChatModel(this.env);

    const systemPrompt =
      'You are the Interaction Agent for a medical innovation research system. ' +
      'You can manage research agents via tools. Prefer creating a specialized ResearchAgent when asked to research.';

    const result = await streamText({
      model,
      system: systemPrompt,
      messages: convertToModelMessages(this.messages),
      tools: agentManagementTools,
      onFinish: onFinish as any,
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
    // This is used when ResearchAgent sends async updates (e.g., from triggers or progress updates)
    this.messages.push({
      role: 'user',
      content: `Agent ${agent_id} reports: ${message}`,
    } as any);
    
    // AIChatAgent base class handles persistence automatically
    // But we'll keep explicit save for now to ensure relay messages persist
    await this.saveMessages(this.messages);
    
    return Response.json({ ok: true });
  }
}
