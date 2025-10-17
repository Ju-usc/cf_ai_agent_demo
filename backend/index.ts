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
        console.log('Agents SDK did not handle request, falling back to manual routing');

        // Fallback: try manual kebab-case to PascalCase conversion
        const pathParts = url.pathname.split('/');
        if (pathParts.length >= 4) {
          const agentKebabName = pathParts[2];
          const instanceId = pathParts[3];

          // Convert kebab-case to PascalCase
          const agentClassName = agentKebabName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');

          console.log('Manual routing fallback:', { agentKebabName, agentClassName, instanceId });

          if (agentClassName === 'InteractionAgent' && env.InteractionAgent) {
            const id = env.InteractionAgent.idFromName(instanceId);
            const stub = env.InteractionAgent.get(id);
            return stub.fetch(request);
          } else if (agentClassName === 'ResearchAgent' && env.ResearchAgent) {
            const id = env.ResearchAgent.idFromName(instanceId);
            const stub = env.ResearchAgent.get(id);
            return stub.fetch(request);
          }
        }
      } catch (error) {
        console.error('Error in routeAgentRequest:', error);
        return Response.json({ error: `Agent routing failed: ${error}` }, {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    // Backward compatibility: /api/chat -> InteractionAgent via kebab-case route
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        // Create kebab-case agent URL and route through agents SDK
        const agentUrl = new URL(request.url);
        agentUrl.pathname = '/agents/interaction-agent/main/chat';

        const agentRequest = new Request(agentUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });

        const routed = await routeAgentRequest(agentRequest, env, { cors: true });
        if (routed) {
          return routed;
        }

        return Response.json({ error: 'Agent routing failed' }, {
          status: 500,
          headers: corsHeaders
        });
      } catch (error) {
        console.error('Error routing /api/chat:', error);
        return Response.json({ error: `Chat routing error: ${error}` }, {
          status: 500,
          headers: corsHeaders
        });
      }
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

