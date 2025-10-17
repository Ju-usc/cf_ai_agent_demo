import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { API_URL } from '../lib/api';

export default function Chat() {
  const endRef = useRef<HTMLDivElement | null>(null);
  const [input, setInput] = useState('');

  // Debug: Log the API URL being used
  console.log('[Chat] Component mounted');
  console.log('[Chat] API_URL:', API_URL);
  console.log('[Chat] Full chat endpoint:', `${API_URL}/api/chat`);

  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
  } = useChat({
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log('[Chat] 📤 Submit triggered');
    console.log('[Chat] Input value:', input);
    console.log('[Chat] Status:', status);

    if (!input.trim() || status !== 'ready') {
      console.log('[Chat] ⚠️ Submit blocked (empty input or loading)');
      return;
    }

    console.log('[Chat] 🚀 Sending message to:', `${API_URL}/api/chat`);
    sendMessage({ role: 'user', parts: [{ type: 'text', text: input }] });
    setInput('');
  };

  // Log message changes
  useEffect(() => {
    console.log('[Chat] 💬 Messages updated:', messages.length, 'messages');
    if (messages.length > 0) {
      console.log('[Chat] Latest message:', messages[messages.length - 1]);
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg">Welcome to Medical Innovation Agent</p>
            <p className="text-sm mt-2">Ask about medical research or strategies.</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-2xl rounded-lg px-4 py-3 shadow-sm ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
              {/* Render message parts (official AI SDK v5 pattern) */}
              {message.parts?.map((part: any, idx: number) => {
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

                return null;
              })}

              {/* Fallback: if no parts are rendered, show empty message indicator */}
              {(!message.parts || message.parts.length === 0) && (
                <div className="text-sm text-gray-400 italic">
                  (empty message)
                </div>
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
            <p className="font-semibold">Error</p>
            <p className="mt-1">
              {/* Show detailed error in development, user-friendly message in production */}
              {import.meta.env.DEV
                ? error.message
                : error.message.includes('fetch')
                ? 'Network error. Is the backend running?'
                : error.message.includes('timeout')
                ? 'Request timed out. Please try again.'
                : 'Something went wrong. Please retry.'}
            </p>
          </div>
        )}

        {status === 'streaming' && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.15s' }}
                />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.3s' }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="border-t border-gray-200 bg-white p-4">
        <form onSubmit={onSubmit} className="max-w-4xl mx-auto flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (input.trim() && status === 'ready') {
                  sendMessage({ role: 'user', parts: [{ type: 'text', text: input }] });
                  setInput('');
                }
              }
            }}
            placeholder="Type your message..."
            disabled={status !== 'ready'}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
            rows={3}
          />
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={!input.trim() || status !== 'ready'}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'streaming' ? 'Sending...' : 'Send'}
            </button>
            {status === 'streaming' && (
              <button
                type="button"
                onClick={stop}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Stop
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
