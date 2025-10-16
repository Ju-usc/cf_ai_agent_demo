import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create_agent, list_agents, message_agent, send_message } from '../../backend/tools/tools';
import type { InteractionAgent } from '../../backend/agents/InteractionAgent';
import type { ResearchAgent } from '../../backend/agents/ResearchAgent';
import type { Env, AgentRegistryEntry } from '../../backend/types';

// Mock getCurrentAgent from agents SDK
vi.mock('agents', () => ({
  getCurrentAgent: vi.fn(),
}));

import { getCurrentAgent } from 'agents';

describe('Agent Management Tools', () => {
  let mockStorage: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  
  let mockStub: {
    fetch: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    getAgentInfo: ReturnType<typeof vi.fn>;
    relay: ReturnType<typeof vi.fn>;
  };
  
  let mockAgent: Partial<InteractionAgent>;
  let mockEnv: Partial<Env>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock storage
    mockStorage = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    
    // Mock Durable Object stub
    mockStub = {
      fetch: vi.fn(),
      initialize: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue('Agent response'),
      getAgentInfo: vi.fn().mockResolvedValue({ 
        name: 'test-agent', 
        description: 'Test agent', 
        messageCount: 5 
      }),
      relay: vi.fn().mockResolvedValue(undefined),
    };
    
    // Mock environment
    mockEnv = {
      RESEARCH_AGENT: {
        idFromName: vi.fn().mockReturnValue('test-do-id'),
        get: vi.fn().mockReturnValue(mockStub),
      } as any,
    };
    
    // Mock InteractionAgent
    mockAgent = {
      getEnv: () => mockEnv as Env,
      getStorage: () => mockStorage as any,
    };
    
    // Mock getCurrentAgent to return our mock agent
    (getCurrentAgent as ReturnType<typeof vi.fn>).mockReturnValue({ agent: mockAgent });
  });

  describe('create_agent', () => {
    it('creates new agent successfully', async () => {
      // Setup: empty registry
      mockStorage.get.mockResolvedValue(null);
      
      // Mock successful init
      mockStub.fetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );
      
      const result = await create_agent.execute({
        name: 'dmd_research',
        description: 'Duchenne MD research',
        message: 'Find latest treatments',
      });
      
      // Verify agent creation
      expect(mockEnv.RESEARCH_AGENT!.idFromName).toHaveBeenCalledWith('dmd_research');
      expect(mockEnv.RESEARCH_AGENT!.get).toHaveBeenCalledWith('test-do-id');
      
      // Verify initialization request
      expect(mockStub.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://research-agent/init',
        })
      );
      
      // Verify registry saved
      expect(mockStorage.put).toHaveBeenCalledWith(
        'agent_registry',
        expect.objectContaining({
          dmd_research: expect.objectContaining({
            id: 'dmd_research',
            name: 'dmd_research',
            description: 'Duchenne MD research',
          }),
        })
      );
      
      expect(result).toEqual({ agent_id: 'dmd_research' });
    });

    it('sanitizes agent name with special characters', async () => {
      mockStorage.get.mockResolvedValue(null);
      mockStub.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
      
      const result = await create_agent.execute({
        name: 'DMD Research! v2',
        description: 'Test',
        message: 'Test',
      });
      
      // Name should be sanitized to lowercase with underscores
      expect(mockEnv.RESEARCH_AGENT!.idFromName).toHaveBeenCalledWith('dmd_research_v2');
      expect(result.agent_id).toBe('dmd_research_v2');
    });

    it('sanitizes multiple spaces to single underscore', async () => {
      mockStorage.get.mockResolvedValue(null);
      mockStub.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
      
      await create_agent.execute({
        name: '  Multiple   Spaces  ',
        description: 'Test',
        message: 'Test',
      });
      
      expect(mockEnv.RESEARCH_AGENT!.idFromName).toHaveBeenCalledWith('multiple_spaces');
    });

    it('removes consecutive underscores', async () => {
      mockStorage.get.mockResolvedValue(null);
      mockStub.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
      
      await create_agent.execute({
        name: '___underscores___',
        description: 'Test',
        message: 'Test',
      });
      
      expect(mockEnv.RESEARCH_AGENT!.idFromName).toHaveBeenCalledWith('underscores');
    });

    it('handles whitespace-only name with fallback', async () => {
      mockStorage.get.mockResolvedValue(null);
      mockStub.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
      
      await create_agent.execute({
        name: '   ',
        description: 'Test',
        message: 'Test',
      });
      
      // Should fallback to 'agent'
      expect(mockEnv.RESEARCH_AGENT!.idFromName).toHaveBeenCalledWith('agent');
    });

    it('returns error when duplicate agent name exists', async () => {
      // Setup: registry already has this agent
      const existingRegistry = {
        dmd_research: {
          id: 'dmd_research',
          name: 'dmd_research',
          description: 'Existing agent',
          createdAt: Date.now(),
          lastActive: Date.now(),
        },
      };
      mockStorage.get.mockResolvedValue(existingRegistry);
      
      await expect(
        create_agent.execute({
          name: 'dmd_research',
          description: 'Duplicate',
          message: 'Test',
        })
      ).rejects.toThrow(/already exists/i);
      
      // Registry should not be updated
      expect(mockStorage.put).not.toHaveBeenCalled();
    });

    it('returns error when agent initialization fails', async () => {
      mockStorage.get.mockResolvedValue(null);
      
      // Mock failed init
      mockStub.fetch.mockResolvedValue(
        new Response('Initialization error', { status: 500 })
      );
      
      await expect(
        create_agent.execute({
          name: 'dmd_research',
          description: 'Test',
          message: 'Test',
        })
      ).rejects.toThrow(/Failed to initialize agent/);
      
      // Registry should not be updated
      expect(mockStorage.put).not.toHaveBeenCalled();
    });
  });

  describe('list_agents', () => {
    it('lists existing agents', async () => {
      const registry: Record<string, AgentRegistryEntry> = {
        dmd_research: {
          id: 'dmd_research',
          name: 'dmd_research',
          description: 'DMD research',
          createdAt: Date.now(),
          lastActive: Date.now(),
        },
        als_research: {
          id: 'als_research',
          name: 'als_research',
          description: 'ALS research',
          createdAt: Date.now(),
          lastActive: Date.now(),
        },
      };
      
      mockStorage.get.mockResolvedValue(registry);
      
      const result = await list_agents.execute({});
      
      expect(result).toEqual([
        { id: 'als_research', name: 'als_research', description: 'ALS research' },
        { id: 'dmd_research', name: 'dmd_research', description: 'DMD research' },
      ]);
      
      // Verify storage was read
      expect(mockStorage.get).toHaveBeenCalledWith('agent_registry');
    });

    it('returns empty list when registry is empty', async () => {
      mockStorage.get.mockResolvedValue(null);
      
      const result = await list_agents.execute({});
      
      expect(result).toEqual([]);
    });

    it('returns empty list for empty registry object', async () => {
      mockStorage.get.mockResolvedValue({});
      
      const result = await list_agents.execute({});
      
      expect(result).toEqual([]);
    });
  });

  describe('message_agent', () => {
    it('sends message to existing agent', async () => {
      const registry: Record<string, AgentRegistryEntry> = {
        dmd_research: {
          id: 'dmd_research',
          name: 'dmd_research',
          description: 'DMD research',
          createdAt: Date.now(),
          lastActive: Date.now() - 1000,
        },
      };
      
      mockStorage.get.mockResolvedValue(registry);
      mockStub.sendMessage.mockResolvedValue('Research findings...');
      
      const result = await message_agent.execute({
        agent_id: 'dmd_research',
        message: "What's the status?",
      });
      
      // Verify JSRPC method called
      expect(mockStub.sendMessage).toHaveBeenCalledWith("What's the status?");
      
      // Verify response
      expect(result).toEqual({ response: 'Research findings...' });
      
      // Verify lastActive updated
      expect(mockStorage.put).toHaveBeenCalledWith(
        'agent_registry',
        expect.objectContaining({
          dmd_research: expect.objectContaining({
            lastActive: expect.any(Number),
          }),
        })
      );
    });

    it('sanitizes agent_id before lookup', async () => {
      mockStorage.get.mockResolvedValue({
        dmd_research_v2: {
          id: 'dmd_research_v2',
          name: 'dmd_research_v2',
          description: 'Test',
          createdAt: Date.now(),
          lastActive: Date.now(),
        },
      });
      
      await message_agent.execute({
        agent_id: 'DMD Research v2',
        message: 'Test',
      });
      
      // Should sanitize to dmd_research_v2
      expect(mockEnv.RESEARCH_AGENT!.idFromName).toHaveBeenCalledWith('dmd_research_v2');
    });

    it('throws error when agent communication fails', async () => {
      mockStorage.get.mockResolvedValue({
        dmd_research: {
          id: 'dmd_research',
          name: 'dmd_research',
          description: 'Test',
          createdAt: Date.now(),
          lastActive: Date.now(),
        },
      });
      
      mockStub.sendMessage.mockRejectedValue(new Error('Network error'));
      
      await expect(
        message_agent.execute({
          agent_id: 'dmd_research',
          message: 'Test',
        })
      ).rejects.toThrow('Network error');
    });
  });
});

