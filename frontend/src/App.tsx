import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';

function Navigation() {
  const location = useLocation();

  const linkClasses = (path: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      location.pathname === path
        ? 'bg-gray-900 text-white'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;

  return (
    <nav className="bg-gray-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold">Medical Innovation Agent</h1>
            <div className="flex space-x-4">
              <Link to="/" className={linkClasses('/')}>Chat</Link>
              <Link to="/dashboard" className={linkClasses('/dashboard')}>
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
