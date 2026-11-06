import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import { ReportsPage } from './pages/ReportsPage';
import QRGenerator from './pages/QRGenerator';
import AdminConfigsPage from './pages/AdminConfigsPage'; 
import IncidentsDashboard from './pages/IncidentsDashboard';
import IncidentDetails from './pages/IncidentDetails';
import { GuardsView } from './components/GuardsView';
import TenantsPage from './pages/TenantsPage';
import { apiFetch } from './services/api';
import AppShell from './components/AppShell';
import OverviewPage from './pages/OverviewPage';
import DailyReportsPage from './pages/DailyReportsPage';
import { ToastHost } from './components/ui/Toast';

interface VisibleModules {
  module_patrol?: boolean;
  module_incidents?: boolean;
  module_qr_generator?: boolean;
  module_integrations?: boolean;
  module_activity_logs?: boolean;
  module_sync_queue?: boolean;
}

// 1. Layout: sidebar + top bar. Menu items only exist for modules the server confirmed (see AppShell).
const AdminLayout = AppShell;

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
        : '/overview';

    return (
        <>
        <ToastHost />
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

                {/* Overview: live summary for admins */}
                <Route
                    path="/overview"
                    element={
                        token && !isSuper ? (
                            <AdminLayout user={user} modules={visibleModules} onLogout={handleLogout}>
                                <OverviewPage />
                            </AdminLayout>
                        ) : (
                            <Navigate to={token ? defaultRedirect : '/login'} replace />
                        )
                    }
                />

                {/* Daily shift reports (only when the industry bought the feature) */}
                <Route
                    path="/daily-reports"
                    element={
                        token && !isSuper && visibleModules.module_patrol === true && (visibleModules as any).daily_reports === true ? (
                            <AdminLayout user={user} modules={visibleModules} onLogout={handleLogout}>
                                <DailyReportsPage />
                            </AdminLayout>
                        ) : (
                            <Navigate to={token ? defaultRedirect : '/login'} replace />
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
        </>
    );
};

export default App;