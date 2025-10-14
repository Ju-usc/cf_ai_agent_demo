-- Research Agents
CREATE TABLE IF NOT EXISTS research_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL
);

-- Triggers
CREATE TABLE IF NOT EXISTS triggers (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  schedule TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fire_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES research_agents(id)
);

CREATE INDEX IF NOT EXISTS idx_triggers_fire_at ON triggers(fire_at, status);
CREATE INDEX IF NOT EXISTS idx_triggers_agent_id ON triggers(agent_id);

-- Agent Events (for dashboard)
CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON agent_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_agent ON agent_events(agent_id);

