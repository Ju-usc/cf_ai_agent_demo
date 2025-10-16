import type { Env } from './types';
import { InteractionAgent } from './agents/InteractionAgent';
import { ResearchAgent } from './agents/ResearchAgent';
import { routeAgentRequest } from 'agents'; // Re-enabled with correct kebab-case URLs

export { InteractionAgent, ResearchAgent };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Debug logging
    console.log('Incoming request:', {
      method: request.method,
      url: url.pathname,
      bindings: Object.keys(env).filter(key => key.includes('Agent'))
    });

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Use Agents SDK router for /agents/** (with kebab-case URLs)
    if (url.pathname.startsWith('/agents')) {
      console.log('Routing to agents SDK...', {
        pathname: url.pathname,
        expectedPattern: '/agents/interaction-agent/main or /agents/research-agent/main (kebab-case)'
      });
      try {
        const routed = await routeAgentRequest(request, env, { cors: true });
        if (routed) {
          console.log('Successfully routed by agents SDK');
          return routed;
        }
        console.log('Agents SDK did not handle request');
      } catch (error) {
        console.error('Error in routeAgentRequest:', error);
        return Response.json({ error: `Agent routing failed: ${error}` }, {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    // Backward compatibility: /api/chat -> InteractionAgent
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const id = env.InteractionAgent.idFromName('main');
      const stub = env.InteractionAgent.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === '/api/agents') {
      if (request.method === 'GET') {
        const id = env.InteractionAgent.idFromName('main');
        const stub = env.InteractionAgent.get(id);

        try {
          const agents = await stub.getAgents();
          return Response.json({ agents }, { headers: corsHeaders });
        } catch (error) {
          console.error('Failed to fetch agents:', error);
          return Response.json(
            { error: 'Failed to fetch agents' },
            { status: 500, headers: corsHeaders },
          );
        }
      }

      return Response.json(
        { error: 'Method not allowed' },
        { status: 405, headers: corsHeaders },
      );
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
} satisfies ExportedHandler<Env>;

