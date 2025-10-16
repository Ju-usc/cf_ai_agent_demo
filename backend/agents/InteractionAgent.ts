import { AIChatAgent } from 'agents/ai-chat-agent';
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from 'ai';
import type { AgentRegistryEntry, Env } from '../types';
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

  async getAgents(): Promise<AgentRegistryEntry[]> {
    const registry = await this.ctx.storage.get<Record<string, AgentRegistryEntry>>(
      'agent_registry',
    );

    if (!registry) {
      return [];
    }

    return Object.values(registry).map(({ id, name, description, createdAt, lastActive }) => ({
      id,
      name,
      description,
      createdAt,
      lastActive,
    }));
  }

  // All ResearchAgent communication now via JSRPC
  // No custom HTTP handlers needed - AIChatAgent handles all user-facing routes via SDK

  // JSRPC method for relay
  async relay(agentId: string, message: string): Promise<void> {
    const relayMessage = {
      role: 'user',
      content: `Agent ${agentId} reports: ${message}`,
    } as any;

    await this.persistMessages([...this.messages, relayMessage]);
  }
}
