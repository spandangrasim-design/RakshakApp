const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  'https://rakshak-api.spandangrasim.workers.dev/api/v1';

/**
 * Converts any R2 image URL or file key into an authenticated Worker stream URL.
 * Automatically fixes legacy pub-*.r2.dev URLs stored in Supabase.
 */
export function getSecureMediaUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  // Filter out empty or invalid test strings
  if (!trimmed || trimmed === 'null' || trimmed.length < 6) return null;

  // If it is already a base64 data URI, return as-is
  if (trimmed.startsWith('data:image/')) return trimmed;

  const token = localStorage.getItem('token') || '';
  let fileKey = '';

  // Case 1: Legacy R2 public URL (https://pub-xxx.r2.dev/incidents/abc.jpg)
  if (trimmed.includes('.r2.dev/')) {
    fileKey = trimmed.split('.r2.dev/')[1];
  }
  // Case 2: Already formatted Worker media URL
  else if (trimmed.includes('/api/v1/media/')) {
    fileKey = trimmed.split('/api/v1/media/')[1].split('?')[0];
  }
  // Case 3: Other full HTTP URL
  else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  // Case 4: Relative R2 key (e.g., "incidents/abc.jpg" or "scans/xyz.jpg")
  else {
    fileKey = trimmed.replace(/^\/+/, '');
  }

  if (!fileKey) return null;

  return `${API_BASE}/media/${fileKey}?token=${encodeURIComponent(token)}`;
}