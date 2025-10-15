import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../backend/index';
import type { Env } from '../backend/types';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}

describe('InteractionAgent', () => {
  it('responds to chat endpoint', async () => {
    const request = new Request('http://example.com/agents/interaction-agent/default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'message',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }]
      }),
    });
    
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text');
  });
});

