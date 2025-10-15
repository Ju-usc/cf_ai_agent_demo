import { Agent } from 'agents';
import { generateText } from 'ai';
import type { Env, Message } from '../types';
import { VirtualFs } from '../tools/file_system';
import { createResearchTools } from '../tools/tools';
import { createChatModel } from './modelFactory';

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
      default:
        return super.onRequest(request);
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

    this.setState({
      ...this.state,
      messages: [
        { role: 'system', content: `You are a specialized medical research agent for: ${description}` },
        { role: 'user', content: message },
      ],
    });

    return Response.json({ success: true });
  }

  private async handleMessage(request: Request): Promise<Response> {
    const { message } = await request.json<{ message: string }>();
    this.setState({ ...this.state, messages: [...(this.state?.messages ?? []), { role: 'user', content: message }] });

    try {
      const model = createChatModel(this.env);
      const tools = createResearchTools(
        this.ensureFs(),
        this.state?.name || 'research-agent',
        (msg) => this.bestEffortRelay(msg)
      );

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

