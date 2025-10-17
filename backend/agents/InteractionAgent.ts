import { AIChatAgent } from 'agents/ai-chat-agent';
import {
  streamText,
  convertToModelMessages,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from 'ai';
import type { AgentRegistryEntry, Env } from '../types';
import { agentManagementTools } from '../tools/tools';
import { createChatModel } from './modelFactory';
import { cleanupMessages } from '../utils/toolProcessing';

export class InteractionAgent extends AIChatAgent<Env> {
  // Public helper methods for tools to access protected properties
  getEnv(): Env {
    return this.env;
  }

  getStorage(): DurableObjectState['storage'] {
    return this.ctx.storage;
  }

  // Override onRequest to handle chat requests properly
  async onRequest(request: Request): Promise<Response> {
    console.log('[InteractionAgent] 📨 onRequest called');
    const url = new URL(request.url);
    console.log('[InteractionAgent] URL:', url.pathname);
    console.log('[InteractionAgent] Method:', request.method);

    // Handle GET /get-messages (AIChatAgent pattern)
    if (url.pathname.endsWith('/get-messages')) {
      console.log('[InteractionAgent] Handling /get-messages, delegating to parent');
      return super.onRequest(request);
    }

    // Handle POST for chat messages
    if (request.method === 'POST') {
      console.log('[InteractionAgent] POST request detected');
      try {
        const bodyText = await request.text();
        console.log('[InteractionAgent] Raw body:', bodyText);

        const body = JSON.parse(bodyText) as { messages?: any[] };
        console.log('[InteractionAgent] Parsed body:', body);

        if (body.messages && Array.isArray(body.messages)) {
          console.log('[InteractionAgent] 💬 Valid messages array found:', body.messages.length, 'messages');
          console.log('[InteractionAgent] Messages:', JSON.stringify(body.messages, null, 2));

          // This is a chat request - update internal messages and trigger onChatMessage
          console.log('[InteractionAgent] 💾 Persisting messages...');
          await this.persistMessages(body.messages);
          console.log('[InteractionAgent] ✅ Messages persisted');

          console.log('[InteractionAgent] 🤖 Calling onChatMessage...');
          const response = await this.onChatMessage(() => {}, { abortSignal: undefined });

          if (!response) {
            console.error('[InteractionAgent] ❌ onChatMessage returned null/undefined');
            return new Response('No response', { status: 500 });
          }

          console.log('[InteractionAgent] ✅ onChatMessage completed, returning response');
          console.log('[InteractionAgent] Response status:', response.status);
          console.log('[InteractionAgent] Response headers:', Object.fromEntries(response.headers.entries()));
          return response;
        } else {
          console.error('[InteractionAgent] ❌ Invalid body - no messages array');
        }
      } catch (e) {
        console.error('[InteractionAgent] ❌ Error parsing chat request:', e);
        console.error('[InteractionAgent] Error stack:', (e as Error).stack);
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Fall back to parent for other requests
    console.log('[InteractionAgent] No handler matched, delegating to parent');
    return super.onRequest(request);
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ): Promise<Response | undefined> {
    console.log('[InteractionAgent.onChatMessage] 🎬 Starting');
    console.log('[InteractionAgent.onChatMessage] Messages count:', this.messages.length);
    console.log('[InteractionAgent.onChatMessage] Latest messages:', JSON.stringify(this.messages.slice(-3), null, 2));

    const model = createChatModel(this.env);
    console.log('[InteractionAgent.onChatMessage] ✅ Model created');

    const systemPrompt =
      'You are the Interaction Agent for a medical innovation research system. ' +
      'You are helpful and conversational. ' +
      '\n\nIMPORTANT: Tools are NOT required for every message. ' +
      'For casual greetings (hi, hello, how are you), general questions, or small talk, just respond naturally WITHOUT using any tools. ' +
      '\n\nONLY use tools when:' +
      '\n- User explicitly asks to research a specific medical topic (e.g., "research Duchenne MD treatments")' +
      '\n- User asks to create, list, or manage research agents' +
      '\n\nIf the query is not about research or agent management, respond directly without tools.';

    console.log('[InteractionAgent.onChatMessage] 🧹 Cleaning messages...');
    const cleanedMessages = cleanupMessages(this.messages);
    console.log('[InteractionAgent.onChatMessage] Cleaned messages count:', cleanedMessages.length);

    console.log('[InteractionAgent.onChatMessage] 🤖 Calling streamText (simplified)...');
    const result = streamText({
      model,
      system: systemPrompt,
      messages: convertToModelMessages(cleanedMessages),
      tools: agentManagementTools,
      onFinish: onFinish as unknown as StreamTextOnFinishCallback<typeof agentManagementTools>,
    });
    console.log('[InteractionAgent.onChatMessage] ✅ streamText created');

    console.log('[InteractionAgent.onChatMessage] 📡 Creating UI Message Stream response...');
    const response = result.toUIMessageStreamResponse();
    console.log('[InteractionAgent.onChatMessage] ✅ UI Message Stream response created');
    console.log('[InteractionAgent.onChatMessage] Response headers:', Object.fromEntries(response.headers.entries()));

    return response;
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
