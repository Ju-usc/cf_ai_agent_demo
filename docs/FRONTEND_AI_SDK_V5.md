# Frontend AI SDK v5 Integration Guide

**Last Updated:** January 2025  
**AI SDK Version:** 5.0.76 (`@ai-sdk/react`, `ai`)

This guide documents the correct patterns for integrating AI SDK v5 in the frontend, based on hands-on implementation and debugging.

---

## Package Versions

```json
{
  "@ai-sdk/react": "^2.0.76",
  "ai": "^5.0.76"
}
```

**Important:** AI SDK v5 has breaking changes from v4. Always refer to official docs: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot

---

## Core Pattern: useChat with DefaultChatTransport

### ✅ Correct Implementation

```typescript
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const {
  messages,
  sendMessage,
  status,      // NOT isLoading (v4 API)
  error,
  stop,
} = useChat({
  transport: new DefaultChatTransport({
    api: `${API_URL}/api/chat`,
  }),
  onError: (err) => {
    console.error('Error occurred:', err);
  },
  onFinish: (message) => {
    console.log('Message finished:', message);
  },
});
```

### Key Changes from v4:
1. ❌ `isLoading` → ✅ `status` (values: `'ready' | 'submitted' | 'streaming' | 'error'`)
2. ❌ `onResponse` callback removed
3. ✅ `sendMessage()` now takes message object, not just string

---

## Message Structure: Parts-Based Rendering

### UI Message Format

AI SDK v5 uses a **parts-based message structure**:

```typescript
type UIMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: UIMessagePart[];  // Array of parts
  metadata?: unknown;
}

type UIMessagePart = 
  | { type: 'text', text: string, state: 'streaming' | 'done' }
  | { type: 'tool-*', toolCallId: string, state: 'input-available' | 'output-available', ... }
  | { type: 'step-start' | 'step-end' }
  | { type: 'file', ... }
  | { type: 'reasoning', ... }
  // ... more types
```

### ✅ Official Rendering Pattern

```typescript
{messages.map((message) => (
  <div key={message.id}>
    {/* Render message parts (official AI SDK v5 pattern) */}
    {message.parts?.map((part, idx) => {
      // Text content
      if (part.type === 'text' && part.text) {
        return (
          <div key={idx} className="whitespace-pre-wrap">
            {part.text}
          </div>
        );
      }

      // Tool invocations
      if (part.type?.startsWith('tool-')) {
        return (
          <div key={idx} className="text-sm italic opacity-75 mt-2">
            {part.state === 'output-available'
              ? `✓ Tool: ${part.type.replace('tool-', '')}`
              : `⚙️ Using tool: ${part.type.replace('tool-', '')}`}
          </div>
        );
      }

      // Add more part types as needed (file, reasoning, etc.)
      return null;
    })}

    {/* Fallback: if no parts rendered, show indicator */}
    {(!message.parts || message.parts.length === 0) && (
      <div className="text-sm text-gray-400 italic">
        (empty message)
      </div>
    )}
  </div>
))}
```

### ❌ Don't Do This (v4 Pattern)

```typescript
// This won't work in v5 - messages don't have flat .content or .text
<div>{message.content || message.text}</div>
```

---

## Sending Messages

### ✅ Correct Way (v5)

```typescript
sendMessage({ 
  role: 'user', 
  parts: [{ type: 'text', text: inputValue }] 
});
```

### ❌ Incorrect (v4 Pattern)

```typescript
sendMessage(inputValue);  // This doesn't work in v5
sendMessage({ content: inputValue });  // Also wrong
```

---

## Status Handling

### ✅ Correct Usage

```typescript
const { status } = useChat({ ... });

// Check status
if (status === 'ready') {
  // Can send new message
}

// UI states
<button disabled={status !== 'ready'}>
  {status === 'streaming' ? 'Sending...' : 'Send'}
</button>

{status === 'streaming' && <LoadingIndicator />}
```

