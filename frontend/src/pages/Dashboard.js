import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { fetchJson } from '../lib/api';
export default function Dashboard() {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const fetchAgents = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchJson('/api/agents');
            setAgents(Array.isArray(data.agents) ? data.agents : []);
        }
        catch (err) {
            console.error('Failed to fetch agents:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch agents');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchAgents();
    }, []);
    const formatTimestamp = (timestamp) => {
        if (!timestamp)
            return 'Unknown';
        return new Date(timestamp).toLocaleString();
    };
    return (_jsx("div", { className: "min-h-[calc(100vh-4rem)] bg-gray-50 p-8", children: _jsxs("div", { className: "max-w-6xl mx-auto", children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsx("h1", { className: "text-3xl font-bold text-gray-900", children: "Research Agents" }), _jsx("button", { onClick: fetchAgents, disabled: loading, className: "bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors", children: loading ? 'Refreshing...' : 'Refresh' })] }), error && (_jsxs("div", { className: "bg-red-50 border border-red-200 rounded-lg p-4 mb-6", children: [_jsx("p", { className: "text-red-800 font-semibold", children: "Error loading agents" }), _jsx("p", { className: "text-red-600 text-sm mt-1", children: error }), _jsx("button", { onClick: fetchAgents, className: "mt-3 text-sm text-red-700 underline hover:no-underline", children: "Try again" })] })), loading && !error && (_jsx("div", { className: "flex items-center justify-center py-12 text-gray-500", children: "Loading agents..." })), !loading && !error && agents.length === 0 && (_jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-8 text-center", children: [_jsx("p", { className: "text-gray-600 text-lg", children: "No research agents yet" }), _jsx("p", { className: "text-gray-500 text-sm mt-2", children: "Ask the Interaction Agent to start a research task." })] })), !loading && !error && agents.length > 0 && (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", children: agents.map((agent) => (_jsxs("div", { className: "bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow", children: [_jsx("h2", { className: "text-xl font-semibold text-gray-900 mb-2", children: agent.name }), _jsx("p", { className: "text-gray-600 mb-4", children: agent.description }), _jsxs("div", { className: "text-xs text-gray-500 space-y-1", children: [_jsxs("div", { children: [_jsx("span", { className: "font-medium", children: "Created:" }), " ", formatTimestamp(agent.createdAt)] }), _jsxs("div", { children: [_jsx("span", { className: "font-medium", children: "Last Active:" }), " ", formatTimestamp(agent.lastActive)] })] })] }, agent.id))) })), !loading && !error && agents.length > 0 && (_jsxs("div", { className: "mt-6 text-center text-sm text-gray-500", children: ["Total: ", agents.length, " agent", agents.length === 1 ? '' : 's'] }))] }) }));
}
