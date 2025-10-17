import type { AgentNamespace } from 'agents';
import type { InteractionAgent } from './agents/InteractionAgent';
import type { ResearchAgent } from './agents/ResearchAgent';

// Environment bindings
export interface Env {
  AI: Ai;
  DB: D1Database;
  R2: R2Bucket;
  InteractionAgent: AgentNamespace<InteractionAgent>;
  ResearchAgent: AgentNamespace<ResearchAgent>;
  PERPLEXITY_API_KEY?: string;
  EMAIL_API_KEY?: string;
  // AI provider config
  AI_PROVIDER?: 'workers-ai' | 'openai' | 'anthropic';
  WORKERS_AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

// Agent types
export interface ResearchAgentInfo {
  id: string;
  name: string;
  description: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Tool responses
export interface ToolResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// Tool calling
export interface ToolCall {
  tool: string;
  args: Record<string, any>;
}

export interface AgentRegistryEntry {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  lastActive: number;
}

// Agent events (for dashboard)
export interface AgentEvent {
  id: string;
  agent_id: string | null;
  event_type: 'spawn' | 'tool_call' | 'message' | 'file_write' | 'trigger_create';
  event_data: Record<string, any>;
  timestamp: number;
}

// Trigger
export interface Trigger {
  id: string;
  agent_id: string;
  schedule: string;
  instruction: string;
  status: 'pending' | 'completed' | 'cancelled';
  fire_at: number;
}

// Ambient module declarations for external SDKs to satisfy TypeScript
// without requiring full type packages during initial refactor.

// AI SDK Tool Definition
export interface AiSdkToolDef {
  description: string;
  parameters: any; // Zod schema object
  execute: (args: any) => Promise<any>;
}

