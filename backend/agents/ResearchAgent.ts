import { Agent } from 'agents';
import { generateText } from 'ai';
import type { Env, Message } from '../types';
import { VirtualFs } from '../tools/file_system';
import { researchTools } from '../tools/tools';
import { createChatModel } from './modelFactory';
import { AGENT_WORKSPACE_ROOT } from '../constants';

type ResearchState = {
  messages: Message[];
  name: string;
  description: string;
};

export class ResearchAgent extends Agent<Env, ResearchState> {
  private fs: VirtualFs | null = null;
  initialState: ResearchState = { messages: [], name: '', description: '' };

  // All communication now via JSRPC - no HTTP endpoints needed
  // Keep onRequest for potential future external API if needed

  // JSRPC method for initialization
  async initialize(name: string, description: string, message: string): Promise<void> {
    this.setState({ ...this.state, name, description });
    // Use workspace root constant
    this.fs = new VirtualFs(this.env.R2, `${AGENT_WORKSPACE_ROOT}research-agent/${name}/`);

    this.setState({
      ...this.state,
      messages: [
        { role: 'system', content: `You are a specialized medical research agent for: ${description}` },
        { role: 'user', content: message },
      ],
    });
  }

  // JSRPC method for sending messages
  async sendMessage(message: string): Promise<string> {
    this.setState({ ...this.state, messages: [...(this.state?.messages ?? []), { role: 'user', content: message }] });

    try {
      const model = createChatModel(this.env);

      const systemPrompt = 
        'You are a specialized ResearchAgent. You can read/write files and report back to the InteractionAgent.';

      // Generate response with tool execution
      const result = await generateText({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...(this.state?.messages ?? []),
        ] as any,
        tools: researchTools,
      });

      const assistantMessage = result.text || 'Okay.';
      this.setState({ ...this.state, messages: [...(this.state?.messages ?? []), { role: 'assistant', content: assistantMessage }] });
      
      return assistantMessage;
    } catch (error: any) {
      console.error('ResearchAgent sendMessage error:', error);
      const errorMessage = 'Error processing research request.';
      this.setState({ ...this.state, messages: [...(this.state?.messages ?? []), { role: 'assistant', content: errorMessage }] });
      throw error;
    }
  }

  // JSRPC method for getting agent info
  async getAgentInfo(): Promise<{ name: string; description: string; messageCount: number }> {
    return {
      name: this.state?.name ?? '',
      description: this.state?.description ?? '',
      messageCount: (this.state?.messages ?? []).length,
    };
  }

  // Make public so tools can access it
  ensureFs(): VirtualFs {
    if (!this.fs) {
      // Use workspace root constant
      const name = this.state?.name || 'unnamed';
      this.fs = new VirtualFs(this.env.R2, `${AGENT_WORKSPACE_ROOT}research-agent/${name}/`);
    }
    return this.fs;
  }

  // Best-effort relay using JSRPC
  async bestEffortRelay(message: string): Promise<void> {
    try {
      const iaId = this.env.INTERACTION_AGENT.idFromName('default');
      const ia = this.env.INTERACTION_AGENT.get(iaId);
      await ia.relay(this.state?.name ?? 'unknown', message);
    } catch {
      // ignore relay errors
    }
  }
}

