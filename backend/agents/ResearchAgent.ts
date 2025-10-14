import { DurableObject } from 'cloudflare:workers';
import type { Env, Message, ToolCall } from '../types';
import { TOOL_SCHEMAS } from '../tools/schemas';
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
    this.fs = new VirtualFs(this.env.R2, `memory/agents/${this.name}/`);
    
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

    // First call with tool schemas for file ops + send_message
    const response: any = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content: 'You are a specialized ResearchAgent. You can read/write files and report back.',
        },
        ...this.messages,
      ],
      tools: [
        TOOL_SCHEMAS.write_file,
        TOOL_SCHEMAS.read_file,
        TOOL_SCHEMAS.list_files,
        TOOL_SCHEMAS.send_message,
      ],
    });

    const toolCalls = this.extractToolCalls(response);
    if (toolCalls.length > 0) {
      const results: Array<{ tool: string; result: any; error?: string }> = [];
      for (const call of toolCalls) {
        try {
          const result = await this.executeTool(call);
          results.push({ tool: call.tool, result });
        } catch (error: any) {
          results.push({ tool: call.tool, result: null, error: String(error?.message || error) });
        }
      }

      const followUp: any = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          {
            role: 'system',
            content: 'You executed tools. Produce a concise, actionable update.',
          },
          ...this.messages,
          {
            role: 'system',
            content: `Tool results: ${JSON.stringify(results)}`,
          },
        ],
      });
      const assistantMessage = (followUp.response as string) ?? 'Completed.';
      this.messages.push({ role: 'assistant', content: assistantMessage });

      // Best-effort relay to IA
      await this.bestEffortRelay(assistantMessage);
      return Response.json({ message: assistantMessage, tool_results: results });
    }

    const assistantMessage = (response.response as string) ?? 'Okay.';
    
    this.messages.push({
      role: 'assistant',
      content: assistantMessage,
    });

    await this.bestEffortRelay(assistantMessage);

    return Response.json({ message: assistantMessage });
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
      this.fs = new VirtualFs(this.env.R2, `memory/agents/${this.name || 'unnamed'}/`);
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

  private extractToolCalls(aiResponse: any): ToolCall[] {
    const calls: ToolCall[] = [];
    const raw = aiResponse?.tool_calls ?? aiResponse?.tools ?? [];
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const tool = item.tool || item.name || item.function?.name;
        let args = item.args ?? item.arguments ?? item.function?.arguments;
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { /* ignore */ }
        }
        if (tool && args && typeof args === 'object') {
          calls.push({ tool, args });
        }
      }
    }
    return calls;
  }

  private async executeTool(call: ToolCall): Promise<any> {
    const { tool, args } = call;
    if (tool === 'write_file') {
      const { path, content } = args as { path: string; content: string };
      await this.ensureFs().writeFile(path, content, { author: this.name || 'research-agent' });
      return { ok: true };
    }
    if (tool === 'read_file') {
      const { path } = args as { path: string };
      const text = await this.ensureFs().readFile(path);
      return { content: text };
    }
    if (tool === 'list_files') {
      const { dir } = (args ?? {}) as { dir?: string };
      const files = await this.ensureFs().listFiles(dir);
      return { files };
    }
    if (tool === 'send_message') {
      const { message } = args as { message: string };
      await this.bestEffortRelay(message);
      return { ok: true };
    }
    throw new Error(`Unknown tool: ${tool}`);
  }

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

