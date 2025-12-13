import {
  convertToModelMessages,
  isToolUIPart,
  type ToolCallOptions,
  type ToolSet,
  type UIMessage,
  type UIMessageStreamWriter,
} from 'ai';

export const APPROVAL = {
  YES: 'yes',
  NO: 'no',
} as const;

type ExecutionsMap = Record<string, (args: any, context: ToolCallOptions) => Promise<unknown>>;

function isValidToolName<K extends PropertyKey, T extends object>(key: K, obj: T): key is K & keyof T {
  return key in obj;
}

/**
 * Process tool calls with optional approval workflow
 * Currently unused - executions map is empty, so this returns messages unchanged
 * Reserved for future feature: tool approval/gating before execution
 */
export async function processToolCalls<Tools extends ToolSet>({
  dataStream,
  messages,
  executions,
}: {
  tools: Tools; // used for type inference
  dataStream: UIMessageStreamWriter;
  messages: UIMessage[];
  executions: ExecutionsMap;
}): Promise<UIMessage[]> {
  // Early return if no approval workflow is configured
  if (!executions || Object.keys(executions).length === 0) {
    return messages;
  }

  const processedMessages = await Promise.all(
    messages.map(async (message) => {
      if (!message.parts) {
        return message;
      }

      const processedParts = await Promise.all(
        message.parts.map(async (part) => {
          if (!isToolUIPart(part)) {
            return part;
          }

          const toolName = part.type.replace('tool-', '') as keyof typeof executions;

          if (!(toolName in executions) || part.state !== 'output-available') {
            return part;
          }

          let result: unknown;

          if (part.output === APPROVAL.YES) {
            if (!isValidToolName(toolName, executions)) {
              return part;
            }

            const toolInstance = executions[toolName];
            result = await toolInstance(part.input, {
              messages: convertToModelMessages(messages),
              toolCallId: part.toolCallId,
            });
          } else if (part.output === APPROVAL.NO) {
            result = 'Error: User denied access to tool execution';
          } else {
            return part;
          }

          dataStream.write({
            type: 'tool-output-available',
            toolCallId: part.toolCallId,
            output: result,
          });

          return {
            ...part,
            output: result,
          };
        })
      );

      return {
        ...message,
        parts: processedParts,
      };
    })
  );

  return processedMessages;
}

export function cleanupMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (!message.parts) {
      return true;
    }

    const hasIncompleteToolCall = message.parts.some((part) => {
      if (!isToolUIPart(part)) {
        return false;
      }

      return (
        part.state === 'input-streaming' ||
        (part.state === 'input-available' && !part.output && !part.errorText)
      );
    });

    return !hasIncompleteToolCall;
  });
}

export type { ExecutionsMap };
