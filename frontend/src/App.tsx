import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ReportsPage } from './pages/ReportsPage';
import { Shield, LogOut } from 'lucide-react';

// 1. Create a Layout Wrapper for authenticated pages
const AdminLayout = ({ user, onLogout, children }: { user: any, onLogout: () => void, children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-slate-900">Rakshak</span>
              <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                Operations
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-semibold text-slate-900">{user?.full_name || 'Admin'}</div>
              <div className="text-[11px] text-slate-400">{user?.employee_code || 'Site Manager'}</div>
            </div>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-rose-600"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main>
        {children}
      </main>
    </div>
  );
};

// 2. Main App Component with Routing
export const App: React.FC = () => {
  // Check local storage for existing session on initial load
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLoginSuccess = (newToken: string, userData: any) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('token', newToken);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <Router>
      <Routes>
        {/* Public Route: Login */}
        <Route 
          path="/login" 
          element={
            !token ? (
              <LoginPage onLoginSuccess={handleLoginSuccess} />
            ) : (
              <Navigate to="/reports" replace />
            )
          } 
        />

        {/* Protected Route: Reports Dashboard */}
        <Route 
          path="/reports" 
          element={
            token ? (
              <AdminLayout user={user} onLogout={handleLogout}>
                <ReportsPage />
              </AdminLayout>
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />

        {/* Fallback Route: Redirect everything else to either reports or login */}
        <Route 
          path="*" 
          element={<Navigate to={token ? "/reports" : "/login"} replace />} 
        />
      </Routes>
    </Router>
  );
};

export default App;