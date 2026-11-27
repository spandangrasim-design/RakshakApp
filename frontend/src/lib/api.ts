const PROD_WORKER_ORIGIN = 'https://rakshak-api.spandangrasim.workers.dev';
const DEV_WORKER_ORIGIN = 'https://dev-rakshak-api.spandangrasim.workers.dev';

function resolveWorkerOrigin(): string {
  const explicit = ((import.meta as any).env?.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    // Any Cloudflare Pages preview subdomain (e.g. dev.rakshakapp.pages.dev or <hash>.rakshakapp.pages.dev)
    if (host.endsWith('.rakshakapp.pages.dev') && host !== 'rakshakapp.pages.dev') {
      return DEV_WORKER_ORIGIN;
    }
  }
  return explicit || PROD_WORKER_ORIGIN;
}

export const API_ORIGIN = resolveWorkerOrigin();
export const API_ROOT = API_ORIGIN;
export const API_V1 = `${API_ORIGIN}/api/v1`;
export const API_BASE_URL = API_V1;
