import type { Env } from './types';
import { InteractionAgent } from './agents/InteractionAgent';
import { ResearchAgent } from './agents/ResearchAgent';

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

    // Route to Interaction Agent (single instance for now)
    if (url.pathname.startsWith('/api/chat')) {
      const id = env.INTERACTION_AGENT.idFromName('default');
      const stub = env.INTERACTION_AGENT.get(id);
      const response = await stub.fetch(new Request(`${stub}${url.pathname.replace('/api', '')}`, request));
      
      return new Response(response.body, {
        status: response.status,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
      });
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

