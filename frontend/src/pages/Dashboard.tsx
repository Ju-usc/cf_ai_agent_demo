import { useEffect, useState } from 'react';
import { API_URL, fetchJson } from '../lib/api';

interface Agent {
  id: string;
  name: string;
  description: string;
  createdAt?: number;
  lastActive?: number;
}

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ agents: Agent[] }>('/api/agents');
      setAgents(Array.isArray(data.agents) ? data.agents : []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Research Agents</h1>
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-semibold">Error loading agents</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
            <button
              onClick={fetchAgents}
              className="mt-3 text-sm text-red-700 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {loading && !error && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            Loading agents...
          </div>
        )}

        {!loading && !error && agents.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-600 text-lg">No research agents yet</p>
            <p className="text-gray-500 text-sm mt-2">
              Ask the Interaction Agent to start a research task.
            </p>
          </div>
        )}

        {!loading && !error && agents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{agent.name}</h2>
                <p className="text-gray-600 mb-4">{agent.description}</p>
                <div className="text-xs text-gray-500 space-y-1">
                  <div>
                    <span className="font-medium">Created:</span> {formatTimestamp(agent.createdAt)}
                  </div>
                  <div>
                    <span className="font-medium">Last Active:</span> {formatTimestamp(agent.lastActive)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && agents.length > 0 && (
          <div className="mt-6 text-center text-sm text-gray-500">
            Total: {agents.length} agent{agents.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}
