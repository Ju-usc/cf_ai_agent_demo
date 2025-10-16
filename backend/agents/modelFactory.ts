import { createWorkersAI } from 'workers-ai-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { Env } from '../types';

/**
 * Create a chat model based on AI_PROVIDER env var
 * Defaults to Workers AI if not specified
 */
export function createChatModel(env: Env) {
  const provider = env.AI_PROVIDER || 'workers-ai';
  
  switch (provider) {
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
      }
      const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
      return openai.chat(env.OPENAI_MODEL || 'gpt-4o');
      
    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
      }
      const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
      return anthropic.chat(env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022');
      
    case 'workers-ai':
    default:
      const workersai = createWorkersAI({ binding: env.AI });
      return workersai.chat((env.WORKERS_AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast') as any);
  }
}

