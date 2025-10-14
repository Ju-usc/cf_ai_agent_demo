import type { Env, ResearchAgentInfo, AgentRegistryEntry } from '../types';

const REGISTRY_KEY = 'agent_registry';

const sanitizeName = (name: string): string => {
  const trimmed = name.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9-_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'agent';
};

async function loadRegistry(storage: DurableObjectState['storage']): Promise<Record<string, AgentRegistryEntry>> {
  const existing = await storage.get<Record<string, AgentRegistryEntry>>(REGISTRY_KEY);
  return existing ?? {};
}

async function saveRegistry(storage: DurableObjectState['storage'], registry: Record<string, AgentRegistryEntry>): Promise<void> {
  await storage.put(REGISTRY_KEY, registry);
}

export interface AgentManagementTools {
  create_agent(name: string, description: string, message: string): Promise<{ agent_id: string }>;
  list_agents(): Promise<Array<ResearchAgentInfo>>;
  message_agent(agent_id: string, message: string): Promise<{ response: string }>;
}

export const createAgentManagementTools = (env: Env, storage: DurableObjectState['storage']): AgentManagementTools => {
  return {
    async create_agent(name: string, description: string, message: string) {
      const now = Date.now();
      const idName = sanitizeName(name);

      // Initialize ResearchAgent DO
      const doId = env.RESEARCH_AGENT.idFromName(idName);
      const stub = env.RESEARCH_AGENT.get(doId);

      const initRes = await stub.fetch(new Request('https://research-agent/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: idName, description, message }),
      }));

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`Failed to initialize agent: ${errText}`);
      }

      // Update registry in DO storage
      const registry = await loadRegistry(storage);
      registry[idName] = {
        id: idName,
        name: idName,
        description,
        createdAt: registry[idName]?.createdAt ?? now,
        lastActive: now,
      };
      await saveRegistry(storage, registry);

      return { agent_id: idName };
    },

    async list_agents() {
      const registry = await loadRegistry(storage);
      const list: ResearchAgentInfo[] = Object.values(registry).map(({ id, name, description }) => ({ id, name, description }));
      // stable sort by createdAt if available in registry values order
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    },

    async message_agent(agent_id: string, message: string) {
      const idName = sanitizeName(agent_id);
      const doId = env.RESEARCH_AGENT.idFromName(idName);
      const stub = env.RESEARCH_AGENT.get(doId);

      const res = await stub.fetch(new Request('https://research-agent/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }));

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to message agent: ${errText}`);
      }

      const data = (await res.json()) as { message: string };

      // Update lastActive
      const registry = await loadRegistry(storage);
      if (registry[idName]) {
        registry[idName].lastActive = Date.now();
        await saveRegistry(storage, registry);
      }

      return { response: data.message };
    },
  };
};