describe('Research Agent Communication Tools', () => {
  let mockResearchAgent: Partial<ResearchAgent>;
  let mockInteractionStub: {
    relay: ReturnType<typeof vi.fn>;
  };
  let mockEnv: Partial<Env>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock InteractionAgent stub
    mockInteractionStub = {
      relay: vi.fn().mockResolvedValue(undefined),
    };
    
    // Mock environment
    mockEnv = {
      INTERACTION_AGENT: {
        idFromName: vi.fn().mockReturnValue('interaction-agent-id'),
        get: vi.fn().mockReturnValue(mockInteractionStub),
      } as any,
    };
    
    // Mock ResearchAgent
    mockResearchAgent = {
      state: { name: 'test-agent', description: 'Test', messages: [] },
      env: mockEnv as Env,
      bestEffortRelay: vi.fn().mockResolvedValue(undefined),
    };
    
    // Mock getCurrentAgent to return ResearchAgent
    (getCurrentAgent as ReturnType<typeof vi.fn>).mockReturnValue({ 
      agent: mockResearchAgent 
    });
  });

  describe('send_message', () => {
    it('relays message successfully', async () => {
      const result = await send_message.execute({
        message: 'Analysis complete. Found 5 papers.',
      });
      
      expect(mockResearchAgent.bestEffortRelay).toHaveBeenCalledWith(
        'Analysis complete. Found 5 papers.'
      );
      
      expect(result).toEqual({ ok: true });
    });

    it('succeeds even when relay fails (best-effort)', async () => {
      // Mock the internal relay call to fail
      mockInteractionStub.relay.mockRejectedValue(new Error('Network error'));
      
      // Replace bestEffortRelay with actual implementation that catches errors
      (mockResearchAgent.bestEffortRelay as any) = async (message: string) => {
        try {
          const iaId = mockEnv.INTERACTION_AGENT!.idFromName('default');
          const ia = mockEnv.INTERACTION_AGENT!.get(iaId);
          await ia.relay(mockResearchAgent.state?.name ?? 'unknown', message);
        } catch {
          // ignore relay errors - best effort
        }
      };
      
      // Should NOT throw - best effort means silent failure
      const result = await send_message.execute({
        message: 'Update',
      });
      
      expect(result).toEqual({ ok: true });
      expect(mockInteractionStub.relay).toHaveBeenCalled();
    });

    it('handles empty message', async () => {
      const result = await send_message.execute({
        message: '',
      });
      
      expect(mockResearchAgent.bestEffortRelay).toHaveBeenCalledWith('');
      expect(result).toEqual({ ok: true });
    });
  });
});
