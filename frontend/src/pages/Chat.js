import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { API_URL } from '../lib/api';
export default function Chat() {
    const endRef = useRef(null);
    const { messages, input, handleInputChange, handleSubmit, isLoading, error, stop, } = useChat({
        api: `${API_URL}/agents/interaction/main`,
        onError: (err) => {
            console.error('Chat error:', err);
        },
    });
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    const onSubmit = (event) => {
        event.preventDefault();
        if (!input.trim() || isLoading) {
            return;
        }
        handleSubmit(event);
    };
    return (_jsxs("div", { className: "flex flex-col h-[calc(100vh-4rem)]", children: [_jsxs("div", { className: "flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50", children: [messages.length === 0 && (_jsxs("div", { className: "text-center text-gray-500 mt-8", children: [_jsx("p", { className: "text-lg", children: "Welcome to Medical Innovation Agent" }), _jsx("p", { className: "text-sm mt-2", children: "Ask about medical research or strategies." })] })), messages.map((message) => (_jsx("div", { className: `flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`, children: _jsxs("div", { className: `max-w-2xl rounded-lg px-4 py-3 shadow-sm ${message.role === 'user'
                                ? 'bg-blue-500 text-white'
                                : 'bg-white border border-gray-200 text-gray-900'}`, children: [_jsx("div", { className: "whitespace-pre-wrap", children: message.content }), message.toolInvocations?.map((invocation) => (_jsx("div", { className: "text-sm italic opacity-75 mt-2", children: invocation.state === 'result'
                                        ? `Tool result (${invocation.toolName})`
                                        : `Tool in use: ${invocation.toolName}` }, invocation.toolCallId)))] }) }, message.id))), error && (_jsxs("div", { className: "bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800", children: [_jsx("p", { className: "font-semibold", children: "Error" }), _jsx("p", { className: "mt-1", children: error.message.includes('fetch')
                                    ? 'Network error. Is the backend running?'
                                    : error.message.includes('timeout')
                                        ? 'Request timed out. Please try again.'
                                        : 'Something went wrong. Please retry.' })] })), isLoading && (_jsx("div", { className: "flex justify-start", children: _jsx("div", { className: "bg-white border border-gray-200 rounded-lg px-4 py-3", children: _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx("span", { className: "w-2 h-2 bg-gray-400 rounded-full animate-bounce" }), _jsx("span", { className: "w-2 h-2 bg-gray-400 rounded-full animate-bounce", style: { animationDelay: '0.15s' } }), _jsx("span", { className: "w-2 h-2 bg-gray-400 rounded-full animate-bounce", style: { animationDelay: '0.3s' } })] }) }) })), _jsx("div", { ref: endRef })] }), _jsx("div", { className: "border-t border-gray-200 bg-white p-4", children: _jsxs("form", { onSubmit: onSubmit, className: "max-w-4xl mx-auto flex gap-3", children: [_jsx("textarea", { value: input, onChange: handleInputChange, onKeyDown: (event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    if (input.trim() && !isLoading) {
                                        handleSubmit();
                                    }
                                }
                            }, placeholder: "Type your message...", disabled: isLoading, className: "flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed resize-none", rows: 3 }), _jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("button", { type: "submit", disabled: !input.trim() || isLoading, className: "bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors", children: isLoading ? 'Sending...' : 'Send' }), isLoading && (_jsx("button", { type: "button", onClick: stop, className: "bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors", children: "Stop" }))] })] }) })] }));
}
