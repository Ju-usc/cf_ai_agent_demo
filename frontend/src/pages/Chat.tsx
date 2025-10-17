import { useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { API_URL } from '../lib/api';

export default function Chat() {
  const endRef = useRef<HTMLDivElement | null>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    stop,
  } = useChat({
    api: `${API_URL}/api/chat`,
    onError: (err) => {
      console.error('Chat error:', err);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim() || isLoading) {
      return;
    }
    handleSubmit(event);
  };

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
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.toolInvocations?.map((invocation) => (
                <div key={invocation.toolCallId} className="text-sm italic opacity-75 mt-2">
                  {invocation.state === 'result'
                    ? `Tool result (${invocation.toolName})`
                    : `Tool in use: ${invocation.toolName}`}
                </div>
              ))}
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

        {isLoading && (
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
            onChange={handleInputChange}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (input.trim() && !isLoading) {
                  handleSubmit();
                }
              }
            }}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed resize-none"
            rows={3}
          />
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
            {isLoading && (
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
