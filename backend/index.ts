import type { Env } from './types';
import { InteractionAgent } from './agents/InteractionAgent';
import { ResearchAgent } from './agents/ResearchAgent';
import { routeAgentRequest } from 'agents';

export { InteractionAgent, ResearchAgent };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Primary: Use Agents SDK router for /agents/**
    if (url.pathname.startsWith('/agents')) {
      const routed = await routeAgentRequest(request, env, { cors: true });
      if (routed) return routed;
    }

    // Backward compatibility: /api/chat -> InteractionAgent
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const id = env.INTERACTION_AGENT.idFromName('main');
      const stub = env.INTERACTION_AGENT.get(id);
      return stub.fetch(request);
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Not found' }, { 
      status: 404,
      headers: corsHeaders,
    });
  },
};

