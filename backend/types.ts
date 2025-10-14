// Environment bindings
export interface Env {
  AI: Ai;
  DB: D1Database;
  R2: R2Bucket;
  INTERACTION_AGENT: DurableObjectNamespace;
  RESEARCH_AGENT: DurableObjectNamespace;
  PERPLEXITY_API_KEY?: string;
  EMAIL_API_KEY?: string;
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

