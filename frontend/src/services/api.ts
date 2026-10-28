// src/services/api.ts
const BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

/**
 * The console's pages call fetch() directly (many with no token). Instead of touching every call site,
 * attach the bearer token to every request that targets the Rakshak API, and sign out on 401.
 * Call once at startup (main.tsx).
 */
export const installAuthFetch = () => {
  if ((window as any).__rakshakAuthFetch) return;
  (window as any).__rakshakAuthFetch = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isApi = url.includes('/api/v1/') && !url.includes('/api/v1/auth/login') && !url.includes('/api/v1/media/');
    if (!isApi) return original(input, init);

    const token = localStorage.getItem('token');
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

    const res = await original(input, { ...init, headers });
    if (res.status === 401 && token) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('visible_modules');
      window.location.assign('/login');
    }
    return res;
  };
};
