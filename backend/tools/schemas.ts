export const TOOL_SCHEMAS = {
  create_agent: {
    name: 'create_agent',
    description: 'Create a new research agent for a specific domain',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Agent name (e.g., 'duchenne_md_research')" },
        description: { type: 'string', description: 'What this agent researches' },
        message: { type: 'string', description: 'Initial research task' },
      },
      required: ['name', 'description', 'message'],
    },
  },
  list_agents: {
    name: 'list_agents',
    description: 'List all known research agents',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  message_agent: {
    name: 'message_agent',
    description: 'Send a message to a specific research agent',
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The ID (sanitized name) of the agent' },
        message: { type: 'string', description: 'Message to send' },
      },
      required: ['agent_id', 'message'],
    },
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to a file in the agent workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path within agent workspace' },
        content: { type: 'string', description: 'Text content to write' },
      },
      required: ['path', 'content'],
    },
  },
  read_file: {
    name: 'read_file',
    description: 'Read content from a file in the agent workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path within agent workspace' },
      },
      required: ['path'],
    },
  },
  list_files: {
    name: 'list_files',
    description: 'List files in a directory of the agent workspace',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Relative directory within agent workspace' },
      },
    },
  },
  send_message: {
    name: 'send_message',
    description: 'Send a status update back to the InteractionAgent',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Status or summary to report back' },
      },
      required: ['message'],
    },
  },
};
