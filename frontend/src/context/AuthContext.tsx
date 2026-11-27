import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { API_ROOT } from '../lib/api';

export interface VisibleModules {
  module_patrol?: boolean;
  module_incidents?: boolean;
  module_qr_generator?: boolean;
  module_integrations?: boolean;
  module_activity_logs?: boolean;
  module_sync_queue?: boolean;
  integration_gmail?: boolean;
  integration_whatsapp?: boolean;
  integration_telegram?: boolean;
  daily_reports?: boolean;
  guest_enrollment?: boolean;
}

export interface AuthUser {
  guard_id?: string;
  employee_code?: string;
  name?: string;
  role?: string;
  tier?: 'SUPER_ADMIN' | 'INDUSTRY_ADMIN' | 'USER' | string;
  tenant_id?: string | null;
  tenant_name?: string | null;
  tenant_logo_url?: string | null;
  tenant_address?: string | null;
  active_permissions?: Record<string, boolean>;
  [key: string]: any;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  modules: VisibleModules;
  isSuper: boolean;
  isIndustryAdmin: boolean;
  defaultRedirect: string;
  can: (flag: keyof VisibleModules) => boolean;
  loginSuccess: (newToken: string, userData: AuthUser, modules?: VisibleModules) => void;
  logout: () => void;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const readStoredModules = (): VisibleModules => {
  try {
    const raw = localStorage.getItem('visible_modules');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const readStoredUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const [modules, setModules] = useState<VisibleModules>(readStoredModules);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('visible_modules');
    setToken(null);
    setUser(null);
    setModules({});
  }, []);

  const loginSuccess = useCallback((newToken: string, userData: AuthUser, nextModules?: VisibleModules) => {
    setToken(newToken);
    setUser(userData);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData || {}));
    if (nextModules) {
      setModules(nextModules);
      localStorage.setItem('visible_modules', JSON.stringify(nextModules));
    }
  }, []);

  const refreshPermissions = useCallback(async () => {
    if (!token) return;
    try {
      const { data: r } = await axios.get(`${API_ROOT}/api/v1/guards/my-permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r?.visible_modules) {
        setModules(r.visible_modules);
        localStorage.setItem('visible_modules', JSON.stringify(r.visible_modules));
      }
      setUser((prev) => {
        const next: AuthUser = {
          ...(prev || {}),
          ...(r?.tier ? { tier: r.tier } : {}),
          ...(r?.role ? { role: r.role } : {}),
          ...(r?.tenant_id !== undefined ? { tenant_id: r.tenant_id } : {}),
          ...(r?.active_permissions ? { active_permissions: r.active_permissions } : {}),
        };
        localStorage.setItem('user', JSON.stringify(next));
        return next;
      });
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401 || status === 403) logout();
    }
  }, [token, logout]);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  const isSuper = user?.tier === 'SUPER_ADMIN';
  const isIndustryAdmin = user?.tier === 'INDUSTRY_ADMIN';
  const defaultRedirect = isSuper ? '/platform' : '/overview';
  const can = useCallback((flag: keyof VisibleModules) => modules[flag] === true, [modules]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        modules,
        isSuper,
        isIndustryAdmin,
        defaultRedirect,
        can,
        loginSuccess,
        logout,
        refreshPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
