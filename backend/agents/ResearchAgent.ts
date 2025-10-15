import { Agent } from 'agents';
import { createWorkersAI } from 'workers-ai-provider';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import type { Env, Message } from '../types';
import { VirtualFs } from '../tools/file_system';

type ResearchState = {
  messages: Message[];
  name: string;
  description: string;
};

export class ResearchAgent extends Agent<Env, ResearchState> {
  private fs: VirtualFs | null = null;
  initialState: ResearchState = { messages: [], name: '', description: '' };

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/init':
        return this.initialize(request);
      case '/message':
        return this.handleMessage(request);
      case '/info':
        return this.getInfo();
      case '/write_file':
        return this.writeFile(request);
      case '/read_file':
        return this.readFile(request);
      case '/list_files':
        return this.listFiles(request);
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

    this.setState({ ...this.state, name, description });
    // Use standardized path as per architecture docs
    this.fs = new VirtualFs(this.env.R2, `memory/research_agents/${name}/`);
    
    const systemPrimedMessages: Message[] = [...(this.state?.messages ?? []), {
      role: 'system',
      content: `You are a specialized medical research agent for: ${description}`,
    }];
    
    const primedMessages: Message[] = [...systemPrimedMessages, {
      role: 'user',
      content: message,
    }];

    this.setState({ ...this.state, messages: primedMessages });

    return Response.json({ success: true });
  }

  private async handleMessage(request: Request): Promise<Response> {
    const { message } = await request.json<{ message: string }>();
    this.setState({ ...this.state, messages: [...(this.state?.messages ?? []), { role: 'user', content: message }] });

    try {
      // Initialize Workers AI provider
      const workersai = createWorkersAI({ binding: this.env.AI });
      const model = workersai.chat('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any);

      // Define tools explicitly for visibility and readability
      const tools = {
        write_file: tool({
          description: 'Write content to a file in the agent workspace',
          inputSchema: z.object({
            path: z.string().describe('Relative path within agent workspace'),
            content: z.string().describe('Text content to write'),
          }),
          execute: async ({ path, content }: { path: string; content: string }) => {
            await this.ensureFs().writeFile(path, content, { author: this.name || 'research-agent' });
            return { ok: true };
          },
        }),
        
        read_file: tool({
          description: 'Read content from a file in the agent workspace',
          inputSchema: z.object({
            path: z.string().describe('Relative path within agent workspace'),
          }),
          execute: async ({ path }: { path: string }) => {
            const text = await this.ensureFs().readFile(path);
            return { content: text };
          },
        }),
        
        list_files: tool({
          description: 'List files in a directory of the agent workspace',
          inputSchema: z.object({
            dir: z.string().optional().describe('Relative directory within agent workspace'),
          }),
          execute: async ({ dir }: { dir?: string }) => {
            const files = await this.ensureFs().listFiles(dir);
            return { files };
          },
        }),
        
        send_message: tool({
          description: 'Send a status update back to the InteractionAgent',
          inputSchema: z.object({
            message: z.string().describe('Status or summary to report back'),
          }),
          execute: async ({ message }: { message: string }) => {
            await this.bestEffortRelay(message);
            return { ok: true };
          },
        }),
      };

      const systemPrompt = 
        'You are a specialized ResearchAgent. You can read/write files and report back to the InteractionAgent.';

      // Generate response with tool execution
      const result = await generateText({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...(this.state?.messages ?? []),
        ] as any,
        tools,
      });

      const assistantMessage = result.text || 'Okay.';
      this.setState({ ...this.state, messages: [...(this.state?.messages ?? []), { role: 'assistant', content: assistantMessage }] });
      
      // Relay message back to InteractionAgent
      await this.bestEffortRelay(assistantMessage);
      
      return Response.json({ message: assistantMessage });
    } catch (error: any) {
      console.error('ResearchAgent handleMessage error:', error);
      const errorMessage = 'Error processing research request.';
      this.setState({ ...this.state, messages: [...(this.state?.messages ?? []), { role: 'assistant', content: errorMessage }] });
      return Response.json({ message: errorMessage, error: error.message }, { status: 500 });
    }
  }

  private async getInfo(): Promise<Response> {
    return Response.json({
      name: this.state?.name ?? '',
      description: this.state?.description ?? '',
      messageCount: (this.state?.messages ?? []).length,
    });
  }

  private ensureFs(): VirtualFs {
    if (!this.fs) {
      // Use standardized path as per architecture docs
      const name = this.state?.name || 'unnamed';
      this.fs = new VirtualFs(this.env.R2, `memory/research_agents/${name}/`);
    }
    return this.fs;
  }

  private async writeFile(request: Request): Promise<Response> {
    const { path, content } = await request.json<{ path: string; content: string }>();
    const fs = this.ensureFs();
    await fs.writeFile(path, content, { author: this.state?.name || 'research-agent' });
    return Response.json({ ok: true });
  }

  private async readFile(request: Request): Promise<Response> {
    const { path } = await request.json<{ path: string }>();
    const fs = this.ensureFs();
    const text = await fs.readFile(path);
    if (text == null) return new Response('Not found', { status: 404 });
    return Response.json({ content: text });
  }

  private async listFiles(request: Request): Promise<Response> {
    const { dir } = await request.json<{ dir?: string }>();
    const fs = this.ensureFs();
    const files = await fs.listFiles(dir);
    return Response.json({ files });
  }

  // Tool parsing and manual execution removed in favor of AI SDK tools auto-execution

  private async bestEffortRelay(message: string): Promise<void> {
    try {
      const iaId = this.env.INTERACTION_AGENT.idFromName('default');
      const ia = this.env.INTERACTION_AGENT.get(iaId);
      await ia.fetch(new Request('https://interaction-agent/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: this.state?.name, message }),
      }));
    } catch {
      // ignore relay errors
    }
  }
}

