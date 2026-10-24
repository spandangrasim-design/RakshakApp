const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  'https://rakshak-api.spandangrasim.workers.dev/api/v1';

/**
 * Converts any R2 image URL, relative key, or legacy link into an authenticated Worker stream URL.
 * Automatically injects the stored JWT token to allow <img> tags to stream from private R2 storage.
 */
export function getSecureMediaUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  // Filter out invalid/empty placeholder values
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed.length < 5) {
    return null;
  }

  // If already a Base64 data URI, return immediately
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  // Discover token from all common auth storage keys
  let token = localStorage.getItem('token') || localStorage.getItem('access_token') || '';
  
  if (!token) {
    try {
      const supabaseAuth = localStorage.getItem('sb-rakshak-auth-token') || 
                           localStorage.getItem('supabase.auth.token');
      if (supabaseAuth) {
        const parsed = JSON.parse(supabaseAuth);
        token = parsed?.access_token || parsed?.currentSession?.access_token || '';
      }
    } catch (_) {}
  }

  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  let fileKey = '';

  // Case 1: Legacy R2 public URL (e.g., https://pub-xxx.r2.dev/scans/selfie_123.jpg)
  if (trimmed.includes('.r2.dev/')) {
    fileKey = trimmed.split('.r2.dev/')[1]?.split('?')[0];
  }
  // Case 2: Worker media URL (e.g., https://...workers.dev/api/v1/media/scans/xyz.jpg)
  else if (trimmed.includes('/api/v1/media/')) {
    fileKey = trimmed.split('/api/v1/media/')[1]?.split('?')[0];
  }
  // Case 3: Other external HTTP/HTTPS links
  else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    // If it points to your API domain but not via /api/v1/media, extract after the origin
    if (trimmed.includes('spandangrasim.workers.dev')) {
      const parts = trimmed.split('workers.dev/');
      fileKey = parts[1]?.replace(/^api\/v1\/media\//, '')?.split('?')[0];
    } else {
      return trimmed;
    }
  }
  // Case 4: Relative storage key (e.g., "scans/xyz.jpg" or "incidents/abc.jpg")
  else {
    fileKey = trimmed.replace(/^\/+/, '').split('?')[0];
  }

  if (!fileKey) return null;

  return `${API_BASE}/media/${fileKey}${tokenParam}`;
}

export default getSecureMediaUrl;