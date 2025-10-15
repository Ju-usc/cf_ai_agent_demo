import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../backend/index';
import type { Env } from '../backend/types';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}

describe('Worker health check', () => {
  it('responds with 200 at /health', async () => {
    const request = new Request('http://example.com/health');
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env);
    await waitOnExecutionContext(ctx);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
  });
});

