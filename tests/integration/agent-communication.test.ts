import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Agent Communication API', () => {
  it('returns 404 for invalid endpoints', async () => {
    const response = await SELF.fetch('http://example.com/invalid/path', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' }),
    });

    expect(response.status).toBe(404);
  });

  it('handles health check endpoint', async () => {
    const response = await SELF.fetch('http://example.com/health');

    expect(response.status).toBe(200);
    const data = (await response.json()) as { status?: string };
    expect(data.status).toBe('ok');
  });

  it('handles CORS preflight requests', async () => {
    const response = await SELF.fetch('http://example.com/agents/interaction/default/message', {
      method: 'OPTIONS',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it.skip('responds to chat requests via /agents/interaction endpoint', async () => {
    // NOTE: Durable Object bindings work in SELF context but require full initialization.
    // See: tasks/testing-setup/MANUAL_INTEGRATION_TESTS.md - Scenario 3
    // Manual test: npm run dev → curl with agent message
    const response = await SELF.fetch('http://example.com/agents/interaction/default/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Research Duchenne muscular dystrophy treatments' }),
    });

    expect(response.status).toBe(200);
    const content = await response.text();
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
  });

  it.skip('handles follow-up messages contextually', async () => {
    // NOTE: Durable Object state persistence requires full initialization.
    // See: tasks/testing-setup/MANUAL_INTEGRATION_TESTS.md - Scenario 4
    // Manual test: npm run dev → curl follow-up message to same agent
    
    // First message
    const response1 = await SELF.fetch('http://example.com/agents/interaction/default/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Research CAR-T therapy' }),
    });

    expect(response1.status).toBe(200);
    const content1 = await response1.text();
    expect(content1).toBeDefined();

    // Follow-up message to same agent
    const response2 = await SELF.fetch('http://example.com/agents/interaction/default/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What did you find?' }),
    });

    expect(response2.status).toBe(200);
    const content2 = await response2.text();
    expect(content2).toBeDefined();
  });
});
