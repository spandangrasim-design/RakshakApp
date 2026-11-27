const rawBase =
  (import.meta as any).env?.VITE_API_URL ||
  ((import.meta as any).env?.VITE_API_BASE_URL || "").replace(/\/api\/v1\/?$/, "") ||
  "https://rakshak-api.spandangrasim.workers.dev";

export const API_ROOT = rawBase.replace(/\/+$/, "");
export const API_V1 = `${API_ROOT}/api/v1`;
