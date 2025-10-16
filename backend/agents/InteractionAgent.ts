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

  // All ResearchAgent communication now via JSRPC
  // No custom HTTP handlers needed - AIChatAgent handles all user-facing routes
  
  // JSRPC method for relay
  async relay(agentId: string, message: string): Promise<void> {
    // Add relay message to conversation
    // This is used when ResearchAgent sends async updates (e.g., from triggers or progress updates)
    this.messages.push({
      role: 'user',
      content: `Agent ${agentId} reports: ${message}`,
    } as any);
    
    // AIChatAgent base class handles persistence automatically
    // But we'll keep explicit save for now to ensure relay messages persist
    await this.saveMessages(this.messages);
  }
}
