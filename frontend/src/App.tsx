import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AppShell from './components/AppShell';
import { ToastHost } from './components/ui/Toast';
import { AuthProvider, useAuth } from './context/AuthContext';

const OverviewPage = lazy(() => import('./pages/OverviewPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const DailyReportsPage = lazy(() => import('./pages/DailyReportsPage'));
const IncidentsDashboard = lazy(() => import('./pages/IncidentsDashboard'));
const IncidentDetails = lazy(() => import('./pages/IncidentDetails'));
const GuardsView = lazy(() => import('./components/GuardsView').then((m) => ({ default: m.GuardsView })));
const QRGenerator = lazy(() => import('./pages/QRGenerator'));
const AdminConfigsPage = lazy(() => import('./pages/AdminConfigsPage'));
const TenantsPage = lazy(() => import('./pages/TenantsPage'));

const RouteFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[240px] text-sm text-slate-500">
    Loading module...
  </div>
);

const AppRoutes: React.FC = () => {
  const { token, user, modules, isSuper, defaultRedirect, can, loginSuccess, logout } = useAuth();

  const renderShell = (element: React.ReactNode) => (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>{element}</Suspense>
    </AppShell>
  );

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            !token ? (
              <Login onLoginSuccess={loginSuccess} />
            ) : (
              <Navigate to={defaultRedirect} replace />
            )
          }
        />

        <Route
          path="/overview"
          element={
            token && !isSuper ? (
              renderShell(<OverviewPage />)
            ) : (
              <Navigate to={token ? defaultRedirect : '/login'} replace />
            )
          }
        />

        <Route
          path="/daily-reports"
          element={
            token && !isSuper && can('module_patrol') && can('daily_reports') ? (
              renderShell(<DailyReportsPage />)
            ) : (
              <Navigate to={token ? defaultRedirect : '/login'} replace />
            )
          }
        />

        <Route
          path="/reports"
          element={
            token && can('module_patrol') ? (
              renderShell(<ReportsPage />)
            ) : (
              <Navigate to={token ? defaultRedirect : '/login'} replace />
            )
          }
        />

        <Route
          path="/incidents"
          element={
            token && can('module_incidents') ? (
              renderShell(<IncidentsDashboard />)
            ) : (
              <Navigate to={token ? defaultRedirect : '/login'} replace />
            )
          }
        />

        <Route
          path="/incidents/:id"
          element={
            token && can('module_incidents') ? (
              renderShell(<IncidentDetails user={user} />)
            ) : (
              <Navigate to={token ? defaultRedirect : '/login'} replace />
            )
          }
        />

        <Route
          path="/guards"
          element={
            token ? (
              renderShell(<GuardsView />)
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/qr-generator"
          element={
            token && can('module_qr_generator') ? (
              renderShell(<QRGenerator />)
            ) : (
              <Navigate to={token ? defaultRedirect : '/login'} replace />
            )
          }
        />

        <Route
          path="/admin/configs"
          element={
            token && can('module_integrations') ? (
              renderShell(<AdminConfigsPage />)
            ) : (
              <Navigate to={token ? defaultRedirect : '/login'} replace />
            )
          }
        />

        <Route
          path="/platform"
          element={
            token && isSuper ? (
              renderShell(<TenantsPage />)
            ) : (
              <Navigate to={token ? defaultRedirect : '/login'} replace />
            )
          }
        />

        <Route path="*" element={<Navigate to={token ? defaultRedirect : '/login'} replace />} />
      </Routes>
    </Router>
  );
};

export const App: React.FC = () => (
  <AuthProvider>
    <ToastHost />
    <AppRoutes />
  </AuthProvider>
);

export default App;
