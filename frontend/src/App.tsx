import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import { ReportsPage } from './pages/ReportsPage';
import QRGenerator from './pages/QRGenerator';
import AdminConfigsPage from './pages/AdminConfigsPage'; 
import IncidentsDashboard from './pages/IncidentsDashboard';
import IncidentDetails from './pages/IncidentDetails';
import { GuardsView } from './components/GuardsView'; // <-- NEW: Imported GuardsView
import { Shield, LogOut, FileText, QrCode, Sliders, AlertTriangle, Users } from 'lucide-react'; // <-- NEW: Added Users icon

// 1. Create a Layout Wrapper for authenticated pages with navigation tabs
const AdminLayout = ({ user, onLogout, children }: { user: any, onLogout: () => void, children: React.ReactNode }) => {
    const location = useLocation();

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800">
            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
                    <div className="flex items-center gap-6">
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

                        {/* Navigation Tabs */}
                        <nav className="hidden md:flex items-center gap-2">
                            <Link
                                to="/reports"
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                                    location.pathname === '/reports'
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <FileText className="h-4 w-4" />
                                Reports
                            </Link>
                            
                            {/* INCIDENTS DASHBOARD LINK */}
                            <Link
                                to="/incidents"
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                                    location.pathname.startsWith('/incidents')
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <AlertTriangle className="h-4 w-4" />
                                Incidents
                            </Link>

                            {/* GUARDS MANAGEMENT LINK */}
                            <Link
                                to="/guards"
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                                    location.pathname === '/guards'
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <Users className="h-4 w-4" />
                                Guards
                            </Link>

                            <Link
                                to="/qr-generator"
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                                    location.pathname === '/qr-generator'
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <QrCode className="h-4 w-4" />
                                QR Generator
                            </Link>
                            
                            <Link
                                to="/admin/configs"
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                                    location.pathname === '/admin/configs'
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <Sliders className="h-4 w-4" />
                                API Integrations
                            </Link>
                        </nav>
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
                            <Login onLoginSuccess={handleLoginSuccess} />
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

                {/* INCIDENTS DASHBOARD ROUTE */}
                <Route
                    path="/incidents"
                    element={
                        token ? (
                            <AdminLayout user={user} onLogout={handleLogout}>
                                <IncidentsDashboard />
                            </AdminLayout>
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* TICKET DETAILS ROUTE */}
                <Route
                    path="/incidents/:id"
                    element={
                        token ? (
                            <AdminLayout user={user} onLogout={handleLogout}>
                                <IncidentDetails user={user} />
                            </AdminLayout>
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* Protected Route: Guard Management */}
                <Route
                    path="/guards"
                    element={
                        token ? (
                            <AdminLayout user={user} onLogout={handleLogout}>
                                <GuardsView />
                            </AdminLayout>
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* Protected Route: Cryptographic QR Generator */}
                <Route
                    path="/qr-generator"
                    element={
                        token ? (
                            <AdminLayout user={user} onLogout={handleLogout}>
                                <QRGenerator />
                            </AdminLayout>
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* Protected Route for Admin Configurations */}
                <Route
                    path="/admin/configs"
                    element={
                        token ? (
                            <AdminLayout user={user} onLogout={handleLogout}>
                                <AdminConfigsPage />
                            </AdminLayout>
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* Fallback Route */}
                <Route
                    path="*"
                    element={<Navigate to={token ? "/reports" : "/login"} replace />}
                />
            </Routes>
        </Router>
    );
};

export default App;