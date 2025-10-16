import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
function Navigation() {
    const location = useLocation();
    const linkClasses = (path) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${location.pathname === path
        ? 'bg-gray-900 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`;
    return (_jsx("nav", { className: "bg-gray-800 text-white shadow-lg", children: _jsx("div", { className: "max-w-7xl mx-auto px-4", children: _jsx("div", { className: "flex items-center justify-between h-16", children: _jsxs("div", { className: "flex items-center space-x-8", children: [_jsx("h1", { className: "text-xl font-bold", children: "Medical Innovation Agent" }), _jsxs("div", { className: "flex space-x-4", children: [_jsx(Link, { to: "/", className: linkClasses('/'), children: "Chat" }), _jsx(Link, { to: "/dashboard", className: linkClasses('/dashboard'), children: "Dashboard" })] })] }) }) }) }));
}
export default function App() {
    return (_jsx(BrowserRouter, { children: _jsxs("div", { className: "min-h-screen bg-gray-50", children: [_jsx(Navigation, {}), _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Chat, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(Dashboard, {}) })] })] }) }));
}
