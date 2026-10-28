import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import { ReportsPage } from './pages/ReportsPage';
import QRGenerator from './pages/QRGenerator';
import AdminConfigsPage from './pages/AdminConfigsPage'; 
import IncidentsDashboard from './pages/IncidentsDashboard';
import IncidentDetails from './pages/IncidentDetails';
import { GuardsView } from './components/GuardsView';
import TenantsPage from './pages/TenantsPage';
import { apiFetch } from './services/api';
import { Shield, LogOut, FileText, QrCode, Sliders, AlertTriangle, Users, Building2 } from 'lucide-react';

interface VisibleModules {
  module_patrol?: boolean;
  module_incidents?: boolean;
  module_qr_generator?: boolean;
  module_integrations?: boolean;
  module_activity_logs?: boolean;
  module_sync_queue?: boolean;
}

// 1. Layout Wrapper with Strict Dynamic Module Filtering
const AdminLayout = ({ 
  user, 
  modules, 
  onLogout, 
  children 
}: { 
  user: any; 
  modules: VisibleModules; 
  onLogout: () => void; 
  children: React.ReactNode; 
}) => {
    const location = useLocation();

    // Features only render if explicitly true
    const showPatrol = modules.module_patrol === true;
    const showIncidents = modules.module_incidents === true;
    const showQR = modules.module_qr_generator === true;
    const showIntegrations = modules.module_integrations === true;

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

                        {/* Dynamic Navigation Tabs (Disabled modules are not rendered) */}
                        <nav className="hidden md:flex items-center gap-2">
                            {user?.tier === 'SUPER_ADMIN' && (
                                <Link
                                    to="/platform"
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                                        location.pathname === '/platform'
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                    }`}
                                >
                                    <Building2 className="h-4 w-4" />
                                    Industries
                                </Link>
                            )}
                            {showPatrol && (
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
                            )}
                            
                            {showIncidents && (
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
                            )}

                            {/* Guard Workforce Management */}
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

                            {showQR && (
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
                            )}
                            
                            {showIntegrations && (
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
                            )}
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden text-right sm:block">
                            <div className="text-xs font-semibold text-slate-900">{user?.full_name || 'Admin'}</div>
                            <div className="text-[11px] text-slate-400">{user?.tier === 'SUPER_ADMIN' ? 'Platform Super Admin' : user?.tier === 'INDUSTRY_ADMIN' ? `Industry Admin${user?.role ? ' · ' + user.role : ''}` : (user?.role || user?.employee_code)}</div>
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

            {/* Main Content */}
            <main>{children}</main>
        </div>
    );
};

// 2. Main Router Component with Enforced Route Gates
export const App: React.FC = () => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [user, setUser] = useState<any>(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });

    // Fail-closed: nothing is visible until the server confirms it. Cached value is only a first-paint hint.
    const [visibleModules, setVisibleModules] = useState<VisibleModules>(() => {
        try {
            const saved = localStorage.getItem('visible_modules');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('visible_modules');
        setToken(null);
        setUser(null);
        setVisibleModules({});
    };

    // Re-verify entitlements with the server on every load. localStorage can be edited by the user; the server cannot.
    useEffect(() => {
        if (!token) return;
        apiFetch('/api/v1/guards/my-permissions')
            .then((r) => {
                if (r?.visible_modules) {
                    setVisibleModules(r.visible_modules);
                    localStorage.setItem('visible_modules', JSON.stringify(r.visible_modules));
                }
                if (r?.tier) {
                    setUser((u: any) => {
                        const next = { ...(u || {}), tier: r.tier, role: r.role, tenant_id: r.tenant_id };
                        localStorage.setItem('user', JSON.stringify(next));
                        return next;
                    });
                }
            })
            .catch((e) => {
                if (/ 40[13] /.test(String(e?.message))) handleLogout();
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const handleLoginSuccess = (newToken: string, userData: any, modules?: VisibleModules) => {
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('token', newToken);
        if (userData) {
            localStorage.setItem('user', JSON.stringify(userData));
        }
        if (modules) {
            setVisibleModules(modules);
            localStorage.setItem('visible_modules', JSON.stringify(modules));
        }
    };

    const isSuper = user?.tier === 'SUPER_ADMIN';
    const defaultRedirect = isSuper
        ? '/platform'
        : visibleModules.module_patrol === true
        ? '/reports'
        : visibleModules.module_incidents === true
        ? '/incidents'
        : '/guards';

    return (
        <Router>
            <Routes>
                {/* Login */}
                <Route
                    path="/login"
                    element={
                        !token ? (
                            <Login onLoginSuccess={handleLoginSuccess} />
                        ) : (
                            <Navigate to={defaultRedirect} replace />
                        )
                    }
                />

                {/* Reports / Patrol Dashboard */}
                <Route
                    path="/reports"
                    element={
                        token ? (
                            visibleModules.module_patrol === true ? (
                                <AdminLayout user={user} modules={visibleModules} onLogout={handleLogout}>
                                    <ReportsPage />
                                </AdminLayout>
                            ) : (
                                <Navigate to="/guards" replace />
                            )
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* Incidents Dashboard */}
                <Route
                    path="/incidents"
                    element={
                        token ? (
                            visibleModules.module_incidents === true ? (
                                <AdminLayout user={user} modules={visibleModules} onLogout={handleLogout}>
                                    <IncidentsDashboard />
                                </AdminLayout>
                            ) : (
                                <Navigate to={defaultRedirect} replace />
                            )
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* Incident Details / Dispatch Console */}
                <Route
                    path="/incidents/:id"
                    element={
                        token ? (
                            visibleModules.module_incidents === true ? (
                                <AdminLayout user={user} modules={visibleModules} onLogout={handleLogout}>
                                    <IncidentDetails user={user} />
                                </AdminLayout>
                            ) : (
                                <Navigate to={defaultRedirect} replace />
                            )
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* Guard Workforce Management */}
                <Route
                    path="/guards"
                    element={
                        token ? (
                            <AdminLayout user={user} modules={visibleModules} onLogout={handleLogout}>
                                <GuardsView />
                            </AdminLayout>
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* QR Generator */}
                <Route
                    path="/qr-generator"
                    element={
                        token ? (
                            visibleModules.module_qr_generator === true ? (
                                <AdminLayout user={user} modules={visibleModules} onLogout={handleLogout}>
                                    <QRGenerator />
                                </AdminLayout>
                            ) : (
                                <Navigate to={defaultRedirect} replace />
                            )
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* API Integrations */}
                <Route
                    path="/admin/configs"
                    element={
                        token ? (
                            visibleModules.module_integrations === true ? (
                                <AdminLayout user={user} modules={visibleModules} onLogout={handleLogout}>
                                    <AdminConfigsPage />
                                </AdminLayout>
                            ) : (
                                <Navigate to={defaultRedirect} replace />
                            )
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />

                {/* Platform: tenants + what each industry bought. Super Admin only; others fall through to the 404-style redirect. */}
                <Route
                    path="/platform"
                    element={
                        token && isSuper ? (
                            <AdminLayout user={user} modules={visibleModules} onLogout={handleLogout}>
                                <TenantsPage />
                            </AdminLayout>
                        ) : (
                            <Navigate to={token ? defaultRedirect : '/login'} replace />
                        )
                    }
                />

                {/* Fallback */}
                <Route
                    path="*"
                    element={<Navigate to={token ? defaultRedirect : "/login"} replace />}
                />
            </Routes>
        </Router>
    );
};

export default App;