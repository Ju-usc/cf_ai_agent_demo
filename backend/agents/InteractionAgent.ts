import { AIChatAgent } from 'agents/ai-chat-agent';
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from 'ai';
import type { Env } from '../types';
import { agentManagementTools, toolExecutions } from '../tools/tools';
import { createChatModel } from './modelFactory';
import { cleanupMessages, processToolCalls } from '../utils/toolProcessing';

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

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleanedMessages = cleanupMessages(this.messages);
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: agentManagementTools,
          executions: toolExecutions,
        });

        const result = streamText({
          model,
          system: systemPrompt,
          messages: convertToModelMessages(processedMessages),
          tools: agentManagementTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<typeof agentManagementTools>,
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  // All ResearchAgent communication now via JSRPC
  // No custom HTTP handlers needed - AIChatAgent handles all user-facing routes
  
  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname.endsWith('/message')) {
      try {
        const payload = await request.json();
        const text = typeof payload?.message === 'string' ? payload.message.trim() : '';

        if (!text) {
          return Response.json({ error: 'Message is required' }, { status: 400 });
        }

        const userMessage: UIMessage = {
          id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          role: 'user',
          parts: [{ type: 'text', text }],
        } as UIMessage;

        await this.persistMessages([...(this.messages ?? []), userMessage]);

        const response = await this.onChatMessage(() => {});
        if (response) {
          return response;
        }

        return Response.json({ error: 'No response generated' }, { status: 500 });
      } catch (error) {
        if (error instanceof SyntaxError) {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        console.error('InteractionAgent HTTP message error:', error);
        return Response.json({ error: 'Failed to process message' }, { status: 500 });
      }
    }

    return super.onRequest(request);
  }

  // JSRPC method for relay
  async relay(agentId: string, message: string): Promise<void> {
    const relayMessage = {
      role: 'user',
      content: `Agent ${agentId} reports: ${message}`,
    } as any;

    await this.persistMessages([...this.messages, relayMessage]);
  }
}
