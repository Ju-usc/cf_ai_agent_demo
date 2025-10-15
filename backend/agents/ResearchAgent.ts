import { DurableObject } from 'cloudflare:workers';
// @ts-expect-error External provider types provided at runtime
import { createWorkersAI } from 'workers-ai-provider';
// @ts-expect-error Using generic AI SDK types
import { generateText, tool } from 'ai';
import { z } from 'zod';
import type { Env, Message } from '../types';
import { VirtualFs } from '../tools/file_system';

export class ResearchAgent extends DurableObject<Env> {
  private messages: Message[] = [];
  private name: string = '';
  private description: string = '';
  private fs: VirtualFs | null = null;

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

    this.name = name;
    this.description = description;
    // Use standardized path as per architecture docs
    this.fs = new VirtualFs(this.env.R2, `memory/research_agents/${this.name}/`);
    
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
    this.messages.push({ role: 'user', content: message });

    try {
      // Initialize Workers AI provider
      const workersai = createWorkersAI({ binding: this.env.AI });
      const model = workersai('@cf/meta/llama-3.3-70b-instruct-fp8-fast');

      // Define tools explicitly for visibility and readability
      const tools = {
        write_file: tool({
          description: 'Write content to a file in the agent workspace',
          parameters: z.object({
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
          parameters: z.object({
            path: z.string().describe('Relative path within agent workspace'),
          }),
          execute: async ({ path }: { path: string }) => {
            const text = await this.ensureFs().readFile(path);
            return { content: text };
          },
        }),
        
        list_files: tool({
          description: 'List files in a directory of the agent workspace',
          parameters: z.object({
            dir: z.string().optional().describe('Relative directory within agent workspace'),
          }),
          execute: async ({ dir }: { dir?: string }) => {
            const files = await this.ensureFs().listFiles(dir);
            return { files };
          },
        }),
        
        send_message: tool({
          description: 'Send a status update back to the InteractionAgent',
          parameters: z.object({
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
          ...this.messages,
        ],
        tools,
      });

      const assistantMessage = result.text || 'Okay.';
      this.messages.push({ role: 'assistant', content: assistantMessage });
      
      // Relay message back to InteractionAgent
      await this.bestEffortRelay(assistantMessage);
      
      return Response.json({ message: assistantMessage });
    } catch (error: any) {
      console.error('ResearchAgent handleMessage error:', error);
      const errorMessage = 'Error processing research request.';
      this.messages.push({ role: 'assistant', content: errorMessage });
      return Response.json({ message: errorMessage, error: error.message }, { status: 500 });
    }
  }

  private async getInfo(): Promise<Response> {
    return Response.json({
      name: this.name,
      description: this.description,
      messageCount: this.messages.length,
    });
  }

  private ensureFs(): VirtualFs {
    if (!this.fs) {
      // Use standardized path as per architecture docs
      this.fs = new VirtualFs(this.env.R2, `memory/research_agents/${this.name || 'unnamed'}/`);
    }
    return this.fs;
  }

  private async writeFile(request: Request): Promise<Response> {
    const { path, content } = await request.json<{ path: string; content: string }>();
    const fs = this.ensureFs();
    await fs.writeFile(path, content, { author: this.name || 'research-agent' });
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
        body: JSON.stringify({ agent_id: this.name, message }),
      }));
    } catch {
      // ignore relay errors
    }
  }
}