### Status Values
- `'ready'` - Idle, can send message
- `'submitted'` - Message sent, waiting for response
- `'streaming'` - Receiving streaming response
- `'error'` - Error occurred

---

## Backend Integration

### Required Response Format

Backend must use `.toUIMessageStreamResponse()` from AI SDK:

```typescript
import { streamText } from 'ai';

const result = streamText({
  model,
  messages,
  tools,
});

// Returns proper UI Message Stream format
return result.toUIMessageStreamResponse();
```

### Response Headers (Automatic)

The response will include:
```
x-vercel-ai-ui-message-stream: v1
content-type: text/event-stream
```

**Do NOT use** `.toTextStreamResponse()` - that's for the old text streaming format.

---

## Stream Protocol

AI SDK v5 uses **UI Message Stream Protocol** (not plain text streaming):

### Stream Format (SSE)
```
data: {"type":"start"}
data: {"type":"start-step"}
data: {"type":"text-start","id":"xyz"}
data: {"type":"text-delta","id":"xyz","delta":"Hello"}
data: {"type":"text-end","id":"xyz"}
data: {"type":"finish-step"}
data: {"type":"finish"}
data: [DONE]
```

See: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

---

## Transport Options

### DefaultChatTransport (Recommended)

For UI Message Stream format (what our backend uses):

```typescript
transport: new DefaultChatTransport({
  api: '/api/chat',
  credentials: 'same-origin',
  headers: { 'Custom-Header': 'value' },
})
```

### TextStreamChatTransport

Only use if backend sends plain text (not our case):

```typescript
transport: new TextStreamChatTransport({
  api: '/api/chat',
})
```

**Note:** TextStreamChatTransport doesn't support tool calls or usage info.

---

## Common Errors & Solutions

### Error: "sendMessage is not a function"
**Cause:** Wrong hook return destructuring  
**Fix:** Make sure you're using `useChat`, not `useCompletion`

### Error: "Property 'text' does not exist on type UIMessage"
**Cause:** Trying to access flat `.text` or `.content`  
**Fix:** Iterate through `message.parts[]` instead

### Error: Empty messages render with no text
**Cause:** Text is in `parts[{type:'text'}]`, not at root level  
**Fix:** Use the parts-based rendering pattern above

### Backend sends data but frontend doesn't render
**Cause:** Backend using `.toTextStreamResponse()` instead of `.toUIMessageStreamResponse()`  
**Fix:** Use `.toUIMessageStreamResponse()` on the backend

---

## Debug Logging (Keep for Development)

Useful logging to keep during development:

```typescript
useChat({
  transport: new DefaultChatTransport({
    api: `${API_URL}/api/chat`,
  }),
  onError: (err) => {
    console.error('[Chat] ❌ Error occurred:', err);
    console.error('[Chat] Error details:', {
      message: err.message,
      stack: err.stack,
    });
  },
  onFinish: (message) => {
    console.log('[Chat] ✅ Message finished:', message);
  },
});

// Log message updates
useEffect(() => {
  console.log('[Chat] 💬 Messages updated:', messages.length, 'messages');
  if (messages.length > 0) {
    console.log('[Chat] Latest message:', messages[messages.length - 1]);
  }
}, [messages]);
```

---

## Testing Checklist

- [ ] Text streaming displays character-by-character
- [ ] Tool invocations show with proper state indicators
- [ ] Status changes: ready → streaming → ready
- [ ] Error handling displays user-friendly messages
- [ ] Empty messages don't crash (show fallback)
- [ ] No "undefined is not an object" errors
- [ ] TypeScript compilation succeeds

---

## References

- **Official Docs:** https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
- **Migration Guide:** https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0
- **Stream Protocol:** https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- **TypeScript Types:** https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat

---

## Example: Complete Chat Component

See `frontend/src/pages/Chat.tsx` for a complete, working implementation following all these patterns.
