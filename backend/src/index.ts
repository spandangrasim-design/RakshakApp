import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sign, verify } from 'hono/jwt' 
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import CryptoJS from 'crypto-js'
import {
  AppPermissions, AuthContext, PERMISSION_KEYS, INCIDENT_FORM_FIELDS,
  buildAuthContext, clampToTenant, makeRequireAuth, normalizeTenantFeatures, resolveAccess,
  applyTenant, scopeTenant, requireModule, requirePermission, requireTenantFlag, requireTier, uiModules, tierFrom,
} from './rbac'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  JWT_SECRET: string
  QR_SECRET: string 
  R2_BUCKET: R2Bucket
  ALLOWED_ORIGINS?: string   // comma separated; defaults below
  SITE_TZ_OFFSET_MIN?: string // minutes ahead of UTC for "today" (default 330 = India)
  GEOFENCE_RADIUS_M?: string // max guard-to-checkpoint distance in metres (default 250)
}

type Variables = {
  auth: AuthContext
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Only the admin console may call this API from a browser. Native apps send no Origin header, so they are unaffected.
const DEFAULT_ORIGINS = ['https://rakshakapp.pages.dev', 'http://localhost:3000', 'http://localhost:5173']
app.use('/*', cors({
  origin: (origin: string, c: any) => {
    const allowed = (c.env?.ALLOWED_ORIGINS ? String(c.env.ALLOWED_ORIGINS).split(',').map((x: string) => x.trim()) : DEFAULT_ORIGINS)
    if (allowed.includes(origin)) return origin
    if (/^https:\/\/[a-z0-9-]+\.rakshakapp\.pages\.dev$/.test(origin)) return origin // Pages preview deployments
    return ''
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  maxAge: 600,
}))

// Never leak internals (table names, SQL errors) to clients.
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ success: false, message: 'Internal server error.' }, 500)
})

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Role baselines (explicit values only; a missing key means OFF).
export const DEFAULT_GUARD_PERMISSIONS: AppPermissions = {
  patrol_route: true,
  report_incident: true,
  incident_tickets: true,
  activity_log: true,
  sync_queue: true,
  incident_option_1_severity: false,
  incident_option_2_category: false,
  incident_option_3_group: false,
  incident_option_4_title: true,
  incident_option_5_description: true,
  incident_option_6_photo: true,
}

export const DEFAULT_SUPERVISOR_PERMISSIONS: AppPermissions = {
  patrol_route: true,
  report_incident: true,
  incident_tickets: true,
  activity_log: true,
  sync_queue: true,
  incident_option_1_severity: true,
  incident_option_2_category: true,
  incident_option_3_group: true,
  incident_option_4_title: true,
  incident_option_5_description: true,
  incident_option_6_photo: true,
}

// --- SCHEMAS ---
const sanitizeUuid = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (!v || v.trim() === '' ? null : v.trim()));

const sanitizeUuidArray = z
  .array(z.string())
  .optional()
  .nullable()
  .transform((arr) =>
    Array.isArray(arr)
      ? arr.map((id) => id.trim()).filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      : undefined
  );

const sanitizeStringArray = z
  .array(z.string())
  .optional()
  .nullable()
  .transform((arr) =>
    Array.isArray(arr) ? arr.map((s) => s.trim()).filter(Boolean) : undefined
  );

const loginSchema = z.object({
  employee_code: z.string().min(1),
  password: z.string().min(6),
  device_id: z.string().optional()
})

const scanSchema = z.object({
  client_scan_id: z.string(),
  checkpoint_id: z.string(),
  qr_lat: z.string(),
  qr_lng: z.string(),
  signature: z.string(),
  guard_lat: z.number(),
  guard_lng: z.number(),
  uptime_seconds: z.number().optional(), 
  selfie_url: z.string().optional(),
  location_photo_url: z.string().optional(),
  photo_url: z.string().optional()
})

const roundSaveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  checkpoints: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      lat: z.string().min(1),
      lng: z.string().min(1)
    })
  )
})

const createGuardSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  employee_code: z.string().min(1, 'Employee code is required'),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.string().optional().default('Guard'),
  site_location: z.string().optional().default('Main Plant & Gate 1'),
  shift_timing: z.string().optional().default('Morning (06:00 - 14:00)'),
  assignment_group: z.string().optional().nullable(),
  assignment_groups: sanitizeStringArray,
  assigned_round_id: sanitizeUuid,
  assigned_round_ids: sanitizeUuidArray,
  reporting_to: sanitizeUuid,
  app_permissions: z.record(z.boolean()).optional().nullable(),
  tenant_id: sanitizeUuid,
  tier: z.enum(['INDUSTRY_ADMIN', 'USER']).optional()
})

const updateGuardSchema = z.object({
  full_name: z.string().optional(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  is_active: z.boolean().optional(),
  role: z.string().optional(),
  site_location: z.string().optional(),
  shift_timing: z.string().optional(),
  assignment_group: z.string().optional().nullable(),
  assignment_groups: sanitizeStringArray,
  assigned_round_id: sanitizeUuid,
  assigned_round_ids: sanitizeUuidArray,
  reporting_to: sanitizeUuid,
  app_permissions: z.record(z.boolean()).optional().nullable(),
  tier: z.enum(['INDUSTRY_ADMIN', 'USER']).optional(),   // Super Admin only
  tenant_id: sanitizeUuid                                // Super Admin only
})

const getSupabase = (env: Bindings) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { 
    auth: { persistSession: false },
    global: { fetch: (...args) => fetch(...args) } 
  });

// --- HELPER: Extended profile storage ---
interface GuardExtendedProfile {
  email?: string | null;
  phone?: string | null;
  assignment_groups?: string[];
  app_permissions?: Record<string, boolean> | null;
}

async function getGuardExtendedProfilesMap(supabase: any): Promise<Record<string, GuardExtendedProfile>> {
  const { data } = await supabase
    .from('admin_configurations')
    .select('key_value')
    .eq('key_name', 'GUARD_EXTENDED_PROFILES')
    .maybeSingle();

  if (data?.key_value) {
    try {
      return JSON.parse(data.key_value);
    } catch (_) {}
  }
  return {};
}

async function saveGuardExtendedProfile(
  supabase: any,
  guardId: string,
  updates: Partial<GuardExtendedProfile>
) {
  const currentMap = await getGuardExtendedProfilesMap(supabase);
  const existing = currentMap[guardId] || {};
  currentMap[guardId] = {
    ...existing,
    ...(updates.email !== undefined ? { email: updates.email } : {}),
    ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
    ...(updates.assignment_groups !== undefined ? { assignment_groups: updates.assignment_groups } : {}),
    ...(updates.app_permissions !== undefined ? { app_permissions: updates.app_permissions } : {}),
  };

  await supabase
    .from('admin_configurations')
    .upsert(
      [{ key_name: 'GUARD_EXTENDED_PROFILES', key_value: JSON.stringify(currentMap) }],
      { onConflict: 'key_name' }
    );
}

// --- OPTION C HYBRID ENGINE RESOLVER ---
async function resolveEffectivePermissions(
  supabase: any,
  roleName: string,
  guardOverride: Record<string, boolean> | null | undefined
): Promise<{ permissions: AppPermissions; is_custom_override: boolean; role_defaults: AppPermissions }> {
  let roleBaseline: AppPermissions = ['Shift Supervisor', 'Security Manager', 'Chief Security Officer', 'Admin'].includes(roleName)
    ? { ...DEFAULT_SUPERVISOR_PERMISSIONS }
    : { ...DEFAULT_GUARD_PERMISSIONS };

  const { data: roleRow } = await supabase
    .from('app_role_permissions')
    .select('permissions')
    .eq('role_name', roleName)
    .maybeSingle();

  if (roleRow?.permissions && typeof roleRow.permissions === 'object') {
    roleBaseline = { ...roleBaseline, ...roleRow.permissions };
  }

  const hasOverride = guardOverride !== null && guardOverride !== undefined && Object.keys(guardOverride).length > 0;
  const effective: AppPermissions = hasOverride
    ? { ...roleBaseline, ...guardOverride }
    : { ...roleBaseline };

  return {
    permissions: effective,
    is_custom_override: hasOverride,
    role_defaults: roleBaseline
  };
}

// ---------- password hashing (PBKDF2-SHA256; Workers caps iterations at 100k) ----------
const PBKDF2_ITER = 100000
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (t: string) => Uint8Array.from(atob(t), (ch) => ch.charCodeAt(0))
async function pbkdf2(pw: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256))
}
async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(await pbkdf2(pw, salt, PBKDF2_ITER))}`
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
// Accepts legacy plaintext rows too and flags them for upgrade on next successful login.
async function verifyPassword(pw: string, stored: string | null): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (!stored) return { ok: false, needsUpgrade: false }
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt, hash] = stored.split('$')
    const got = b64(await pbkdf2(pw, unb64(salt), parseInt(iter, 10)))
    return { ok: safeEqual(got, hash), needsUpgrade: false }
  }
  return { ok: safeEqual(pw, stored), needsUpgrade: true }
}

// ---------- tier 2/3 loader used by the shared auth builder ----------
async function loadUserPerms(supabase: any, guard: any): Promise<Partial<AppPermissions>> {
  const { permissions } = await resolveEffectivePermissions(supabase, guard.role || 'Guard', guard.app_permissions ?? null)
  return permissions
}

async function rawTenantFeatures(supabase: any, tenantId: string | null | undefined): Promise<any> {
  if (!tenantId) return null
  const { data } = await supabase.from('tenants').select('features').eq('id', tenantId).maybeSingle()
  return data?.features ?? null
}

// ---------- output safety ----------
function esc(v: any): string {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[ch])
}
function safeEmail(v: any): string | null {
  const e = String(v ?? '').trim()
  return /^[^\s@<>,;"'\\]+@[^\s@<>,;"'\\]+\.[^\s@<>,;"'\\]+$/.test(e) ? e : null // also blocks CR/LF header injection
}
/** Log the real error server-side, return a generic message to the client. */
function errMsg(e: any, fallback = 'Request failed. Please try again.'): string {
  console.error('API error:', e?.message || e)
  return fallback
}

// ---------- images: size + type validated, unguessable keys ----------
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
function decodeImage(b64?: string | null): { bytes: Uint8Array; type: string; ext: string } | null {
  if (!b64 || typeof b64 !== 'string') return null
  const clean = b64.replace(/^data:image\/\w+;base64,/, '')
  if (clean.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8) return null
  let bytes: Uint8Array
  try { bytes = Uint8Array.from(atob(clean), (ch) => ch.charCodeAt(0)) } catch { return null }
  if (bytes.length < 16 || bytes.length > MAX_IMAGE_BYTES) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { bytes, type: 'image/jpeg', ext: 'jpg' }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { bytes, type: 'image/png', ext: 'png' }
  return null // anything that is not really a JPEG/PNG is rejected
}
/** Stores an image under a random key (capability URL). Returns null if the payload is not a valid image. */

// ---------- Industry Logo: SVG / PNG / JPG up to 5MB ----------
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

function decodeBrandLogo(input?: string | null): { bytes: Uint8Array; type: string; ext: string } | null {
  if (!input || typeof input !== 'string') return null;
  const isSvgData = input.startsWith('data:image/svg+xml;base64,');
  const clean = input.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  if (clean.length > Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 16) return null;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(clean), (ch) => ch.charCodeAt(0)); } catch { return null; }
  if (bytes.length < 16 || bytes.length > MAX_LOGO_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { bytes, type: 'image/jpeg', ext: 'jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { bytes, type: 'image/png', ext: 'png' };
  const sample = new TextDecoder().decode(bytes.slice(0, 2048));
  if (isSvgData || sample.includes('<svg')) {
    const fullSvg = new TextDecoder().decode(bytes);
    if (/<script[\s>]|onload=|onerror=|javascript:/i.test(fullSvg)) return null;
    return { bytes, type: 'image/svg+xml', ext: 'svg' };
  }
  return null;
}

async function storeBrandLogo(
  bucket: R2Bucket,
  origin: string,
  tenantId: string,
  input?: string | null
): Promise<string | null> {
  if (!input) return null;
  if (input.startsWith(`${origin}/api/v1/media/`)) return input;
  const parsed = decodeBrandLogo(input);
  if (!parsed) return null;
  const key = `logos/tenant_${tenantId}_${crypto.randomUUID()}.${parsed.ext}`;
  await bucket.put(key, parsed.bytes, { httpMetadata: { contentType: parsed.type } });
  return `${origin}/api/v1/media/${key}`;
}

async function storeImage(bucket: R2Bucket, origin: string, folder: string, prefix: string, input?: string | null): Promise<string | null> {
  if (!input) return null
  if (input.startsWith(`${origin}/api/v1/media/`)) return input // already one of ours
  const img = decodeImage(input)
  if (!img) return null
  const key = `${folder}/${prefix}_${crypto.randomUUID()}.${img.ext}`
  await bucket.put(key, img.bytes, { httpMetadata: { contentType: img.type } })
  return `${origin}/api/v1/media/${key}`
}

// ---------- geofence ----------
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

// ---------- login brute-force protection (table: login_attempts, see SQL/003) ----------
const LOGIN_WINDOW_MS = 15 * 60 * 1000
async function isLoginLocked(supabase: any, key: string): Promise<number> {
  try {
    const { data } = await supabase.from('login_attempts').select('locked_until').eq('attempt_key', key).maybeSingle()
    const until = data?.locked_until ? new Date(data.locked_until).getTime() : 0
    return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0
  } catch { return 0 } // if the table is missing, do not block logins
}
async function recordLoginFailure(supabase: any, key: string, max: number) {
  try {
    const { data } = await supabase.from('login_attempts').select('fail_count, window_start').eq('attempt_key', key).maybeSingle()
    const now = Date.now()
    const fresh = !data || now - new Date(data.window_start).getTime() > LOGIN_WINDOW_MS
    const count = fresh ? 1 : (data.fail_count || 0) + 1
    await supabase.from('login_attempts').upsert({
      attempt_key: key,
      fail_count: count,
      window_start: fresh ? new Date(now).toISOString() : data.window_start,
      locked_until: count >= max ? new Date(now + LOGIN_WINDOW_MS).toISOString() : null,
    }, { onConflict: 'attempt_key' })
  } catch {}
}
async function clearLoginFailures(supabase: any, key: string) {
  try { await supabase.from('login_attempts').delete().eq('attempt_key', key) } catch {}
}

// ---------- per-tenant configuration (admin_configurations rows are stored as "t:<tenantId>:<KEY>") ----------
const cfgKey = (tenantId: string, key: string) => `t:${tenantId}:${key}`
const SECRET_KEYS = new Set(['GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_ACCESS_TOKEN', 'WHATSAPP_API_TOKEN', 'TELEGRAM_BOT_TOKEN'])
const MASK = '********'

/** Which keys may this tenant even see or write? Unpurchased channel keys do not exist for them. */
function configKeyAllowed(key: string, f: ReturnType<typeof normalizeTenantFeatures>): boolean {
  if (key === 'GUARD_EXTENDED_PROFILES') return false // legacy global blob, never exposed
  if (key.startsWith('DAILY_REPORT_')) return f.module_patrol.allow_daily_reports
  if (key === 'RENEW_ON_NEW_GUARD') return f.module_patrol.allow_guest_enrollment
  const ch = f.module_integrations.channels
  if (key.startsWith('GMAIL_') || key === 'ENABLE_GMAIL' || key === 'MANAGER_EMAIL') return ch.gmail_oauth
  if (key.startsWith('WHATSAPP_') || key === 'ENABLE_WHATSAPP' || key === 'MANAGER_PHONE') return ch.whatsapp_api
  if (key.startsWith('TELEGRAM_') || key === 'ENABLE_TELEGRAM') return ch.telegram_bot
  return true // non-integration settings such as CUSTOM_ASSIGNMENT_GROUPS
}

async function loadTenantConfig(supabase: any, tenantId: string): Promise<Record<string, string>> {
  const prefix = `t:${tenantId}:`
  const { data } = await supabase.from('admin_configurations').select('key_name, key_value').like('key_name', `${prefix}%`)
  const out: Record<string, string> = {}
  for (const r of data || []) out[String(r.key_name).slice(prefix.length)] = r.key_value
  return out
}

async function tenantFeaturesFor(supabase: any, tenantId: string | null | undefined) {
  return normalizeTenantFeatures(await rawTenantFeatures(supabase, tenantId))
}

// ---------- gates ----------
const requireAuth = makeRequireAuth(getSupabase, loadUserPerms)
const adminTiers = requireTier('SUPER_ADMIN', 'INDUSTRY_ADMIN')
const superOnly = requireTier('SUPER_ADMIN')

/** Row must belong to the caller's tenant, otherwise it "does not exist" (404). */
function ownedRow(table: string, column: string, param: string) {
  return async (c: any, next: () => Promise<void>) => {
    const a = c.get('auth') as AuthContext
    if (a.tier === 'SUPER_ADMIN') return next()
    const { data } = await getSupabase(c.env).from(table).select('tenant_id').eq(column, c.req.param(param)).maybeSingle()
    if (!data || data.tenant_id !== a.tenant_id) return c.json({ success: false, message: 'Not Found' }, 404)
    await next()
  }
}

function extractGuardCoordsFromScan(scan: any): { lat: number; lng: number } {
  const directLat = Number(scan.guard_lat ?? scan.lat ?? 0);
  const directLng = Number(scan.guard_lng ?? scan.lng ?? 0);
  if (directLat !== 0 && directLng !== 0 && !isNaN(directLat) && !isNaN(directLng)) {
    return { lat: directLat, lng: directLng };
  }

  for (const val of Object.values(scan)) {
    if (typeof val === 'string') {
      const clean = val.trim();
      const hasSrid = clean.toUpperCase().startsWith('0101000020');
      const noSrid = clean.toUpperCase().startsWith('0101000000');
      if ((hasSrid || noSrid) && clean.length >= (hasSrid ? 50 : 42)) {
        try {
          const offset = hasSrid ? 18 : 10;
          const bytes = new Uint8Array(16);
          for (let i = 0; i < 16; i++) {
            bytes[i] = parseInt(clean.slice(offset + i * 2, offset + i * 2 + 2), 16);
          }
          const view = new DataView(bytes.buffer);
          const lng = view.getFloat64(0, true);
          const lat = view.getFloat64(8, true);
          if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && lat !== 0) {
            return { lat, lng };
          }
        } catch (_) {}
      }
      const ptMatch = clean.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
      if (ptMatch) {
        return { lat: parseFloat(ptMatch[2]), lng: parseFloat(ptMatch[1]) };
      }
    } else if (val && typeof val === 'object' && Array.isArray((val as any).coordinates)) {
      const [lng, lat] = (val as any).coordinates;
      if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
    }
  }

  return { lat: 0, lng: 0 };
}

// ==========================================
// AUTH + STRICT FEATURE CASCADE (runs BEFORE every handler below)
//   no token              -> 401
//   tenant didn't buy it  -> 404  (endpoint "does not exist" for this tenant)
//   bought, not allocated -> 403
// ==========================================
app.use('/api/v1/*', async (c, next) => {
  const p = new URL(c.req.url).pathname
  if (p === '/api/v1/auth/login' || p.startsWith('/api/v1/media/') || p.startsWith('/api/v1/guest/')) return next()
  return requireAuth(c, next)
})

const incidentsMod = requireModule('module_incidents')

app.on('POST',   '/api/v1/scans', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('GET',    '/api/v1/scans', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('GET',    '/api/v1/rounds/:id/scans', adminTiers, requireModule('module_patrol'), ownedRow('rounds', 'id', 'id'))
app.on('POST',   '/api/v1/patrols/session/start', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('POST',   '/api/v1/patrols/session/ping', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('POST',   '/api/v1/patrols/sync', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('GET',    '/api/v1/rounds/:id/live-trail', adminTiers, requireModule('module_patrol'),
       requireTenantFlag((f) => f.module_patrol.allow_live_gps_trail), ownedRow('rounds', 'id', 'id'))
app.on('GET',    '/api/v1/shifts/active', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('POST',   '/api/v1/shifts/start', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('POST',   '/api/v1/shifts/end', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('GET',    '/api/v1/rounds', requireModule('module_patrol'))
app.on('POST',   '/api/v1/rounds', adminTiers, requireModule('module_patrol'))
app.on('DELETE', '/api/v1/rounds/:id', adminTiers, requireModule('module_patrol'), ownedRow('rounds', 'id', 'id'))
app.on('GET',    '/api/v1/guards/my-assigned-route', requireModule('module_patrol'), requirePermission('patrol_route'), requireTenantFlag((f) => f.module_patrol.allow_route_assignment))
app.on('GET',    '/api/v1/dashboard/summary', adminTiers)
app.on('POST',   '/api/v1/field/runs/:id/pause', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('POST',   '/api/v1/field/runs/:id/resume', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('POST',   '/api/v1/field/runs/:id/end', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('PATCH',  '/api/v1/rounds/:id/renewal', adminTiers, requireModule('module_patrol'), ownedRow('rounds', 'id', 'id'))
app.on('POST',   '/api/v1/rounds/:id/renew', adminTiers, requireModule('module_patrol'), ownedRow('rounds', 'id', 'id'))
app.on('POST',   '/api/v1/rounds/renew-all', adminTiers, requireModule('module_patrol'))
app.on('POST',   '/api/v1/daily-reports/send-now', adminTiers, requireModule('module_patrol'), requireTenantFlag((f) => f.module_patrol.allow_daily_reports))
app.on('GET',    '/api/v1/daily-reports/log', adminTiers, requireModule('module_patrol'), requireTenantFlag((f) => f.module_patrol.allow_daily_reports))
app.on('GET',    '/api/v1/field/routes', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('POST',   '/api/v1/field/runs/start', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('POST',   '/api/v1/field/runs/:id/complete', requireModule('module_patrol'), requirePermission('patrol_route'))
app.on('GET',    '/api/v1/checkpoints/:id/qr', adminTiers, requireModule('module_qr_generator'), ownedRow('checkpoints', 'checkpoint_id', 'id'))
app.on('GET',    '/api/v1/guards', adminTiers)
app.on('POST',   '/api/v1/guards', adminTiers)
app.on('PATCH',  '/api/v1/guards/:id', adminTiers)

app.on('POST',   '/api/v1/incidents', incidentsMod, requirePermission('report_incident'))
app.on('GET',    '/api/v1/incidents', incidentsMod, requirePermission('incident_tickets'))
app.on('GET',    '/api/v1/incidents/:id', incidentsMod, requirePermission('incident_tickets'))
app.on('POST',   '/api/v1/incidents/:id/updates', incidentsMod, requirePermission('incident_tickets'))
app.on('PATCH',  '/api/v1/incidents/:id', adminTiers, incidentsMod)
app.on('PATCH',  '/api/v1/incidents/:id/resolve', adminTiers, incidentsMod)
app.on('DELETE', '/api/v1/incidents/:id', adminTiers, incidentsMod)

app.on(['GET', 'POST'], '/api/v1/admin/configs', adminTiers)
app.on('POST',   '/api/v1/admin/test-gmail', adminTiers, requireModule('module_integrations'),
       requireTenantFlag((f) => f.module_integrations.channels.gmail_oauth))
app.on('GET',    '/api/v1/access-control/roles', adminTiers)
app.on('PUT',    '/api/v1/access-control/roles/:role', superOnly)
app.on('PATCH',  '/api/v1/access-control/guards/:id', adminTiers)
app.on(['GET', 'POST', 'PATCH'], '/api/v1/super-admin/*', superOnly)

// ==========================================
// R2 MEDIA STREAMING ROUTE
// ==========================================
app.get('/api/v1/media/*', async (c) => {
  try {
    const url = new URL(c.req.url);
    const fileKey = decodeURIComponent(url.pathname.replace('/api/v1/media/', ''));

    if (!fileKey || fileKey.includes('..') || fileKey.startsWith('/') || !/^[A-Za-z0-9_\-./]+$/.test(fileKey)) {
      return c.json({ error_code: 'BAD_REQUEST', message: 'Invalid file key.' }, 400);
    }

    const object = await c.env.R2_BUCKET.get(fileKey);
    if (!object) {
      return c.json({ error_code: 'NOT_FOUND', message: 'Image not found in storage.' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    const ct = object.httpMetadata?.contentType;
    headers.set('Content-Type', ct === 'image/png' ? 'image/png' : ct === 'image/svg+xml' ? 'image/svg+xml' : 'image/jpeg');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    headers.set('Cache-Control', 'private, max-age=86400');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin'); // lets the admin console show <img>

    return new Response(object.body, { status: 200, headers });
  } catch (error: any) {
    return c.json({ error_code: 'SERVER_ERROR', message: errMsg(error, 'Failed to stream media.') }, 500);
  }
});

// ==========================================
// 1. AUTH ROUTES (WITH DUAL-LAYER FEATURE INJECTION)
// ==========================================
app.post('/api/v1/auth/login', async (c) => {
  try {
    const { employee_code, password, device_id } = loginSchema.parse(await c.req.json())
    const supabase = getSupabase(c.env)

    const acctKey = `acct:${employee_code.trim().toLowerCase()}`
    const ipKey = `ip:${c.req.header('CF-Connecting-IP') || 'unknown'}`
    const lockedFor = Math.max(await isLoginLocked(supabase, acctKey), await isLoginLocked(supabase, ipKey))
    if (lockedFor > 0) {
      c.header('Retry-After', String(lockedFor))
      return c.json({ error_code: 'TOO_MANY_ATTEMPTS', message: `Too many failed attempts. Try again in ${Math.ceil(lockedFor / 60)} minute(s).` }, 429)
    }

    const { data: guard } = await supabase.from('guards').select('*').eq('employee_code', employee_code).maybeSingle()
    // Always run a hash so response time doesn't reveal whether the account exists.
    const pw = await verifyPassword(password, guard?.password_hash ?? 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA')
    if (!guard || guard.is_active === false || guard.is_guest === true || !pw.ok) {
      await recordLoginFailure(supabase, acctKey, 5)
      await recordLoginFailure(supabase, ipKey, 30)
      return c.json({ error_code: 'INVALID_CREDENTIALS', message: 'Invalid Login.' }, 401)
    }
    await clearLoginFailures(supabase, acctKey)
    if (pw.needsUpgrade) {
      await supabase.from('guards').update({ password_hash: await hashPassword(password) }).eq('guard_id', guard.guard_id)
    }

    const ctx = await buildAuthContext(supabase, guard, loadUserPerms)
    if (ctx.tier !== 'SUPER_ADMIN' && !ctx.tenant_active) {
      return c.json({ error_code: 'TENANT_INACTIVE', message: 'Your organization is not active.' }, 403)
    }

    // Token carries identity only. Entitlements are re-read from the DB on every request.
    const access_token = await sign({
      sub: guard.guard_id,
      tier: ctx.tier,
      role: ctx.role,
      employee_code: guard.employee_code,
      tenant_id: ctx.tenant_id || '',
      device_id: device_id || 'unknown',
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    }, c.env.JWT_SECRET, 'HS256')

    return c.json({
      access_token,
      refresh_token: 'dummy_refresh_token_for_now',
      server_time_ms: Date.now(),
      guard: {
        guard_id: guard.guard_id,
        full_name: guard.full_name,
        employee_code: guard.employee_code,
        role: ctx.role,
        tier: ctx.tier,
        tenant_id: ctx.tenant_id,
        is_platform_super_admin: ctx.tier === 'SUPER_ADMIN',
        is_super_admin: ctx.tier !== 'USER', // legacy flag kept for older clients: "can use admin console"
        site_location: guard.site_location || 'Main Plant',
        assigned_round_id: guard.assigned_round_id || null,
        assigned_round_ids: guard.assigned_round_ids || [],
      },
      app_permissions: ctx.access.active_permissions,
      visible_modules: uiModules(ctx),
      incident_form_fields: ctx.access.incident_form_fields,
      active_shift: null,
    }, 200)
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ error_code: 'BAD_REQUEST', message: 'Invalid fields.' }, 400)
    return c.json({ error_code: 'SERVER_ERROR', message: 'Server error.' }, 500)
  }
})

// ==========================================
// 2. PATROL SCANS API
// ==========================================
interface CheckpointRow { checkpoint_id: string; lat: any; lng: any; qr_payload: string | null; tenant_id: string | null }

/** The checkpoint must exist AND belong to the caller's organization. */
async function loadCheckpointForScan(supabase: any, auth: AuthContext, checkpointId: string): Promise<CheckpointRow | null> {
  const { data: cp } = await supabase
    .from('checkpoints')
    .select('checkpoint_id, lat, lng, qr_payload, tenant_id')
    .eq('checkpoint_id', checkpointId)
    .maybeSingle()
  if (!cp) return null
  if (auth.tier !== 'SUPER_ADMIN' && cp.tenant_id !== auth.tenant_id) return null
  return cp as CheckpointRow
}

/**
 * Strict: the signature must be a real HMAC made with QR_SECRET (or the signature stored when the
 * checkpoint was created). There is NO coordinate-proximity fallback anymore.
 */
function isValidCheckpointSignature(qrSecret: string, cp: CheckpointRow, signature: string, qrLat: string, qrLng: string): boolean {
  const sig = String(signature || '').trim().toLowerCase()
  if (!sig) return false
  const hmac = (data: string) => CryptoJS.HmacSHA256(data, qrSecret).toString(CryptoJS.enc.Hex)

  if (safeEqual(sig, hmac(`${cp.checkpoint_id}|${cp.lat}|${cp.lng}`))) return true
  if (safeEqual(sig, hmac(`${cp.checkpoint_id}|${qrLat}|${qrLng}`))) return true // legacy QR codes printed with other number formatting

  if (cp.qr_payload) {
    const parts = cp.qr_payload.split('|')
    if (parts.length >= 4 && safeEqual(sig, parts[3].trim().toLowerCase())) return true
  }
  return false
}

/** Server-side geofence: the guard must be physically near the checkpoint (client GPS is only trusted within a radius). */
function isGuardNearCheckpoint(env: Bindings, cp: CheckpointRow, guardLat: any, guardLng: any): boolean {
  const gLat = Number(guardLat), gLng = Number(guardLng), cLat = parseFloat(String(cp.lat)), cLng = parseFloat(String(cp.lng))
  if (![gLat, gLng, cLat, cLng].every(Number.isFinite)) return false
  if (Math.abs(gLat) > 90 || Math.abs(gLng) > 180) return false
  const radius = Number(env.GEOFENCE_RADIUS_M) > 0 ? Number(env.GEOFENCE_RADIUS_M) : 250
  return distanceMeters(gLat, gLng, cLat, cLng) <= radius
}

app.post('/api/v1/scans', async (c) => {
  try {
    const auth = c.get('auth');
    const guard_id = auth.guard_id;

    const body = await c.req.json();
    const {
      client_scan_id, checkpoint_id, qr_lat, qr_lng, signature,
      guard_lat, guard_lng, uptime_seconds, selfie_url, location_photo_url, photo_url
    } = scanSchema.parse(body);

    const supabase = getSupabase(c.env);

    const cp = await loadCheckpointForScan(supabase, auth, checkpoint_id);
    if (!cp) return c.json({ success: false, message: 'Checkpoint not found.' }, 404);

    if (!isValidCheckpointSignature(c.env.QR_SECRET, cp, signature, qr_lat, qr_lng)) {
      return c.json({ success: false, message: 'Invalid or forged QR Code detected.' }, 403);
    }
    if (!isGuardNearCheckpoint(c.env, cp, guard_lat, guard_lng)) {
      return c.json({ success: false, message: 'You are too far from this checkpoint to record a scan.' }, 403);
    }

    const origin = new URL(c.req.url).origin;
    const finalSelfieUrl = await storeImage(c.env.R2_BUCKET, origin, 'scans', 'selfie', selfie_url || photo_url);
    const finalLocationUrl = (await storeImage(c.env.R2_BUCKET, origin, 'scans', 'location', location_photo_url)) || finalSelfieUrl;

    // Expected coordinates come from OUR database, never from the client.
    const { data, error } = await supabase.rpc('log_patrol_scan', {
      p_client_scan_id: client_scan_id,
      p_checkpoint_id: cp.checkpoint_id,
      p_guard_id: guard_id,
      p_guard_lat: guard_lat,
      p_guard_lng: guard_lng,
      p_expected_lat: parseFloat(String(cp.lat)),
      p_expected_lng: parseFloat(String(cp.lng)),
      p_uptime_seconds: uptime_seconds || 0,
      p_photo_url: finalLocationUrl || ''
    });

    if (error) {
      console.error('log_patrol_scan failed:', error);
      return c.json({ success: false, message: 'Could not record scan.' }, 500);
    }

    await supabase
      .from('scans')
      .update({
        selfie_url: finalSelfieUrl,
        location_photo_url: finalLocationUrl,
        guard_lat: guard_lat,
        guard_lng: guard_lng,
        tenant_id: cp.tenant_id
      })
      .eq('client_scan_id', client_scan_id)
      .eq('guard_id', guard_id); // can only touch your own scan

    return c.json({ success: true, verification: data });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: 'Invalid data format' }, 400);
    }
    return c.json({ success: false, message: errMsg(error, 'Server error') }, 500);
  }
});

app.get('/api/v1/scans', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Missing token' }, 401);
    }

    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    } catch (e) {
      return c.json({ success: false, message: 'Invalid or expired token' }, 401);
    }
    const guard_id = payload.sub as string;

    const supabase = getSupabase(c.env);

    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .eq('guard_id', guard_id)
      .order('scan_time', { ascending: false })
      .limit(50);

    if (error) {
      return c.json({ success: false, message: errMsg(error) }, 500);
    }

    return c.json({ success: true, scans: data || [] });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Server error') }, 500);
  }
});

app.get('/api/v1/rounds/:id/scans', async (c) => {
  try {
    const roundId = c.req.param('id');
    const supabase = getSupabase(c.env);

    const [cpRes, guardsRes] = await Promise.all([
      supabase.from('checkpoints').select('checkpoint_id, name, lat, lng').eq('round_id', roundId),
      applyTenant(supabase.from('guards').select('guard_id, full_name, employee_code'), scopeTenant(c))
    ]);

    if (cpRes.error) throw cpRes.error;
    const checkpoints = cpRes.data || [];
    const guardsMap = new Map((guardsRes.data || []).map((g: any) => [g.guard_id, g]));

    const checkpointIds = checkpoints.map((cp) => cp.checkpoint_id);

    let scans: any[] = [];
    if (checkpointIds.length > 0) {
      const { data: scanRecords, error: scanError } = await supabase
        .from('scans')
        .select('*')
        .in('checkpoint_id', checkpointIds)
        .order('scan_time', { ascending: true });

      if (!scanError && scanRecords) {
        scans = scanRecords.map((s) => {
          const matchCp = checkpoints.find((cp) => cp.checkpoint_id === s.checkpoint_id);
          const matchGuard = s.guard_id ? guardsMap.get(s.guard_id) : null;
          const coords = extractGuardCoordsFromScan(s);

          return {
            ...s,
            guard_lat: coords.lat,
            guard_lng: coords.lng,
            checkpoint_name: matchCp?.name || s.checkpoint_id,
            expected_lat: matchCp?.lat,
            expected_lng: matchCp?.lng,
            guard_name: matchGuard?.full_name || 'Assigned Guard',
            guard_code: matchGuard?.employee_code || ''
          };
        });
      }
    }

    return c.json({ success: true, scans, checkpoints });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Failed to fetch round scans') }, 500);
  }
});

// ==========================================
// LIVE PATROL TRACKING
// ==========================================
app.post('/api/v1/patrols/session/start', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);
    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    const guard_id = payload.sub as string;

    const { round_id, lat, lng } = await c.req.json();
    const supabase = getSupabase(c.env);

    await supabase
      .from('patrol_sessions')
      .update({ status: 'COMPLETED', end_time: new Date().toISOString() })
      .eq('guard_id', guard_id)
      .eq('round_id', round_id)
      .eq('status', 'ACTIVE');

    const { data: session, error } = await supabase
      .from('patrol_sessions')
      .insert([{
        round_id,
        guard_id,
        tenant_id: c.get('auth').tenant_id,
        status: 'ACTIVE',
        start_time: new Date().toISOString(),
        last_lat: lat,
        last_lng: lng,
        last_ping_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    if (lat && lng) {
      await supabase.from('patrol_breadcrumbs').insert([{
        session_id: session.id,
        round_id,
        guard_id,
        lat,
        lng
      }]);
    }

    return c.json({ success: true, session });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Failed to start session') }, 500);
  }
});

app.post('/api/v1/patrols/session/ping', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);
    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    const guard_id = payload.sub as string;

    const { session_id, round_id, lat, lng, is_final_stop } = await c.req.json();
    const supabase = getSupabase(c.env);

    if (lat && lng) {
      await supabase.from('patrol_breadcrumbs').insert([{
        session_id,
        round_id,
        guard_id,
        lat,
        lng
      }]);
    }

    const updates: Record<string, any> = {
      last_lat: lat,
      last_lng: lng,
      last_ping_at: new Date().toISOString()
    };

    if (is_final_stop) {
      updates.status = 'COMPLETED';
      updates.end_time = new Date().toISOString();
    }

    const { data: session } = await supabase
      .from('patrol_sessions')
      .update(updates)
      .eq('id', session_id)
      .select()
      .maybeSingle();

    return c.json({ success: true, session });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Ping failed') }, 500);
  }
});

app.get('/api/v1/rounds/:id/live-trail', async (c) => {
  try {
    const roundId = c.req.param('id');
    const supabase = getSupabase(c.env);

    const { data: session } = await supabase
      .from('patrol_sessions')
      .select('*')
      .eq('round_id', roundId)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return c.json({ success: true, has_session: false, breadcrumbs: [] });
    }

    const { data: breadcrumbs } = await supabase
      .from('patrol_breadcrumbs')
      .select('lat, lng, recorded_at')
      .eq('session_id', session.id)
      .order('recorded_at', { ascending: true });

    const { data: guard } = await supabase
      .from('guards')
      .select('full_name, employee_code')
      .eq('guard_id', session.guard_id)
      .maybeSingle();

    return c.json({
      success: true,
      has_session: true,
      session: {
        ...session,
        guard_name: guard?.full_name || 'Assigned Guard',
        guard_code: guard?.employee_code || ''
      },
      breadcrumbs: breadcrumbs || []
    });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

app.post('/api/v1/patrols/sync', async (c) => {
  try {
    const auth = c.get('auth');
    const guard_id = auth.guard_id;
    const origin = new URL(c.req.url).origin;
    const body = await c.req.json();

    if (!Array.isArray(body.scans) || body.scans.length > 50) {
      return c.json({ success: false, message: 'Send between 1 and 50 scans per sync.' }, 400);
    }
    const results: any[] = [];
    const supabase = getSupabase(c.env);

    for (const scan of body.scans) {
      const clientScanId = String(scan?.client_scan_id || '');
      if (!clientScanId || !scan?.checkpoint_id) {
        results.push({ client_scan_id: clientScanId, status: 'failed', reason: 'Malformed scan' });
        continue;
      }

      const cp = await loadCheckpointForScan(supabase, auth, String(scan.checkpoint_id));
      if (!cp || !isValidCheckpointSignature(c.env.QR_SECRET, cp, String(scan.signature || ''), String(scan.qr_lat), String(scan.qr_lng))) {
        results.push({ client_scan_id: clientScanId, status: 'failed', reason: 'Invalid Signature' });
        continue;
      }
      if (!isGuardNearCheckpoint(c.env, cp, scan.guard_lat, scan.guard_lng)) {
        results.push({ client_scan_id: clientScanId, status: 'failed', reason: 'Outside checkpoint range' });
        continue;
      }

      const selfieUrl = (await storeImage(c.env.R2_BUCKET, origin, 'scans', 'selfie', scan.selfie_url)) || '';
      const locationUrl = (await storeImage(c.env.R2_BUCKET, origin, 'scans', 'location', scan.location_photo_url)) || '';

      const { data, error } = await supabase.rpc('log_patrol_scan', {
        p_client_scan_id: clientScanId,
        p_checkpoint_id: cp.checkpoint_id,
        p_guard_id: guard_id,
        p_guard_lat: scan.guard_lat,
        p_guard_lng: scan.guard_lng,
        p_expected_lat: parseFloat(String(cp.lat)),
        p_expected_lng: parseFloat(String(cp.lng)),
        p_uptime_seconds: scan.uptime_seconds || 0,
        p_photo_url: locationUrl || selfieUrl
      });

      if (error) {
        console.error('log_patrol_scan failed:', error);
        results.push({ client_scan_id: clientScanId, status: 'failed', reason: 'DB Error' });
        continue;
      }

      await supabase
        .from('scans')
        .update({
          selfie_url: selfieUrl,
          location_photo_url: locationUrl,
          guard_lat: scan.guard_lat,
          guard_lng: scan.guard_lng,
          tenant_id: cp.tenant_id
        })
        .eq('client_scan_id', clientScanId)
        .eq('guard_id', guard_id);

      results.push({ client_scan_id: clientScanId, status: data.status, verification: data });
    }

    return c.json({ success: true, synced_items: results });

  } catch (error) {
    return c.json({ success: false, message: errMsg(error, 'Sync failed') }, 500);
  }
});

// ==========================================
// 3. SHIFT TRACKING API
// ==========================================
app.get('/api/v1/shifts/active', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Missing token' }, 401);
    }

    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    const guard_id = payload.sub as string;

    const supabase = getSupabase(c.env);

    const { data: activeShift, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('guard_id', guard_id)
      .eq('status', 'ACTIVE')
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return c.json({ success: false, message: errMsg(error) }, 500);

    return c.json({
      success: true,
      is_active: !!activeShift,
      shift: activeShift || null
    });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Server error') }, 500);
  }
});

app.post('/api/v1/shifts/start', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Missing token' }, 401);
    }

    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    const guard_id = payload.sub as string;

    const supabase = getSupabase(c.env);

    const { data: existingShift } = await supabase
      .from('shifts')
      .select('id')
      .eq('guard_id', guard_id)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    if (existingShift) {
      return c.json({ success: true, message: 'Shift already active', shift: existingShift });
    }

    const { data: newShift, error } = await supabase
      .from('shifts')
      .insert([{
        guard_id,
        tenant_id: c.get('auth').tenant_id,
        status: 'ACTIVE',
        start_time: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) return c.json({ success: false, message: errMsg(error) }, 500);

    return c.json({ success: true, message: 'Shift started', shift: newShift }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Server error') }, 500);
  }
});

app.post('/api/v1/shifts/end', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Missing token' }, 401);
    }

    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    const guard_id = payload.sub as string;

    const supabase = getSupabase(c.env);

    const { data: updatedShifts, error } = await supabase
      .from('shifts')
      .update({
        status: 'COMPLETED',
        end_time: new Date().toISOString()
      })
      .eq('guard_id', guard_id)
      .eq('status', 'ACTIVE')
      .select();

    if (error) return c.json({ success: false, message: errMsg(error) }, 500);

    return c.json({
      success: true,
      message: 'Shift ended',
      shifts_closed: updatedShifts?.length || 0
    });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Server error') }, 500);
  }
});

// ==========================================
// 4. ROUNDS & CHECKPOINTS CRUD API
// ==========================================
app.get('/api/v1/rounds', async (c) => {
  try {
    const supabase = getSupabase(c.env);

    const [roundsRes, cpRes, guardsRes] = await Promise.all([
      applyTenant(supabase.from('rounds').select('*'), scopeTenant(c)).order('created_at', { ascending: false }),
      applyTenant(supabase.from('checkpoints').select('checkpoint_id, round_id, name, lat, lng, qr_payload'), scopeTenant(c)),
      applyTenant(supabase.from('guards').select('*'), scopeTenant(c))
    ]);

    if (roundsRes.error) return c.json({ success: false, message: errMsg(roundsRes.error) }, 500);
    if (cpRes.error) return c.json({ success: false, message: errMsg(cpRes.error) }, 500);

    const rounds = roundsRes.data || [];
    const checkpoints = cpRes.data || [];
    const guards = guardsRes.data || [];

    const roundsWithCheckpoints = rounds.map((round) => {
      const assignedGuards = guards.filter((g: any) => {
        const ids: string[] = Array.isArray(g.assigned_round_ids) ? g.assigned_round_ids : [];
        return g.assigned_round_id === round.id || ids.includes(round.id);
      }).map((g: any) => ({
        guard_id: g.guard_id,
        full_name: g.full_name,
        employee_code: g.employee_code
      }));

      const viewer = c.get('auth');
      return {
        ...round,
        // Field users never need colleagues' details. No-login guests also never get QR signatures:
        // they must scan the real QR code (the existing logged-in app still reads qr_payload, so it is kept for them).
        assigned_guards: viewer.tier === 'USER' ? [] : assignedGuards,
        checkpoints: checkpoints
          .filter((cp) => cp.round_id === round.id)
          .map((cp) => ({
            id: cp.checkpoint_id,
            name: cp.name,
            lat: cp.lat,
            lng: cp.lng,
            ...(viewer.is_guest ? {} : { qr_payload: cp.qr_payload })
          }))
      };
    });

    return c.json({ success: true, rounds: roundsWithCheckpoints });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Server error') }, 500);
  }
});

app.post('/api/v1/rounds', async (c) => {
  try {
    const body = await c.req.json();
    const { id, name, checkpoints } = roundSaveSchema.parse(body);
    const supabase = getSupabase(c.env);

    let activeRoundId = id;
    const authCtx = c.get('auth');
    const roundTenant = authCtx.tenant_id;
    if (!roundTenant) return c.json({ success: false, message: 'Select a tenant before creating routes.' }, 400);

    if (activeRoundId) {
      const { data: existingRound } = await supabase.from('rounds').select('tenant_id').eq('id', activeRoundId).maybeSingle();
      if (!existingRound || (authCtx.tier !== 'SUPER_ADMIN' && existingRound.tenant_id !== roundTenant)) {
        return c.json({ success: false, message: 'Not Found' }, 404);
      }
      const { error: updateError } = await supabase
        .from('rounds')
        .update({ name })
        .eq('id', activeRoundId);

      if (updateError) return c.json({ success: false, message: errMsg(updateError) }, 500);

      await supabase.from('checkpoints').delete().eq('round_id', activeRoundId);
    } else {
      const { data: newRound, error: insertError } = await supabase
        .from('rounds')
        .insert([{ name, tenant_id: roundTenant }])
        .select()
        .single();

      if (insertError) return c.json({ success: false, message: errMsg(insertError) }, 500);
      activeRoundId = newRound.id;
    }

    if (checkpoints.length > 0) {
      const rows = checkpoints.map((cp) => {
        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cp.id);
        const checkpointUuid = isValidUUID ? cp.id : crypto.randomUUID();

        const dataToSign = `${checkpointUuid}|${cp.lat}|${cp.lng}`;
        const signature = CryptoJS.HmacSHA256(dataToSign, c.env.QR_SECRET).toString(CryptoJS.enc.Hex);
        const signedPayload = `${dataToSign}|${signature}`;

        return {
          checkpoint_id: checkpointUuid,
          round_id: activeRoundId,
          name: cp.name,
          lat: cp.lat.toString(),
          lng: cp.lng.toString(),
          qr_payload: signedPayload,
          tenant_id: roundTenant,
          location: `SRID=4326;POINT(${cp.lng} ${cp.lat})`
        };
      });

      const { error: cpInsertError } = await supabase.from('checkpoints').insert(rows);
      if (cpInsertError) {
        return c.json({ success: false, message: errMsg(cpInsertError) }, 500);
      }
    }

    return c.json({ success: true, round_id: activeRoundId });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: 'Invalid payload', errors: error.errors }, 400);
    }
    return c.json({ success: false, message: errMsg(error, 'Server error') }, 500);
  }
});

app.delete('/api/v1/rounds/:id', async (c) => {
  try {
    const roundId = c.req.param('id');
    const supabase = getSupabase(c.env);

    const { data: doomed } = await supabase.from('rounds').select('tenant_id').eq('id', roundId).maybeSingle();

    const { error } = await supabase.from('rounds').delete().eq('id', roundId);
    if (error) return c.json({ success: false, message: errMsg(error) }, 500);

    // Take the deleted route off every guard that still had it assigned.
    if (doomed?.tenant_id) {
      const { data: members } = await supabase.from('guards').select('guard_id, assigned_round_id, assigned_round_ids').eq('tenant_id', doomed.tenant_id);
      for (const g of members || []) {
        const ids: string[] = Array.isArray(g.assigned_round_ids) ? g.assigned_round_ids : [];
        if (g.assigned_round_id === roundId || ids.includes(roundId)) {
          const keep = ids.filter((x) => x !== roundId);
          await supabase.from('guards').update({
            assigned_round_ids: keep,
            assigned_round_id: g.assigned_round_id === roundId ? keep[0] ?? null : g.assigned_round_id,
          }).eq('guard_id', g.guard_id);
        }
      }
    }

    return c.json({ success: true, message: 'Round deleted' });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Server error') }, 500);
  }
});

// ==========================================
// 5. GUARD MANAGEMENT & HYBRID ACCESS CONTROL
// ==========================================
app.get('/api/v1/guards', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    
    const [guardsRes, roundsRes, extProfilesMap] = await Promise.all([
      (() => {
        const a = c.get('auth');
        let q: any = applyTenant(supabase.from('guards').select('*'), scopeTenant(c));
        if (a.tier !== 'SUPER_ADMIN') q = q.eq('tier', 'USER'); // plant admins manage users only
        return q.order('created_at', { ascending: false });
      })(),
      applyTenant(supabase.from('rounds').select('id, name'), scopeTenant(c)),
      getGuardExtendedProfilesMap(supabase)
    ]);
    const callerAuth = c.get('auth');
    const { data: tenantRows } = await supabase.from('tenants').select('id, name, code');
    const tenantNames = new Map<string, string>((tenantRows || []).map((t: any) => [t.id, t.name]));
    const ceiling = callerAuth.tier === 'SUPER_ADMIN'
      ? PERMISSION_KEYS
      : PERMISSION_KEYS.filter((k) => resolveAccess(callerAuth.tenant_features, Object.fromEntries(PERMISSION_KEYS.map((p) => [p, true]))).active_permissions[k]);

    if (guardsRes.error) throw guardsRes.error;

    const roundsMap = new Map((roundsRes.data || []).map((r: any) => [r.id, r]));

    const guardsWithRounds = await Promise.all((guardsRes.data || []).map(async (g: any) => {
      const ext = extProfilesMap[g.guard_id] || {};

      const rawRoundIds: string[] = Array.isArray(g.assigned_round_ids) && g.assigned_round_ids.length > 0
        ? g.assigned_round_ids
        : (g.assigned_round_id ? [g.assigned_round_id] : []);

      const uniqueRoundIds = Array.from(new Set(rawRoundIds.filter(Boolean)));
      const assignedRounds = uniqueRoundIds
        .map((id) => roundsMap.get(id))
        .filter(Boolean);

      const rawGroups: string[] =
        Array.isArray(g.assignment_groups) && g.assignment_groups.length > 0
          ? g.assignment_groups
          : Array.isArray(ext.assignment_groups) && ext.assignment_groups.length > 0
          ? ext.assignment_groups
          : g.assignment_group
          ? [g.assignment_group]
          : ['Security Operations L1'];

      const uniqueGroups = Array.from(new Set(rawGroups.filter(Boolean)));
      const resolvedEmail = g.email || ext.email || null;
      const resolvedPhone = g.phone || ext.phone || null;

      const rawOverrides = g.app_permissions ?? ext.app_permissions ?? null;
      const hybrid = await resolveEffectivePermissions(supabase, g.role || 'Guard', rawOverrides);

      return {
        guard_id: g.guard_id,
        full_name: g.full_name,
        employee_code: g.employee_code,
        email: resolvedEmail,
        phone: resolvedPhone,
        role: g.role,
        tenant_id: g.tenant_id,
        site_location: g.site_location,
        shift_timing: g.shift_timing,
        is_active: g.is_active,
        created_at: g.created_at,
        reporting_to: g.reporting_to,
        assignment_group: uniqueGroups[0] || 'Security Operations L1',
        assignment_groups: uniqueGroups,
        assigned_round_id: uniqueRoundIds[0] || null,
        assigned_round_ids: uniqueRoundIds.filter((id) => roundsMap.has(id)), // never report deleted routes
        rounds: assignedRounds[0] || null,
        assigned_rounds: assignedRounds,
        tier: g.tier,
        is_guest: g.is_guest === true,
        selfie_url: g.selfie_url || ext.selfie_url || null,
        selfie_url: g.selfie_url || ext.selfie_url || null,
        tenant_name: tenantNames.get(g.tenant_id) || null,
        app_permissions: callerAuth.tier === 'SUPER_ADMIN' ? hybrid.permissions : resolveAccess(callerAuth.tenant_features, hybrid.permissions).active_permissions,
        app_permissions_override: rawOverrides,
        is_custom_override: hybrid.is_custom_override,
        role_defaults: hybrid.role_defaults
      };
    }));

    return c.json({ success: true, guards: guardsWithRounds, tenants: callerAuth.tier === 'SUPER_ADMIN' ? (tenantRows || []) : [], licensed_permission_keys: ceiling, incident_form_fields_all: INCIDENT_FORM_FIELDS.map((f) => f.id) });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Failed to fetch guards') }, 500);
  }
});

// Mobile/Web: the caller's current, fully-resolved access (what the UI may render).
app.get('/api/v1/guards/my-permissions', async (c) => {
  const a = c.get('auth')
  return c.json({
    success: true,
    guard_id: a.guard_id,
    role: a.role,
    tier: a.tier,
    tenant_id: a.tenant_id,
    is_super_admin: a.tier !== 'USER',
    app_permissions: a.access.active_permissions,
    visible_modules: uiModules(a),
    incident_form_fields: a.access.incident_form_fields,
  })
})

// ==========================================
// ACCESS CONTROL ADMIN ENDPOINTS (SUPER ADMIN ONLY)
// ==========================================

// 1. Get All Role Default Templates
app.get('/api/v1/access-control/roles', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase.from('app_role_permissions').select('*');
    if (error) throw error;
    return c.json({ success: true, roles: data || [] });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

// 2. Update a Role Baseline Template
app.put('/api/v1/access-control/roles/:role', async (c) => {
  try {
    const roleName = decodeURIComponent(c.req.param('role'));
    const body = await c.req.json();
    const permissions = body.permissions;

    if (!permissions || typeof permissions !== 'object') {
      return c.json({ success: false, message: 'Invalid permissions payload' }, 400);
    }

    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('app_role_permissions')
      .upsert({
        role_name: roleName,
        permissions: permissions,
        updated_at: new Date().toISOString()
      }, { onConflict: 'role_name' })
      .select()
      .single();

    if (error) throw error;
    return c.json({ success: true, role: data });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

// 3. Industry Admin allocates features to ONE user (clamped to what the tenant bought)
app.patch('/api/v1/access-control/guards/:id', async (c) => {
  try {
    const a = c.get('auth')
    const supabase = getSupabase(c.env)
    const { data: target } = await supabase.from('guards').select('guard_id, full_name, role, tier, tenant_id').eq('guard_id', c.req.param('id')).maybeSingle()
    if (!target || (a.tier !== 'SUPER_ADMIN' && (target.tenant_id !== a.tenant_id || target.tier !== 'USER'))) {
      return c.json({ success: false, message: 'Not Found' }, 404)
    }
    const body = await c.req.json()
    const requested = body.overrides !== undefined ? body.overrides : body.app_permissions
    const overrides = requested ? clampToTenant(await rawTenantFeatures(supabase, target.tenant_id), requested) : null

    await saveGuardExtendedProfile(supabase, target.guard_id, { app_permissions: overrides })
    const { error } = await supabase.from('guards').update({ app_permissions: overrides }).eq('guard_id', target.guard_id)
    if (error) throw error

    const hybrid = await resolveEffectivePermissions(supabase, target.role || 'Guard', overrides)
    const final = resolveAccess(await rawTenantFeatures(supabase, target.tenant_id), hybrid.permissions)
    return c.json({
      success: true,
      guard_id: target.guard_id,
      full_name: target.full_name,
      role: target.role,
      app_permissions: final.active_permissions,
      is_custom_override: hybrid.is_custom_override,
    })
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error) }, 500)
  }
})

// ==========================================
// PLATFORM SUPER ADMIN ONLY: tenants + what each industry bought
// (Industry admins get 404 on every /super-admin route; see gate block.)
// ==========================================
// =====================================================================
// FIELD APP (no password login): guests join an industry with a site code, name, phone and selfie.
// They receive a normal limited token (tier USER), so every existing licence/permission gate still applies.
// =====================================================================
function siteOffsetMinutes(env: Bindings): number {
  return env.SITE_TZ_OFFSET_MIN && Number.isFinite(Number(env.SITE_TZ_OFFSET_MIN)) ? Number(env.SITE_TZ_OFFSET_MIN) : 330;
}
function startOfSiteDayISO(env: Bindings): string {
  const offsetMin = siteOffsetMinutes(env);
  const local = new Date(Date.now() + offsetMin * 60000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMin * 60000).toISOString();
}

app.get('/api/v1/guest/industries', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data } = await supabase.from('tenants').select('id, name, logo_url, address, features, status, guest_join_code');
    const list = (data || [])
      .filter((t: any) => (t.status || 'ACTIVE') === 'ACTIVE' && t.guest_join_code && normalizeTenantFeatures(t.features).module_patrol.allow_guest_enrollment)
      .map((t: any) => ({ id: t.id, name: t.name, logo_url: t.logo_url || null, address: t.address || null }));
    return c.json({ success: true, industries: list });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

app.post('/api/v1/guest/register', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';

    // Throttle by IP (every attempt counts) so this open door cannot be hammered.
    const regKey = `reg:${ip}`;
    const lockedFor = await isLoginLocked(supabase, regKey);
    if (lockedFor > 0) {
      c.header('Retry-After', String(lockedFor));
      return c.json({ success: false, message: 'Too many attempts. Please try again later.' }, 429);
    }
    await recordLoginFailure(supabase, regKey, 30);

    const input = z.object({
      tenant_id: z.string().uuid(),
      join_code: z.string().min(4).max(32),
      full_name: z.string().trim().min(2).max(60),
      phone: z.string().trim().min(8).max(20),
      device_id: z.string().max(120).optional(),
      selfie: z.string().min(100),
    }).parse(await c.req.json());

    const phone = input.phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
    if (!/^\d{8,15}$/.test(phone)) return c.json({ success: false, message: 'Enter a valid mobile number.' }, 400);

    const { data: tenant } = await supabase.from('tenants').select('id, name, logo_url, address, features, status, guest_join_code').eq('id', input.tenant_id).maybeSingle();
    const open = tenant && (tenant.status || 'ACTIVE') === 'ACTIVE' && tenant.guest_join_code && normalizeTenantFeatures(tenant.features).module_patrol.allow_guest_enrollment;
    if (!open) return c.json({ success: false, message: 'This industry is not accepting field guards.' }, 404);

    const codeKey = `code:${ip}:${tenant.id}`;
    if ((await isLoginLocked(supabase, codeKey)) > 0) return c.json({ success: false, message: 'Too many wrong codes. Try again later.' }, 429);
    if (!safeEqual(input.join_code.trim().toUpperCase(), String(tenant.guest_join_code).trim().toUpperCase())) {
      await recordLoginFailure(supabase, codeKey, 8);
      return c.json({ success: false, message: 'Wrong site code.' }, 403);
    }

    const origin = new URL(c.req.url).origin;
    const selfieUrl = await storeImage(c.env.R2_BUCKET, origin, 'guests', 'selfie', input.selfie);
    if (!selfieUrl) return c.json({ success: false, message: 'A clear selfie photo is required.' }, 400);

    const cols = 'guard_id, full_name, employee_code, role, tier, tenant_id, is_active, is_guest';
    const existing = await supabase.from('guards').select(cols).eq('tenant_id', tenant.id).eq('phone', phone).eq('is_guest', true).maybeSingle();
    let guard: any = existing.data;

    if (guard) {
      if (guard.is_active === false) return c.json({ success: false, message: 'This number has been blocked by your administrator.' }, 403);
      await supabase.from('guards').update({ full_name: input.full_name, selfie_url: selfieUrl, last_device_id: input.device_id || null }).eq('guard_id', guard.guard_id);
    } else {
      const base: Record<string, any> = {
        full_name: input.full_name,
        employee_code: `GST-${phone.slice(-10)}-${tenant.id.slice(0, 4)}`,
        password_hash: `!${crypto.randomUUID()}${crypto.randomUUID()}`, // unusable: guests can never password-login
        role: 'Guard',
        tier: 'USER',
        tenant_id: tenant.id,
        is_active: true,
        phone,
        is_guest: true,
        selfie_url: selfieUrl,
        last_device_id: input.device_id || null,
      };
      let ins: any = await supabase.from('guards')
        .insert([{ ...base, site_location: 'Main Plant & Gate 1', shift_timing: 'Morning (06:00 - 14:00)', assignment_group: 'Security Operations L1' }])
        .select(cols).single();
      if (ins.error) ins = await supabase.from('guards').insert([base]).select(cols).single();
      if (ins.error) throw ins.error;
      guard = ins.data;
      // Optional per-industry setting: a brand-new guard starts with freshly renewed routes.
      const joinCfg = await loadTenantConfig(supabase, tenant.id);
      if (joinCfg['RENEW_ON_NEW_GUARD'] === 'true') {
        await supabase.from('rounds').update({ renewed_at: new Date().toISOString() }).eq('tenant_id', tenant.id);
      }
    }

    const full = await supabase.from('guards').select('guard_id, employee_code, role, tier, is_active, tenant_id, app_permissions, is_guest').eq('guard_id', guard.guard_id).single();
    const ctx = await buildAuthContext(supabase, full.data, loadUserPerms);

    const token = await sign({
      sub: guard.guard_id,
      tier: 'USER',
      role: 'Guard',
      employee_code: guard.employee_code,
      tenant_id: tenant.id,
      guest: true,
      device_id: input.device_id || 'unknown',
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    }, c.env.JWT_SECRET, 'HS256');

    return c.json({
      success: true,
      access_token: token,
      guard: { guard_id: guard.guard_id, full_name: input.full_name, phone, tenant_id: tenant.id, tenant_name: tenant.name, tenant_logo_url: tenant.logo_url || null },
      app_permissions: ctx.access.active_permissions,
      incident_form_fields: ctx.access.incident_form_fields,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ success: false, message: 'Please fill name, mobile number, site code and selfie.' }, 400);
    return c.json({ success: false, message: errMsg(error, 'Could not join. Please try again.') }, 500);
  }
});

// =====================================================================
// ROUTE CYCLES, SHARED BOARD, PAUSE / END, RENEWAL
//
// A route is worked in "cycles". A cycle starts at the later of:
//   - the last automatic boundary (midnight, or every N minutes if the route repeats), and
//   - the moment an admin pressed "Renew now".
// Checkpoints scanned by ANY guard during the cycle count towards the route, so when a guard
// has to leave, the next guard simply continues the checkpoints that are still open.
// =====================================================================
const MIN_MS = 60000;

function cycleStartMs(env: Bindings, round: { renew_every_minutes?: number | null; renewed_at?: string | null }, nowMs = Date.now()): number {
  const dayStart = new Date(startOfSiteDayISO(env)).getTime();
  const every = Number(round.renew_every_minutes) > 0 ? Number(round.renew_every_minutes) : 0;
  let start = dayStart;
  if (every > 0) start = dayStart + Math.floor((nowMs - dayStart) / (every * MIN_MS)) * every * MIN_MS;
  const manual = round.renewed_at ? new Date(round.renewed_at).getTime() : 0;
  return Math.max(start, manual);
}

function nextRenewalMs(env: Bindings, round: { renew_every_minutes?: number | null }, nowMs = Date.now()): number {
  const dayStart = new Date(startOfSiteDayISO(env)).getTime();
  const every = Number(round.renew_every_minutes) > 0 ? Number(round.renew_every_minutes) : 24 * 60;
  return dayStart + (Math.floor((nowMs - dayStart) / (every * MIN_MS)) + 1) * every * MIN_MS;
}

// ---------- shifts (configured per industry on the web) ----------
interface ShiftDef { name: string; start: string; end: string }
interface ShiftWindow { name: string; startMs: number; endMs: number }

function parseShifts(raw?: string): ShiftDef[] {
  try {
    const v = JSON.parse(raw || '[]');
    if (!Array.isArray(v)) return [];
    return v
      .filter((s: any) => s && typeof s.name === 'string' && s.name.trim() && /^\d{2}:\d{2}$/.test(String(s.start)) && /^\d{2}:\d{2}$/.test(String(s.end)))
      .slice(0, 6)
      .map((s: any) => ({ name: String(s.name).trim().slice(0, 30), start: s.start, end: s.end }));
  } catch { return []; }
}

function shiftWindows(env: Bindings, shifts: ShiftDef[], _nowMs = Date.now()): ShiftWindow[] {
  const day0 = new Date(startOfSiteDayISO(env)).getTime();
  const out: ShiftWindow[] = [];
  for (const s of shifts) {
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    for (const d of [-1, 0, 1]) {
      const startMs = day0 + d * 86400000 + (sh * 60 + sm) * MIN_MS;
      let endMs = day0 + d * 86400000 + (eh * 60 + em) * MIN_MS;
      if (endMs <= startMs) endMs += 86400000; // night shift that crosses midnight
      out.push({ name: s.name, startMs, endMs });
    }
  }
  return out;
}

function currentShift(env: Bindings, shifts: ShiftDef[], nowMs = Date.now()): ShiftWindow | null {
  return shiftWindows(env, shifts).find((w) => w.startMs <= nowMs && nowMs < w.endMs) || null;
}

const SESSION_COLS = 'id, round_id, guard_id, status, completed_route, start_time, end_time, ended_reason, paused_at, pause_reason';

async function computeRouteBoard(supabase: any, env: Bindings, tenant: string | null | undefined, viewerGuardId: string | null, onlyRoundId?: string) {
  const nowMs = Date.now();
  const dayStartIso = startOfSiteDayISO(env);

  let roundsQ: any = applyTenant(supabase.from('rounds').select('id, name, renew_every_minutes, renewed_at'), tenant).order('name');
  if (onlyRoundId) roundsQ = roundsQ.eq('id', onlyRoundId);
  const roundsRes = await roundsQ;
  if (roundsRes.error) throw roundsRes.error;
  const rounds: any[] = roundsRes.data || [];
  if (rounds.length === 0) return [];
  const roundIds = rounds.map((r) => r.id);

  const [cpsRes, todayRes, openRes] = await Promise.all([
    supabase.from('checkpoints').select('checkpoint_id, round_id, name').in('round_id', roundIds).order('name'),
    supabase.from('patrol_sessions').select(SESSION_COLS).in('round_id', roundIds).gte('start_time', dayStartIso),
    // Runs that started before midnight (night shift) but are still open must stay on the board.
    supabase.from('patrol_sessions').select(SESSION_COLS).in('round_id', roundIds).in('status', ['ACTIVE', 'PAUSED']),
  ]);
  if (cpsRes.error) throw cpsRes.error;
  if (todayRes.error) throw todayRes.error;
  const cps: any[] = cpsRes.data || [];
  const sessionMap = new Map<string, any>();
  for (const s of [...(todayRes.data || []), ...(openRes.data || [])]) sessionMap.set(s.id, s);
  const sessions = [...sessionMap.values()];

  const cycleStarts = new Map<string, number>(rounds.map((r) => [r.id, cycleStartMs(env, r, nowMs)] as [string, number]));
  const minCycle = Math.min(...cycleStarts.values());
  let scans: any[] = [];
  if (cps.length > 0) {
    const { data } = await supabase.from('scans').select('checkpoint_id, guard_id, scan_time')
      .in('checkpoint_id', cps.map((x) => x.checkpoint_id)).gte('scan_time', new Date(minCycle).toISOString()).limit(5000);
    scans = data || [];
  }

  const guardIds = [...new Set([...sessions.map((s) => s.guard_id), ...scans.map((s) => s.guard_id)].filter(Boolean))];
  const nameOf = new Map<string, string>();
  if (guardIds.length > 0) {
    const { data: gs } = await supabase.from('guards').select('guard_id, full_name').in('guard_id', guardIds);
    for (const g of gs || []) nameOf.set(g.guard_id, g.full_name);
  }
  const nm = (id: string) => nameOf.get(id) || 'A guard';
  const ms = (iso: any) => (iso ? new Date(iso).getTime() : 0);

  return rounds.map((r) => {
    const cStart = cycleStarts.get(r.id) as number;
    const rCps = cps.filter((x) => x.round_id === r.id);
    const cpIds = new Set(rCps.map((x) => x.checkpoint_id));

    // Latest scan of each checkpoint inside THIS cycle, by anyone.
    const scanned = new Map<string, { guard_id: string; at: string }>();
    for (const s of scans) {
      if (!cpIds.has(s.checkpoint_id) || ms(s.scan_time) < cStart) continue;
      const prev = scanned.get(s.checkpoint_id);
      if (!prev || s.scan_time > prev.at) scanned.set(s.checkpoint_id, { guard_id: s.guard_id, at: s.scan_time });
    }
    const total = rCps.length;
    const progress = scanned.size;

    const rSess = sessions.filter((s) => s.round_id === r.id);
    const doneSession = rSess.filter((s) => s.completed_route && ms(s.end_time) >= cStart).sort((x, y) => String(y.end_time).localeCompare(String(x.end_time)))[0];
    const active = rSess.filter((s) => s.status === 'ACTIVE' && !s.completed_route);
    const paused = rSess.filter((s) => s.status === 'PAUSED');
    const ended = rSess.filter((s) => s.status === 'ENDED_EARLY' && ms(s.end_time) >= cStart).sort((x, y) => String(y.end_time).localeCompare(String(x.end_time)))[0];

    // Every checkpoint scanned in the cycle means the route is done, even if nobody pressed "Finish".
    const allScanned = total > 0 && progress >= total;
    const lastScan = [...scanned.values()].sort((x, y) => String(y.at).localeCompare(String(x.at)))[0];

    const status: 'DONE' | 'IN_PROGRESS' | 'PAUSED' | 'PARTIAL' | 'PENDING' =
      doneSession || allScanned ? 'DONE' : active.length > 0 ? 'IN_PROGRESS' : paused.length > 0 ? 'PAUSED' : progress > 0 ? 'PARTIAL' : 'PENDING';

    const mine = viewerGuardId ? rSess.find((s) => s.guard_id === viewerGuardId && (s.status === 'ACTIVE' || s.status === 'PAUSED') && !s.completed_route) : undefined;

    return {
      id: r.id,
      name: r.name,
      status,
      checkpoints: rCps.map((x) => {
        const sc = scanned.get(x.checkpoint_id);
        return { id: x.checkpoint_id, name: x.name, scanned: !!sc, scanned_by: sc ? nm(sc.guard_id) : null, scanned_at: sc ? sc.at : null };
      }),
      progress: { scanned: progress, total },
      done_by: status === 'DONE' ? (doneSession ? nm(doneSession.guard_id) : lastScan ? nm(lastScan.guard_id) : null) : null,
      done_at: status === 'DONE' ? (doneSession ? doneSession.end_time : lastScan ? lastScan.at : null) : null,
      on_it: [...new Set(active.map((s) => nm(s.guard_id)))],
      paused_by: [...new Set(paused.map((s) => nm(s.guard_id)))],
      last_ended: ended ? { by: nm(ended.guard_id), reason: ended.ended_reason, at: ended.end_time } : null,
      my_run: mine ? { session_id: mine.id, status: mine.status, paused_at: mine.paused_at } : null,
      renew: {
        every_minutes: r.renew_every_minutes ?? null,
        renewed_at: r.renewed_at ?? null,
        cycle_started_at: new Date(cStart).toISOString(),
        next_renewal_at: new Date(nextRenewalMs(env, r, nowMs)).toISOString(),
      },
    };
  });
}

// All routes of the caller's industry, with the shared status of the current cycle.
app.get('/api/v1/field/routes', async (c) => {
  try {
    const a = c.get('auth');
    if (!a.tenant_id) return c.json({ success: false, message: 'Not Found' }, 404);
    const supabase = getSupabase(c.env);
    const [board, cfg] = await Promise.all([
      computeRouteBoard(supabase, c.env, a.tenant_id, a.guard_id),
      loadTenantConfig(supabase, a.tenant_id),
    ]);
    const shift = currentShift(c.env, parseShifts(cfg['DAILY_REPORT_SHIFTS']));
    return c.json({
      success: true,
      routes: board,
      shift: shift ? { name: shift.name, start_at: new Date(shift.startMs).toISOString(), end_at: new Date(shift.endMs).toISOString() } : null,
      app_permissions: a.access.active_permissions,
      incident_form_fields: a.access.incident_form_fields,
    });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error, 'Could not load routes') }, 500);
  }
});

app.post('/api/v1/field/runs/start', async (c) => {
  try {
    const a = c.get('auth');
    const { round_id, lat, lng } = z.object({ round_id: z.string().uuid(), lat: z.number().optional(), lng: z.number().optional() }).parse(await c.req.json());
    const supabase = getSupabase(c.env);

    const board = await computeRouteBoard(supabase, c.env, a.tenant_id, a.guard_id, round_id);
    const route = board[0];
    if (!route) return c.json({ success: false, message: 'Not Found' }, 404);
    if (route.status === 'DONE') {
      return c.json({ success: false, message: 'This route is already completed for the current round. An admin can renew it.' }, 409);
    }
    if (route.my_run) {
      return c.json({ success: true, session_id: route.my_run.session_id, status: route.my_run.status, resumed: true });
    }

    const { data: session, error } = await supabase.from('patrol_sessions').insert([{
      round_id, guard_id: a.guard_id, tenant_id: a.tenant_id, status: 'ACTIVE', completed_route: false,
      start_time: new Date().toISOString(), last_lat: lat ?? null, last_lng: lng ?? null, last_ping_at: new Date().toISOString(),
    }]).select('id').single();
    if (error) throw error;
    return c.json({ success: true, session_id: session.id, status: 'ACTIVE', resumed: false }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ success: false, message: 'Invalid request' }, 400);
    return c.json({ success: false, message: errMsg(error, 'Could not start route') }, 500);
  }
});

async function loadMySession(supabase: any, a: AuthContext, id: string) {
  const { data } = await supabase.from('patrol_sessions')
    .select('id, round_id, guard_id, tenant_id, status, start_time, end_time, paused_at, paused_seconds, completed_route').eq('id', id).maybeSingle();
  if (!data || data.guard_id !== a.guard_id || data.tenant_id !== a.tenant_id) return null;
  return data;
}

const pausedExtraSeconds = (s: any) => (s.paused_at ? Math.max(0, Math.round((Date.now() - new Date(s.paused_at).getTime()) / 1000)) : 0);

app.post('/api/v1/field/runs/:id/pause', async (c) => {
  try {
    const a = c.get('auth');
    const supabase = getSupabase(c.env);
    const body = await c.req.json().catch(() => ({}));
    const session = await loadMySession(supabase, a, c.req.param('id'));
    if (!session) return c.json({ success: false, message: 'Not Found' }, 404);
    if (session.status === 'PAUSED') return c.json({ success: true, status: 'PAUSED' });
    if (session.status !== 'ACTIVE') return c.json({ success: false, message: 'This run is not active.' }, 409);
    const { error } = await supabase.from('patrol_sessions').update({
      status: 'PAUSED', paused_at: new Date().toISOString(), pause_reason: body?.reason ? String(body.reason).slice(0, 200) : null,
    }).eq('id', session.id);
    if (error) throw error;
    return c.json({ success: true, status: 'PAUSED' });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error, 'Could not pause') }, 500);
  }
});

app.post('/api/v1/field/runs/:id/resume', async (c) => {
  try {
    const a = c.get('auth');
    const supabase = getSupabase(c.env);
    const session = await loadMySession(supabase, a, c.req.param('id'));
    if (!session) return c.json({ success: false, message: 'Not Found' }, 404);
    if (session.status === 'ACTIVE') return c.json({ success: true, status: 'ACTIVE' });
    if (session.status !== 'PAUSED') return c.json({ success: false, message: 'This run has already ended.' }, 409);
    const { error } = await supabase.from('patrol_sessions').update({
      status: 'ACTIVE', paused_at: null, paused_seconds: (session.paused_seconds || 0) + pausedExtraSeconds(session),
    }).eq('id', session.id);
    if (error) throw error;
    return c.json({ success: true, status: 'ACTIVE' });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error, 'Could not resume') }, 500);
  }
});

const END_REASONS = ['SHIFT_ENDING', 'OTHER_WORK', 'EMERGENCY', 'ROUTE_BLOCKED', 'OTHER'] as const;

// The guard stops before finishing. Progress is kept, so the next guard continues what is left.
app.post('/api/v1/field/runs/:id/end', async (c) => {
  try {
    const a = c.get('auth');
    const supabase = getSupabase(c.env);
    const { reason, note } = z.object({ reason: z.enum(END_REASONS), note: z.string().max(300).optional() }).parse(await c.req.json());
    const session = await loadMySession(supabase, a, c.req.param('id'));
    if (!session) return c.json({ success: false, message: 'Not Found' }, 404);
    if (session.status !== 'ACTIVE' && session.status !== 'PAUSED') return c.json({ success: true, completed: !!session.completed_route });

    const board = await computeRouteBoard(supabase, c.env, a.tenant_id, a.guard_id, session.round_id);
    const route = board[0];
    const endedAt = new Date().toISOString();
    const pausedSeconds = (session.paused_seconds || 0) + pausedExtraSeconds(session);

    // Everything was already scanned: this is a normal completion, not an early end.
    if (route && route.progress.total > 0 && route.progress.scanned >= route.progress.total) {
      await supabase.from('patrol_sessions').update({ status: 'COMPLETED', completed_route: true, end_time: endedAt, paused_at: null, paused_seconds: pausedSeconds }).eq('id', session.id);
      return c.json({ success: true, completed: true, done_at: endedAt });
    }

    const { error } = await supabase.from('patrol_sessions').update({
      status: 'ENDED_EARLY', end_time: endedAt, ended_reason: reason, ended_note: note || null, paused_at: null, paused_seconds: pausedSeconds,
    }).eq('id', session.id);
    if (error) throw error;
    return c.json({ success: true, completed: false, scanned: route?.progress.scanned ?? 0, total: route?.progress.total ?? 0 });
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ success: false, message: 'Choose a reason.' }, 400);
    return c.json({ success: false, message: errMsg(error, 'Could not end the route') }, 500);
  }
});

// The server decides whether the route is complete: every checkpoint must be scanned in the current cycle.
app.post('/api/v1/field/runs/:id/complete', async (c) => {
  try {
    const a = c.get('auth');
    const supabase = getSupabase(c.env);
    const session = await loadMySession(supabase, a, c.req.param('id'));
    if (!session) return c.json({ success: false, message: 'Not Found' }, 404);
    if (session.completed_route) return c.json({ success: true, done_at: session.end_time });

    const route = (await computeRouteBoard(supabase, c.env, a.tenant_id, a.guard_id, session.round_id))[0];
    if (!route || route.progress.total === 0) return c.json({ success: false, message: 'This route has no checkpoints.' }, 400);
    const missing = route.checkpoints.filter((x: any) => !x.scanned).map((x: any) => x.name);
    if (missing.length > 0) return c.json({ success: false, message: `${missing.length} checkpoint(s) still to scan.`, missing }, 400);

    const doneAt = new Date().toISOString();
    const { error } = await supabase.from('patrol_sessions').update({
      status: 'COMPLETED', end_time: doneAt, completed_route: true, paused_at: null, paused_seconds: (session.paused_seconds || 0) + pausedExtraSeconds(session),
    }).eq('id', session.id);
    if (error) throw error;
    return c.json({ success: true, done_at: doneAt });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error, 'Could not complete route') }, 500);
  }
});

// ---------- renewal (admins) ----------
app.patch('/api/v1/rounds/:id/renewal', async (c) => {
  try {
    const { renew_every_minutes } = z.object({ renew_every_minutes: z.number().int().min(30).max(1440).nullable() }).parse(await c.req.json());
    const { error } = await getSupabase(c.env).from('rounds').update({ renew_every_minutes }).eq('id', c.req.param('id'));
    if (error) throw error;
    return c.json({ success: true, renew_every_minutes });
  } catch (error) {
    if (error instanceof z.ZodError) return c.json({ success: false, message: 'Repeat must be between 30 minutes and 24 hours.' }, 400);
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

// "Renew now": a fresh cycle starts immediately (for example when a new guard joins).
app.post('/api/v1/rounds/:id/renew', async (c) => {
  try {
    const now = new Date().toISOString();
    const { error } = await getSupabase(c.env).from('rounds').update({ renewed_at: now }).eq('id', c.req.param('id'));
    if (error) throw error;
    return c.json({ success: true, renewed_at: now });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

app.post('/api/v1/rounds/renew-all', async (c) => {
  try {
    const a = c.get('auth');
    const tenantId = a.tier === 'SUPER_ADMIN' ? c.req.query('tenant_id') : a.tenant_id;
    if (!tenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);
    const now = new Date().toISOString();
    const { error } = await getSupabase(c.env).from('rounds').update({ renewed_at: now }).eq('tenant_id', tenantId);
    if (error) throw error;
    return c.json({ success: true, renewed_at: now });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

// Runs that were left open for far too long are closed by the scheduler so the board never shows ghosts.
async function closeStaleRuns(env: Bindings) {
  const supabase = getSupabase(env);
  const cutoff = new Date(Date.now() - 16 * 3600000).toISOString();
  await supabase.from('patrol_sessions')
    .update({ status: 'ENDED_EARLY', end_time: new Date().toISOString(), ended_reason: 'AUTO_CLOSED', paused_at: null })
    .in('status', ['ACTIVE', 'PAUSED']).lt('start_time', cutoff);
}

// =====================================================================
// DAILY SHIFT REPORTS
// =====================================================================
const REASON_LABEL: Record<string, string> = {
  SHIFT_ENDING: 'Shift ending', OTHER_WORK: 'Other work', EMERGENCY: 'Emergency', ROUTE_BLOCKED: 'Route blocked', OTHER: 'Other', AUTO_CLOSED: 'Closed automatically',
};
const localHM = (env: Bindings, ms: number) => new Date(ms + siteOffsetMinutes(env) * MIN_MS).toISOString().slice(11, 16);
const localDate = (env: Bindings, ms: number) => new Date(ms + siteOffsetMinutes(env) * MIN_MS).toISOString().slice(0, 10);
const durationText = (sec: number) => {
  const m = Math.max(0, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

async function buildShiftReport(supabase: any, env: Bindings, tenantName: string, guard: any, wStartMs: number, wEndMs: number, shiftName: string) {
  const wStart = new Date(wStartMs).toISOString(), wEnd = new Date(wEndMs).toISOString();
  const [sessRes, scanRes, incRes] = await Promise.all([
    supabase.from('patrol_sessions').select('id, round_id, status, completed_route, start_time, end_time, ended_reason, ended_note, pause_reason, paused_seconds')
      .eq('guard_id', guard.guard_id).lt('start_time', wEnd).or(`end_time.is.null,end_time.gte.${wStart}`).order('start_time'),
    supabase.from('scans').select('checkpoint_id, scan_time').eq('guard_id', guard.guard_id).gte('scan_time', wStart).lt('scan_time', wEnd).order('scan_time').limit(1000),
    supabase.from('incidents').select('case_number, title, priority, status, reported_at').eq('guard_id', guard.guard_id).gte('reported_at', wStart).lt('reported_at', wEnd).order('reported_at'),
  ]);
  const sessions: any[] = sessRes.data || [], scans: any[] = scanRes.data || [], incidents: any[] = incRes.data || [];

  const roundIds = [...new Set(sessions.map((s) => s.round_id))];
  const roundName = new Map<string, string>();
  const cpsByRound = new Map<string, any[]>();
  if (roundIds.length > 0) {
    const [rr, cc] = await Promise.all([
      supabase.from('rounds').select('id, name').in('id', roundIds),
      supabase.from('checkpoints').select('checkpoint_id, round_id, name').in('round_id', roundIds).order('name'),
    ]);
    for (const r of rr.data || []) roundName.set(r.id, r.name);
    for (const x of cc.data || []) cpsByRound.set(x.round_id, [...(cpsByRound.get(x.round_id) || []), x]);
  }

  const t = (iso: string) => localHM(env, new Date(iso).getTime());
  let completedRuns = 0, endedEarly = 0;
  const rows = sessions.map((s) => {
    const cps = cpsByRound.get(s.round_id) || [];
    const from = new Date(s.start_time).getTime();
    const to = s.end_time ? new Date(s.end_time).getTime() : wEndMs;
    const got = new Set(scans.filter((x) => { const m = new Date(x.scan_time).getTime(); return m >= from && m <= to; }).map((x) => x.checkpoint_id));
    const done = cps.filter((x) => got.has(x.checkpoint_id));
    const missed = cps.filter((x) => !got.has(x.checkpoint_id));
    const active = s.end_time ? new Date(s.end_time).getTime() : wEndMs;
    const worked = Math.max(0, (active - from) / 1000 - (s.paused_seconds || 0));

    let status = 'Closed';
    if (s.completed_route) { status = 'Completed'; completedRuns++; }
    else if (s.status === 'ENDED_EARLY') { status = `Ended early · ${REASON_LABEL[s.ended_reason] || 'Other'}`; endedEarly++; }
    else if (s.status === 'PAUSED') status = `Paused${s.pause_reason ? ' · ' + s.pause_reason : ''} (not resumed)`;
    else if (s.status === 'ACTIVE' && !s.end_time) status = 'Still open at shift end';
    return { name: roundName.get(s.round_id) || 'Route', start: t(s.start_time), end: s.end_time ? t(s.end_time) : '—', worked, status, done, total: cps.length, missed, note: s.ended_note };
  });

  const cell = 'padding:7px 9px;border:1px solid #e2e8f0;font-size:12px;vertical-align:top;';
  const head = 'padding:7px 9px;border:1px solid #e2e8f0;background:#f1f5f9;font-size:11px;text-align:left;color:#475569;';
  const tile = (n: any, l: string) => `<td style="padding:12px;border:1px solid #e2e8f0;text-align:center;"><div style="font-size:22px;font-weight:800;color:#0f172a;">${esc(n)}</div><div style="font-size:11px;color:#64748b;">${esc(l)}</div></td>`;

  const subject = `[Rakshak] Shift report · ${guard.full_name} · ${shiftName} · ${localDate(env, wStartMs)}`;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:680px;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;color:#fff;padding:16px 20px;">
      <h2 style="margin:0;font-size:17px;">Daily shift report</h2>
      <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">${esc(tenantName)} · ${esc(shiftName)} shift (${localHM(env, wStartMs)}–${localHM(env, wEndMs)}) · ${localDate(env, wStartMs)}</p>
    </div>
    <div style="padding:18px 20px;color:#1e293b;font-size:13px;">
      <p style="margin:0 0 12px;"><strong>${esc(guard.full_name)}</strong>${guard.phone ? ' · ' + esc(guard.phone) : ''}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tr>
        ${tile(completedRuns, 'Routes completed')}${tile(endedEarly, 'Ended early')}${tile(scans.length, 'Checkpoints scanned')}${tile(incidents.length, 'Incidents reported')}
      </tr></table>
      <h3 style="margin:0 0 6px;font-size:14px;">Routes</h3>
      ${rows.length === 0 ? '<p style="color:#64748b;">No route was started in this shift.</p>' : `
      <table style="width:100%;border-collapse:collapse;"><tr>
        <th style="${head}">Route</th><th style="${head}">Time</th><th style="${head}">Worked</th><th style="${head}">Checkpoints</th><th style="${head}">Status</th></tr>
        ${rows.map((r) => `<tr>
          <td style="${cell}"><strong>${esc(r.name)}</strong></td>
          <td style="${cell}">${esc(r.start)} – ${esc(r.end)}</td>
          <td style="${cell}">${esc(durationText(r.worked))}</td>
          <td style="${cell}">${r.done.length} of ${r.total}${r.missed.length ? `<div style="color:#b91c1c;font-size:11px;margin-top:3px;">Not scanned: ${esc(r.missed.map((m: any) => m.name).join(', '))}</div>` : ''}</td>
          <td style="${cell}">${esc(r.status)}${r.note ? `<div style="color:#64748b;font-size:11px;margin-top:3px;">“${esc(r.note)}”</div>` : ''}</td></tr>`).join('')}
      </table>`}
      <h3 style="margin:18px 0 6px;font-size:14px;">Incidents</h3>
      ${incidents.length === 0 ? '<p style="color:#64748b;">No incidents reported.</p>' : `
      <table style="width:100%;border-collapse:collapse;"><tr>
        <th style="${head}">Case</th><th style="${head}">Time</th><th style="${head}">Severity</th><th style="${head}">Summary</th><th style="${head}">Status</th></tr>
        ${incidents.map((i) => `<tr>
          <td style="${cell}">${i.case_number ? 'RKS-' + String(i.case_number).padStart(6, '0') : '—'}</td>
          <td style="${cell}">${esc(t(i.reported_at))}</td><td style="${cell}">${esc(i.priority)}</td>
          <td style="${cell}">${esc(i.title)}</td><td style="${cell}">${esc(i.status)}</td></tr>`).join('')}
      </table>`}
      <p style="margin:18px 0 0;color:#94a3b8;font-size:11px;">Sent automatically by Rakshak after the shift ended.</p>
    </div>
  </div>`;

  return { subject, html, hasActivity: sessions.length > 0 || scans.length > 0 || incidents.length > 0 };
}

async function reportRecipients(supabase: any, cfg: Record<string, string>, guard: any): Promise<string[]> {
  const out = new Set<string>();
  for (const e of String(cfg['DAILY_REPORT_EMAILS'] || '').split(/[,;\s]+/)) {
    const ok = safeEmail(e);
    if (ok) out.add(ok);
  }
  if (cfg['DAILY_REPORT_TO_SUPERVISOR'] === 'true' && guard.reporting_to) {
    const { data: sup } = await supabase.from('guards').select('*').eq('guard_id', guard.reporting_to).maybeSingle();
    let email = safeEmail(sup?.email);
    if (!email) {
      const blob = await getGuardExtendedProfilesMap(supabase);
      email = safeEmail(blob?.[guard.reporting_to]?.email);
    }
    if (email) out.add(email);
  }
  return [...out];
}

async function sendTenantEmail(env: Bindings, tenantId: string, recipients: string[], subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase(env);
  const cfg = await loadTenantConfig(supabase, tenantId);
  const tokenResult = await getValidGmailAccessToken(supabase, cfg, `t:${tenantId}:`);
  if (!tokenResult.token) return { ok: false, error: tokenResult.error || 'Gmail is not connected for this industry.' };

  const raw = utf8ToBase64([
    `To: ${recipients.join(', ')}`,
    `Subject: =?utf-8?B?${utf8ToBase64(subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenResult.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const body: any = await res.json().catch(() => ({}));
      return { ok: false, error: body?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error calling Gmail' };
  }
}

async function guardsActiveBetween(supabase: any, tenantId: string, wStart: string, wEnd: string): Promise<any[]> {
  const [s1, s2, s3] = await Promise.all([
    supabase.from('patrol_sessions').select('guard_id').eq('tenant_id', tenantId).lt('start_time', wEnd).or(`end_time.is.null,end_time.gte.${wStart}`).limit(500),
    supabase.from('scans').select('guard_id').eq('tenant_id', tenantId).gte('scan_time', wStart).lt('scan_time', wEnd).limit(2000),
    supabase.from('incidents').select('guard_id').eq('tenant_id', tenantId).gte('reported_at', wStart).lt('reported_at', wEnd).limit(500),
  ]);
  const ids = [...new Set([...(s1.data || []), ...(s2.data || []), ...(s3.data || [])].map((r: any) => r.guard_id).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data } = await supabase.from('guards').select('*').in('guard_id', ids);
  return data || [];
}

/** Scheduler: after each configured shift ends, send one report per guard who worked it. */
async function runDailyReports(env: Bindings) {
  const supabase = getSupabase(env);
  const { data: tenants } = await supabase.from('tenants').select('id, name, features, status');
  const nowMs = Date.now();
  let budget = 40; // reports per run, keeps each scheduled run short

  for (const t of tenants || []) {
    if (budget <= 0) break;
    const f = normalizeTenantFeatures(t.features);
    if ((t.status || 'ACTIVE') !== 'ACTIVE' || !f.module_patrol.allow_daily_reports || !f.module_integrations.channels.gmail_oauth) continue;

    const cfg = await loadTenantConfig(supabase, t.id);
    if (cfg['DAILY_REPORT_ENABLED'] !== 'true') continue;
    const shifts = parseShifts(cfg['DAILY_REPORT_SHIFTS']);
    if (shifts.length === 0) continue;
    const delayMs = (Number(cfg['DAILY_REPORT_DELAY_MIN']) > 0 ? Number(cfg['DAILY_REPORT_DELAY_MIN']) : 15) * MIN_MS;

    // Only shifts that ended recently (grace of 3 hours covers a delayed scheduler run).
    const due = shiftWindows(env, shifts).filter((w) => nowMs >= w.endMs + delayMs && nowMs < w.endMs + delayMs + 3 * 3600000);
    for (const w of due) {
      const guards = await guardsActiveBetween(supabase, t.id, new Date(w.startMs).toISOString(), new Date(w.endMs).toISOString());
      for (const g of guards) {
        if (budget <= 0) break;
        const key = { tenant_id: t.id, guard_id: String(g.guard_id), shift_name: w.name, report_date: localDate(env, w.startMs) };

        // Claim the slot first so two runs can never send the same report twice.
        const claim = await supabase.from('daily_report_log').insert([{ ...key, status: 'PENDING' }]);
        if (claim.error) {
          const { data: existing } = await supabase.from('daily_report_log').select('status').match(key).maybeSingle();
          if (!existing || existing.status !== 'FAILED') continue; // already sent / skipped
        }
        budget--;

        const recipients = await reportRecipients(supabase, cfg, g);
        if (recipients.length === 0) {
          await supabase.from('daily_report_log').update({ status: 'SKIPPED', error: 'No recipient configured' }).match(key);
          continue;
        }
        const report = await buildShiftReport(supabase, env, t.name, g, w.startMs, w.endMs, w.name);
        const sent = await sendTenantEmail(env, t.id, recipients, report.subject, report.html);
        await supabase.from('daily_report_log')
          .update({ status: sent.ok ? 'SENT' : 'FAILED', error: sent.error || null, recipients: recipients.join(', '), sent_at: sent.ok ? new Date().toISOString() : null })
          .match(key);
      }
    }
  }
}

function reportTenant(c: any): string | null {
  const a = c.get('auth') as AuthContext;
  return a.tier === 'SUPER_ADMIN' ? c.req.query('tenant_id') || null : a.tenant_id;
}

// Admins: preview or send today's report so far (also the quickest way to test the email setup).
app.post('/api/v1/daily-reports/send-now', async (c) => {
  try {
    const tenantId = reportTenant(c);
    if (!tenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);
    const supabase = getSupabase(c.env);
    const body = await c.req.json().catch(() => ({}));
    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle();
    const cfg = await loadTenantConfig(supabase, tenantId);

    const wStartMs = new Date(startOfSiteDayISO(c.env)).getTime(), wEndMs = Date.now();
    let guards = await guardsActiveBetween(supabase, tenantId, new Date(wStartMs).toISOString(), new Date(wEndMs).toISOString());
    if (body?.guard_id) guards = guards.filter((g) => g.guard_id === body.guard_id);
    if (guards.length === 0) return c.json({ success: true, empty: true, message: 'No guard has any activity today yet.' });

    // Collect all recipients once (tenant configured emails)
    const recipientsSet = new Set<string>();
    for (const e of String(cfg['DAILY_REPORT_EMAILS'] || '').split(/[,;\s]+/)) {
      const ok = safeEmail(e);
      if (ok) recipientsSet.add(ok);
    }
    const recipients = [...recipientsSet];
    if (recipients.length === 0) {
      return c.json({ success: false, message: 'No recipient email addresses configured in Daily Report settings.' }, 400);
    }

    // Build consolidated summary metrics
    const guardSummaries: any[] = [];
    let totalScansAll = 0;
    let totalIncidentsAll = 0;

    for (const g of guards) {
      const r = await buildShiftReport(supabase, c.env, tenant?.name || 'Your industry', g, wStartMs, wEndMs, 'Today');
      guardSummaries.push({ guard: g, report: r });
    }

    // Query incidents count for the day
    const { count: incCount } = await supabase.from('incidents')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('reported_at', new Date(wStartMs).toISOString());
    totalIncidentsAll = incCount || 0;

    const reportDateStr = localDate(c.env, wStartMs);
    const plantName = tenant?.name || 'Plant Facility';
    const subject = `[Daily Digest] Security & Patrol Briefing - ${plantName} - ${reportDateStr}`;

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:760px;margin:0 auto;padding:24px;background:#f8fafc;color:#0f172a;">
        <div style="background:#0f172a;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:20px;font-weight:bold;">${esc(plantName)} - Daily Patrol Digest</h2>
          <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Date: ${esc(reportDateStr)} | Consolidated Shift Briefing</p>
        </div>
        <div style="background:#ffffff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <h3 style="margin:0 0 14px;font-size:15px;color:#334155;text-transform:uppercase;letter-spacing:0.5px;">Executive Summary</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr>
              <td style="padding:14px;background:#f1f5f9;border-radius:8px;text-align:center;width:33%;">
                <div style="font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Active Personnel</div>
                <div style="font-size:24px;font-weight:bold;color:#0f172a;margin-top:4px;">${guards.length}</div>
              </td>
              <td style="width:2%;"></td>
              <td style="padding:14px;background:#f1f5f9;border-radius:8px;text-align:center;width:33%;">
                <div style="font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Incidents Logged</div>
                <div style="font-size:24px;font-weight:bold;color:${totalIncidentsAll > 0 ? '#dc2626' : '#16a34a'};margin-top:4px;">${totalIncidentsAll}</div>
              </td>
              <td style="width:2%;"></td>
              <td style="padding:14px;background:#f1f5f9;border-radius:8px;text-align:center;width:33%;">
                <div style="font-size:11px;color:#64748b;font-weight:bold;text-transform:uppercase;">Status</div>
                <div style="font-size:14px;font-weight:bold;color:#16a34a;margin-top:8px;">COMPLETED</div>
              </td>
            </tr>
          </table>

          <h3 style="margin:18px 0 10px;font-size:14px;color:#334155;">Guard Patrol Performance</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;">
            <tr style="background:#f8fafc;border-bottom:2px solid #cbd5e1;text-align:left;">
              <th style="padding:10px;">Guard Name</th>
              <th style="padding:10px;">Emp Code</th>
              <th style="padding:10px;">Contact</th>
              <th style="padding:10px;">Status</th>
            </tr>
            ${guards.map((g) => `
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:10px;font-weight:bold;color:#0f172a;">${esc(g.full_name)}</td>
                <td style="padding:10px;font-family:monospace;color:#64748b;">${esc(g.employee_code || '—')}</td>
                <td style="padding:10px;color:#475569;">${esc(g.phone || '—')}</td>
                <td style="padding:10px;"><span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:11px;font-weight:bold;">Active On Duty</span></td>
              </tr>
            `).join('')}
          </table>

          <div style="margin-top:24px;padding:14px;background:#f8fafc;border-radius:8px;border:1px dashed #cbd5e1;font-size:12px;color:#64748b;">
            💡 <strong>Export Notice:</strong> Detailed Excel workbooks with GPS timestamps, checkpoint sequences, and incident tickets can be downloaded on-demand from the <strong>Patrol Reports</strong> tab.
          </div>
        </div>
      </div>
    `;

    if (body?.preview) {
      return c.json({ success: true, subject, html, guards: guards.length });
    }

    // Send single consolidated email to all plant recipients
    const res = await sendTenantEmail(c.env, tenantId, recipients, subject, html);
    if (!res.ok) {
      return c.json({ success: false, message: res.error || 'Failed to send consolidated email' }, 500);
    }

    // Record in daily_report_log
    try {
      await supabase.from('daily_report_log').insert({
        tenant_id: tenantId,
        guard_id: guards[0].guard_id,
        shift_name: 'Consolidated Day Digest',
        report_date: reportDateStr,
        status: 'SENT',
        recipients: recipients.join(', '),
        sent_at: new Date().toISOString()
      });
    } catch (logErr) {
      console.warn('Could not insert daily_report_log:', logErr);
    }

    return c.json({ success: true, sent: 1, guards: guards.length, message: `Consolidated briefing sent to ${recipients.length} recipient(s).` });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error, 'Could not send consolidated report') }, 500);
  }
});

app.get('/api/v1/daily-reports/log', async (c) => {
  try {
    const tenantId = reportTenant(c);
    if (!tenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);
    const supabase = getSupabase(c.env);
    const { data } = await supabase.from('daily_report_log').select('guard_id, shift_name, report_date, status, recipients, error, sent_at, created_at')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(40);
    const rows: any[] = data || [];
    const names = new Map<string, string>();
    const ids = [...new Set(rows.map((r) => r.guard_id))];
    if (ids.length > 0) {
      const { data: gs } = await supabase.from('guards').select('guard_id, full_name').in('guard_id', ids);
      for (const g of gs || []) names.set(g.guard_id, g.full_name);
    }
    return c.json({ success: true, log: rows.map((r) => ({ ...r, guard_name: names.get(r.guard_id) || 'Unknown' })) });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

// =====================================================================
// DASHBOARD SUMMARY (admins): one call that feeds the Overview page.
// A block is null when the industry did not buy that module, so the UI never shows it.
// =====================================================================
app.get('/api/v1/dashboard/summary', async (c) => {
  try {
    const a = c.get('auth');
    const supabase = getSupabase(c.env);
    const tenant = scopeTenant(c);
    const isSuper = a.tier === 'SUPER_ADMIN';
    const wantPatrol = isSuper || a.access.visible_modules.module_patrol === true;
    const wantIncidents = isSuper || a.access.visible_modules.module_incidents === true;

    const offsetMin = siteOffsetMinutes(c.env);
    const dayStart = startOfSiteDayISO(c.env);
    const dateKey = (ts: number) => new Date(ts + offsetMin * 60000).toISOString().slice(0, 10);

    const out: any = { success: true, generated_at: new Date().toISOString(), guards: null, patrol: null, incidents: null };

    // ---- people ----
    const { data: people } = await applyTenant(supabase.from('guards').select('guard_id, is_active, is_guest, tier'), tenant);
    const field = (people || []).filter((g: any) => g.tier === 'USER');
    out.guards = { total: field.length, active: field.filter((g: any) => g.is_active !== false).length, guests: field.filter((g: any) => g.is_guest === true).length };

    // ---- patrol ----
    if (wantPatrol) {
      const [board, scansRes, activeRes, completedSessionsRes] = await Promise.all([
        computeRouteBoard(supabase, c.env, tenant, null),
        applyTenant(supabase.from('scans').select('*', { count: 'exact', head: true }), tenant).gte('scan_time', dayStart),
        applyTenant(supabase.from('patrol_sessions').select('guard_id'), tenant).eq('status', 'ACTIVE'),
        applyTenant(supabase.from('patrol_sessions').select('round_id, completed_route, end_time, start_time, status'), tenant)
          .or('completed_route.eq.true,status.eq.COMPLETED')
          .gte('start_time', dayStart),
      ]);

      // Collect round/route IDs that completed at least one run today
      const routesDoneTodayIds = new Set(
        (completedSessionsRes.data || []).map((s: any) => s.round_id).filter(Boolean)
      );

      // Route is counted completed today if marked DONE on board OR completed earlier today
      const uniqueDoneRoutes = new Set([
        ...board.filter((r: any) => r.status === 'DONE').map((r: any) => r.id),
        ...Array.from(routesDoneTodayIds)
      ]);

      const count = (st: string) => board.filter((r: any) => r.status === st).length;
      out.patrol = {
        routes_total: board.length,
        routes_done: uniqueDoneRoutes.size,
        routes_in_progress: count('IN_PROGRESS'),
        routes_paused: count('PAUSED'),
        routes_partial: count('PARTIAL'),
        routes_pending: count('PENDING'),
        active_guards: new Set((activeRes.data || []).map((x: any) => x.guard_id)).size,
        scans_today: scansRes.count ?? 0,
        routes: board.slice(0, 20).map((r: any) => ({
          id: r.id, name: r.name, status: r.status, done_by: r.done_by, done_at: r.done_at,
          on_it: r.on_it, paused_by: r.paused_by, progress: r.progress,
        })),
      };
    }

    // ---- incidents ----
    if (wantIncidents) {
      const sevenDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString();
      const [totalRes, resolvedRes, openRes, weekRes, recentRes] = await Promise.all([
        applyTenant(supabase.from('incidents').select('*', { count: 'exact', head: true }), tenant),
        applyTenant(supabase.from('incidents').select('*', { count: 'exact', head: true }), tenant).in('status', ['RESOLVED', 'CLOSED']),
        applyTenant(supabase.from('incidents').select('priority'), tenant).not('status', 'in', '(RESOLVED,CLOSED)').limit(2000),
        applyTenant(supabase.from('incidents').select('reported_at'), tenant).gte('reported_at', sevenDaysAgo).limit(3000),
        applyTenant(supabase.from('incidents').select('client_incident_id, case_number, title, priority, status, reported_at, guard_id'), tenant).order('reported_at', { ascending: false }).limit(6),
      ]);

      const byPriority: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
      for (const r of openRes.data || []) {
        const p = String(r.priority || 'P3').slice(0, 2);
        byPriority[p] = (byPriority[p] || 0) + 1;
      }

      const buckets = new Map<string, number>();
      for (let i = 6; i >= 0; i--) buckets.set(dateKey(Date.now() - i * 86400000), 0);
      for (const r of weekRes.data || []) {
        const k = dateKey(new Date(r.reported_at).getTime());
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + 1);
      }

      const recent: any[] = recentRes.data || [];
      const gids = [...new Set(recent.map((r) => r.guard_id).filter(Boolean))];
      const reporter = new Map<string, string>();
      if (gids.length > 0) {
        const { data: gs } = await supabase.from('guards').select('guard_id, full_name').in('guard_id', gids);
        for (const g of gs || []) reporter.set(g.guard_id, g.full_name);
      }

      const total = totalRes.count ?? 0, resolved = resolvedRes.count ?? 0;
      out.incidents = {
        total,
        resolved,
        open: Math.max(0, total - resolved),
        open_by_priority: byPriority,
        last7: [...buckets.entries()].map(([date, count]) => ({ date, count })),
        recent: recent.map((r) => ({
          id: r.client_incident_id,
          case_number: r.case_number ?? null,
          title: r.title,
          priority: r.priority,
          status: r.status,
          reported_at: r.reported_at,
          reporter: r.guard_id ? reporter.get(r.guard_id) || null : null,
        })),
      };
    }

    return c.json(out);
  } catch (error) {
    return c.json({ success: false, message: errMsg(error, 'Could not load the overview') }, 500);
  }
});

// Reports WHAT KIND of database key the Worker is using. Never returns the key or any part of it.
app.get('/api/v1/super-admin/diagnostics', async (c) => {
  const key = String(c.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  let kind = 'unknown';
  if (key.startsWith('sb_secret_')) kind = 'sb_secret';
  else if (key.startsWith('sb_publishable_')) kind = 'sb_publishable';
  else if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      kind = payload.role === 'service_role' ? 'service_role' : payload.role === 'anon' ? 'anon' : 'unknown';
    } catch {}
  }
  const bypassesRls = kind === 'service_role' || kind === 'sb_secret';
  return c.json({
    success: true,
    key_kind: kind,
    bypasses_rls: bypassesRls,
    message: bypassesRls
      ? 'OK: the server uses a key that bypasses row-level security.'
      : 'The server is using a PUBLIC database key. Replace SUPABASE_SERVICE_ROLE_KEY with the service_role key.',
  });
});

// Converts any remaining plain-text passwords to PBKDF2 hashes, a few per call (hashing is CPU heavy).
app.get('/api/v1/super-admin/password-hashing', async (c) => {
  const supabase = getSupabase(c.env);
  const { count } = await supabase.from('guards').select('guard_id', { count: 'exact', head: true }).not('password_hash', 'like', 'pbkdf2$%');
  return c.json({ success: true, plaintext_remaining: count ?? 0 });
});
app.post('/api/v1/super-admin/password-hashing', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data: rows } = await supabase.from('guards').select('guard_id, password_hash').not('password_hash', 'like', 'pbkdf2$%').limit(5);
    for (const r of rows || []) {
      if (!r.password_hash) continue;
      await supabase.from('guards').update({ password_hash: await hashPassword(String(r.password_hash)) }).eq('guard_id', r.guard_id);
    }
    const { count } = await supabase.from('guards').select('guard_id', { count: 'exact', head: true }).not('password_hash', 'like', 'pbkdf2$%');
    return c.json({ success: true, hashed: (rows || []).length, plaintext_remaining: count ?? 0 });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

// The QR secret never leaves the server: the console asks us for the signed QR link of a checkpoint.
app.get('/api/v1/checkpoints/:id/qr', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data: cp } = await supabase.from('checkpoints').select('checkpoint_id, lat, lng').eq('checkpoint_id', c.req.param('id')).maybeSingle();
    if (!cp) return c.json({ success: false, message: 'Not Found' }, 404);
    const data = `${cp.checkpoint_id}|${cp.lat}|${cp.lng}`;
    const signature = CryptoJS.HmacSHA256(data, c.env.QR_SECRET).toString(CryptoJS.enc.Hex);
    await supabase.from('checkpoints').update({ qr_payload: `${data}|${signature}` }).eq('checkpoint_id', cp.checkpoint_id);
    return c.json({ success: true, payload: `rakshak://cp?id=${cp.checkpoint_id}&lat=${cp.lat}&lng=${cp.lng}&s=${signature}` });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

// Run after rotating QR_SECRET: re-signs every checkpoint so QR codes made with the old secret stop working.
app.post('/api/v1/super-admin/resign-checkpoints', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data: cps, error } = await supabase.from('checkpoints').select('checkpoint_id, lat, lng').range(0, 999);
    if (error) throw error;
    const list = cps || [];
    for (let i = 0; i < list.length; i += 25) {
      await Promise.all(list.slice(i, i + 25).map((cp: any) => {
        const data = `${cp.checkpoint_id}|${cp.lat}|${cp.lng}`;
        const signature = CryptoJS.HmacSHA256(data, c.env.QR_SECRET).toString(CryptoJS.enc.Hex);
        return supabase.from('checkpoints').update({ qr_payload: `${data}|${signature}` }).eq('checkpoint_id', cp.checkpoint_id);
      }));
    }
    return c.json({ success: true, resigned: list.length, more_may_exist: list.length === 1000 });
  } catch (error) {
    return c.json({ success: false, message: errMsg(error) }, 500);
  }
});

app.get('/api/v1/super-admin/tenants', async (c) => {
  try {
    const supabase = getSupabase(c.env)
    const { data, error } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return c.json({ success: true, tenants: data || [] })
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error) }, 500)
  }
})

app.post('/api/v1/super-admin/tenants', async (c) => {
  try {
    const body = await c.req.json()
    const name = String(body.name || '').trim()
    if (!name) return c.json({ success: false, message: 'Tenant name is required.' }, 400)
    const supabase = getSupabase(c.env)
    const { data, error } = await supabase
      .from('tenants')
      .insert([{
        name,
        // tenants.code is NOT NULL + unique in this database: derive a short readable one from the name.
        code: (name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'TENANT') + '-' + crypto.randomUUID().slice(0, 4).toUpperCase(),
        status: 'ACTIVE',
        features: normalizeTenantFeatures(body.features),
      }])
      .select().single()
    if (error) throw error
    return c.json({ success: true, tenant: data }, 201)
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error) }, 500)
  }
})

app.patch('/api/v1/super-admin/tenants/:id', async (c) => {
  try {
    const body = await c.req.json()
    const supabase = getSupabase(c.env)
    const patch: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.features !== undefined) patch.features = normalizeTenantFeatures(body.features)
    if (body.status !== undefined) {
      if (!['ACTIVE', 'SUSPENDED'].includes(body.status)) return c.json({ success: false, message: 'Invalid status.' }, 400)
      patch.status = body.status
    }
    if (body.name !== undefined) patch.name = String(body.name).trim()
    if (body.address !== undefined) patch.address = body.address ? String(body.address).trim() : null
    if (body.logo_base64 !== undefined) {
      if (!body.logo_base64) {
        patch.logo_url = null
      } else {
        const origin = new URL(c.req.url).origin
        let uploaded = null;
        if (c.env.R2_BUCKET) {
          uploaded = await storeBrandLogo(c.env.R2_BUCKET, origin, c.req.param('id'), body.logo_base64);
        }
        if (!uploaded) return c.json({ success: false, message: 'Invalid logo. Use PNG, JPG, or SVG under 5MB.' }, 400)
        patch.logo_url = uploaded
      }
    } else if (body.logo_url !== undefined) {
      patch.logo_url = body.logo_url ? String(body.logo_url).trim() : null
    }
    if (body.guest_join_code !== undefined) {
      const code = String(body.guest_join_code || '').trim()
      if (code && !/^[A-Za-z0-9]{6,12}$/.test(code)) {
        return c.json({ success: false, message: 'Site code must be 6-12 letters or digits.' }, 400)
      }
      patch.guest_join_code = code || null
    }
    const { data, error } = await supabase.from('tenants').update(patch).eq('id', c.req.param('id')).select('*').single()
    if (error) throw error

    // Downgrade cascade: strip revoked features from every guard override in this tenant.
    if (body.features !== undefined) {
      const { data: members } = await supabase.from('guards').select('guard_id, app_permissions').eq('tenant_id', c.req.param('id')).not('app_permissions', 'is', null)
      for (const m of members || []) {
        await supabase.from('guards').update({ app_permissions: clampToTenant(patch.features, m.app_permissions) }).eq('guard_id', m.guard_id)
      }
    }
    return c.json({ success: true, tenant: data })
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error) }, 500)
  }
})

// Create the Industry Admin (CSO / plant head) for a tenant
app.post('/api/v1/super-admin/tenants/:id/admins', async (c) => {
  try {
    const b = await c.req.json()
    if (!b.employee_code || !b.full_name || !b.password || String(b.password).length < 8) {
      return c.json({ success: false, message: 'employee_code, full_name and a password of 8+ characters are required.' }, 400)
    }
    const supabase = getSupabase(c.env)
    const { data: dup } = await supabase.from('guards').select('guard_id').eq('employee_code', String(b.employee_code).trim()).maybeSingle()
    if (dup) return c.json({ success: false, message: 'Employee code already exists.' }, 400)
    const { data, error } = await supabase.from('guards').insert([{
      full_name: String(b.full_name).trim(),
      employee_code: String(b.employee_code).trim(),
      password_hash: await hashPassword(String(b.password)),
      role: b.role || 'Chief Security Officer',
      tier: 'INDUSTRY_ADMIN',
      tenant_id: c.req.param('id'),
      is_active: true,
    }]).select('guard_id, full_name, employee_code, role, tier, tenant_id').single()
    if (error) throw error
    return c.json({ success: true, admin: data }, 201)
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error) }, 500)
  }
})

app.post('/api/v1/guards', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createGuardSchema.parse(body);
    const supabase = getSupabase(c.env);
    const caller = c.get('auth');

    // Tenant comes from the caller, never from the request body (except for the platform owner).
    const newTenantId = caller.tier === 'SUPER_ADMIN' ? (parsed.tenant_id || null) : caller.tenant_id;
    if (!newTenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);
    // Only the platform owner can mint admins, and only via /super-admin/tenants/:id/admins. Everything here is a USER.
    const newTier = caller.tier === 'SUPER_ADMIN' && parsed.tier === 'INDUSTRY_ADMIN' ? 'INDUSTRY_ADMIN' : 'USER'; // only the platform owner can mint admins
    const tenantRaw = await rawTenantFeatures(supabase, newTenantId);
    const clampedPerms = parsed.app_permissions ? clampToTenant(tenantRaw, parsed.app_permissions) : null;

    const { data: existing } = await supabase
      .from('guards')
      .select('guard_id')
      .eq('employee_code', parsed.employee_code.trim())
      .maybeSingle();

    if (existing) {
      return c.json({ success: false, message: 'A guard with this employee code already exists.' }, 400);
    }

    const roundIds = parsed.assigned_round_ids !== undefined
      ? parsed.assigned_round_ids
      : (parsed.assigned_round_id ? [parsed.assigned_round_id] : []);
    const primaryRoundId = roundIds[0] || null;

    const groupsList = parsed.assignment_groups && parsed.assignment_groups.length > 0
      ? parsed.assignment_groups
      : (parsed.assignment_group ? [parsed.assignment_group] : ['Security Operations L1']);

    const cleanEmail = parsed.email ? parsed.email.trim() : null;
    const cleanPhone = parsed.phone ? parsed.phone.trim() : null;

    const insertPayload: Record<string, any> = {
      full_name: parsed.full_name.trim(),
      employee_code: parsed.employee_code.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password_hash: await hashPassword(parsed.password),
      tier: newTier,
      role: parsed.role,
      site_location: parsed.site_location,
      shift_timing: parsed.shift_timing,
      assignment_group: groupsList[0],
      assignment_groups: groupsList,
      assigned_round_id: primaryRoundId,
      assigned_round_ids: roundIds,
      reporting_to: parsed.reporting_to,
      is_active: true,
      tenant_id: newTenantId,
      app_permissions: clampedPerms
    };

    let { data: newGuard, error } = await supabase
      .from('guards')
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      const basePayload: Record<string, any> = {
        full_name: parsed.full_name.trim(),
        employee_code: parsed.employee_code.trim(),
        password_hash: insertPayload.password_hash,
        tier: newTier,
        tenant_id: newTenantId,
        role: parsed.role,
        site_location: parsed.site_location,
        shift_timing: parsed.shift_timing,
        assigned_round_id: primaryRoundId,
        reporting_to: parsed.reporting_to,
        is_active: true,
      };
      const retry = await supabase.from('guards').insert([basePayload]).select().single();
      if (retry.error) throw retry.error;
      newGuard = retry.data;
    }

    if (newGuard?.guard_id) {
      await saveGuardExtendedProfile(supabase, newGuard.guard_id, {
        email: cleanEmail,
        phone: cleanPhone,
        assignment_groups: groupsList,
        app_permissions: clampedPerms
      });
    }

    const hybrid = await resolveEffectivePermissions(supabase, newGuard.role || 'Guard', clampedPerms);

    return c.json({
      success: true,
      guard: {
        ...newGuard,
        email: cleanEmail,
        phone: cleanPhone,
        assignment_group: groupsList[0],
        assignment_groups: groupsList,
        password_hash: undefined,
        app_permissions: resolveAccess(tenantRaw, hybrid.permissions).active_permissions,
        is_custom_override: hybrid.is_custom_override
      },
    }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: error.errors[0]?.message || 'Invalid format' }, 400);
    }
    return c.json({ success: false, message: errMsg(error, 'Failed to create guard') }, 500);
  }
});

app.patch('/api/v1/guards/:id', async (c) => {
  try {
    const guardId = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateGuardSchema.parse(body);
    const supabase = getSupabase(c.env);
    const caller = c.get('auth');

    const { data: targetRow } = await supabase.from('guards').select('guard_id, tier, tenant_id').eq('guard_id', guardId).maybeSingle();
    if (!targetRow || (caller.tier !== 'SUPER_ADMIN' && (targetRow.tenant_id !== caller.tenant_id || targetRow.tier !== 'USER'))) {
      return c.json({ success: false, message: 'Not Found' }, 404);
    }
    if (parsed.app_permissions) {
      parsed.app_permissions = clampToTenant(await rawTenantFeatures(supabase, targetRow.tenant_id), parsed.app_permissions) as any;
    }

    const updates: Record<string, any> = {};

    // Access level (tier) and industry can only be changed by the platform Super Admin.
    let effectiveTenant: string | null = targetRow.tenant_id;
    if (parsed.tier !== undefined || (parsed.tenant_id && parsed.tenant_id !== targetRow.tenant_id)) {
      if (caller.tier !== 'SUPER_ADMIN') {
        return c.json({ success: false, message: 'Only the platform super admin can change access level or industry.' }, 403);
      }
      if (targetRow.tier === 'SUPER_ADMIN') {
        return c.json({ success: false, message: 'The platform super admin account cannot be changed here.' }, 400);
      }
    }
    if (parsed.tier !== undefined) updates.tier = parsed.tier;
    if (parsed.tenant_id && parsed.tenant_id !== targetRow.tenant_id) {
      const { data: newTenant } = await supabase.from('tenants').select('id').eq('id', parsed.tenant_id).maybeSingle();
      if (!newTenant) return c.json({ success: false, message: 'Industry not found.' }, 404);
      updates.tenant_id = parsed.tenant_id;
      updates.assigned_round_id = null;     // routes belong to the old industry
      updates.assigned_round_ids = [];
      updates.app_permissions = null;       // allocations were made against the old industry's licence
      effectiveTenant = parsed.tenant_id;
    }

    // Assigned routes must belong to the person's own industry.
    const wantedRoundIds = parsed.assigned_round_ids ?? (parsed.assigned_round_id ? [parsed.assigned_round_id] : []);
    if (wantedRoundIds.length > 0) {
      const { data: found } = await supabase.from('rounds').select('id, tenant_id').in('id', wantedRoundIds);
      // A route that belongs to ANOTHER industry is refused. A route that no longer exists (deleted) is simply dropped.
      if ((found || []).some((r: any) => r.tenant_id !== effectiveTenant)) {
        return c.json({ success: false, message: 'One or more routes belong to another industry.' }, 400);
      }
      const valid = (found || []).map((r: any) => r.id);
      if (parsed.assigned_round_ids !== undefined) parsed.assigned_round_ids = valid as any;
      parsed.assigned_round_id = valid[0] ?? null;
    }
    const extUpdates: Partial<GuardExtendedProfile> = {};

    if (parsed.full_name !== undefined) updates.full_name = parsed.full_name.trim();
    if (parsed.email !== undefined) {
      const cleanEmail = parsed.email ? parsed.email.trim() : null;
      updates.email = cleanEmail;
      extUpdates.email = cleanEmail;
    }
    if (parsed.phone !== undefined) {
      const cleanPhone = parsed.phone ? parsed.phone.trim() : null;
      updates.phone = cleanPhone;
      extUpdates.phone = cleanPhone;
    }
    if (parsed.password !== undefined && parsed.password.trim() !== '') updates.password_hash = await hashPassword(parsed.password);
    if (parsed.is_active !== undefined) updates.is_active = parsed.is_active;
    if (parsed.role !== undefined) updates.role = parsed.role;
    if (parsed.site_location !== undefined) updates.site_location = parsed.site_location;
    if (parsed.shift_timing !== undefined) updates.shift_timing = parsed.shift_timing;
    if (parsed.reporting_to !== undefined) updates.reporting_to = parsed.reporting_to;

    if (parsed.assignment_groups !== undefined) {
      updates.assignment_groups = parsed.assignment_groups;
      updates.assignment_group = parsed.assignment_groups[0] || 'Security Operations L1';
      extUpdates.assignment_groups = parsed.assignment_groups;
    } else if (parsed.assignment_group !== undefined) {
      updates.assignment_group = parsed.assignment_group;
      updates.assignment_groups = parsed.assignment_group ? [parsed.assignment_group] : [];
      extUpdates.assignment_groups = updates.assignment_groups;
    }

    if (parsed.app_permissions !== undefined) {
      updates.app_permissions = parsed.app_permissions;
      extUpdates.app_permissions = parsed.app_permissions;
    }

    if (parsed.assigned_round_ids !== undefined) {
      updates.assigned_round_ids = parsed.assigned_round_ids;
      updates.assigned_round_id = parsed.assigned_round_ids[0] || null;
    } else if (parsed.assigned_round_id !== undefined) {
      updates.assigned_round_id = parsed.assigned_round_id;
      updates.assigned_round_ids = parsed.assigned_round_id ? [parsed.assigned_round_id] : [];
    }

    if (Object.keys(updates).length === 0 && Object.keys(extUpdates).length === 0) {
      return c.json({ success: false, message: 'No fields provided to update.' }, 400);
    }

    if (Object.keys(extUpdates).length > 0) {
      await saveGuardExtendedProfile(supabase, guardId, extUpdates);
    }

    let { data: updatedGuard, error } = await supabase
      .from('guards')
      .update(updates)
      .eq('guard_id', guardId)
      .select()
      .maybeSingle();

    if (error) {
      const safeUpdates = { ...updates };
      delete safeUpdates.email;
      delete safeUpdates.phone;
      delete safeUpdates.assignment_group;
      delete safeUpdates.assignment_groups;
      delete safeUpdates.assigned_round_ids;
      delete safeUpdates.app_permissions;

      if (Object.keys(safeUpdates).length > 0) {
        const retry = await supabase
          .from('guards')
          .update(safeUpdates)
          .eq('guard_id', guardId)
          .select()
          .maybeSingle();
        if (retry.error) throw retry.error;
        updatedGuard = retry.data;
      } else {
        const { data: existing } = await supabase
          .from('guards')
          .select('*')
          .eq('guard_id', guardId)
          .maybeSingle();
        updatedGuard = existing;
      }
    }

    return c.json({
      success: true,
      guard: {
        ...updatedGuard,
        ...extUpdates,
        password_hash: undefined,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: error.errors[0]?.message || 'Invalid format' }, 400);
    }
    return c.json({ success: false, message: errMsg(error, 'Failed to update guard') }, 500);
  }
});

app.get('/api/v1/guards/my-assigned-route', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }
    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    const guard_id = payload.sub as string;

    const supabase = getSupabase(c.env);

    const { data: guard, error: gError } = await supabase
      .from('guards')
      .select('*')
      .eq('guard_id', guard_id)
      .maybeSingle();

    if (gError || !guard) {
      return c.json({ success: true, has_route: false, routes: [], message: 'Guard profile not found.' });
    }

    const roundIds: string[] = Array.isArray(guard.assigned_round_ids) && guard.assigned_round_ids.length > 0
      ? guard.assigned_round_ids
      : (guard.assigned_round_id ? [guard.assigned_round_id] : []);

    const uniqueIds = Array.from(new Set(roundIds.filter(Boolean)));

    if (uniqueIds.length === 0) {
      return c.json({ success: true, has_route: false, routes: [], message: 'No patrol route currently assigned to you.' });
    }

    const [roundsRes, cpRes] = await Promise.all([
      supabase.from('rounds').select('id, name').in('id', uniqueIds),
      supabase.from('checkpoints').select('checkpoint_id, round_id, name, lat, lng, qr_payload').in('round_id', uniqueIds)
    ]);

    const roundsList = roundsRes.data || [];
    const allCheckpoints = cpRes.data || [];

    const routes = uniqueIds
      .map((id) => {
        const r = roundsList.find((item: any) => item.id === id);
        if (!r) return null;
        const cps = allCheckpoints.filter((cp: any) => cp.round_id === r.id);
        return {
          id: r.id,
          name: r.name,
          total_checkpoints: cps.length,
          checkpoints: cps
        };
      })
      .filter(Boolean);

    if (routes.length === 0) {
      return c.json({ success: true, has_route: false, routes: [], message: 'Assigned routes not found.' });
    }

    return c.json({
      success: true,
      has_route: true,
      route: routes[0], 
      routes            
    });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Server error') }, 500);
  }
});

// ==========================================
// 6. TICKETING & INCIDENT COMMAND (WITH DUAL-LAYER GATING ENFORCEMENT)
// ==========================================
app.post('/api/v1/incidents', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    let callerTokenGuardId: string | null = null;
    let callerTenantId: string | null = null;
    let callerRole: string = 'Guard';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
        callerTokenGuardId = payload.sub as string;
        callerTenantId = payload.tenant_id as string;
        callerRole = (payload.role || 'Guard').toString();
      } catch (_) {}
    }

    const url = new URL(c.req.url);
    const body = await c.req.json();
    const supabase = getSupabase(c.env);

    // Gates 1 and 2 (tenant licence + user allocation) already ran in middleware.
    // Here we only scrub fields the caller isn't entitled to set, using the same cascade result.
    const authCtx = c.get('auth');
    const tenantFeatures = authCtx.tenant_features;
    const allowed = authCtx.access.active_permissions;
    if (authCtx.tier !== 'SUPER_ADMIN') {
      if (!allowed.incident_option_1_severity) body.priority = 'P3';
      if (!allowed.incident_option_2_category) body.category = 'Security / Patrol';
      if (!allowed.incident_option_3_group) body.assignment_group = 'Security Operations L1';
      if (!allowed.incident_option_4_title) body.title = undefined;
      if (!allowed.incident_option_5_description) body.description = undefined;
      if (!allowed.incident_option_6_photo) body.photo_url = undefined;
    }
    callerTokenGuardId = authCtx.guard_id;

    const {
      client_incident_id,
      guard_id,
      title,
      description,
      priority,
      category,
      impact,
      urgency,
      photo_url,
      reported_at,
      assignment_group
    } = body;

    const resolvedGuardId = callerTokenGuardId; // never trust a guard_id from the body
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_incident_id || '');
    const incidentUuid = isValidUUID ? client_incident_id : crypto.randomUUID();

    const finalPhotoUrl = photo_url
      ? await storeImage(c.env.R2_BUCKET, url.origin, 'incidents', 'photo', photo_url)
      : null;

    const targetGroup = assignment_group || 'Security Operations L1';

    const insertRecord: Record<string, any> = {
      client_incident_id: incidentUuid,
      guard_id: resolvedGuardId,
      title: title || (description ? description.substring(0, 40) : 'Security Incident'),
      description: description || title || 'Security Incident',
      priority: priority || 'P3',
      category: category || 'Security / Patrol',
      impact: impact || '2 - Medium',
      urgency: urgency || '2 - Medium',
      photo_url: finalPhotoUrl,
      status: 'OPEN',
      assignment_group: targetGroup,
      assigned_to: null,
      tenant_id: authCtx.tenant_id,
      reported_at: reported_at || new Date().toISOString()
    };

    // A retry of the same incident keeps its number; a clash with ANOTHER industry's incident is refused.
    const { data: already } = await supabase.from('incidents').select('tenant_id, case_number').eq('client_incident_id', incidentUuid).maybeSingle();
    if (already && already.tenant_id !== authCtx.tenant_id) {
      return c.json({ success: false, message: 'Incident id already in use.' }, 409);
    }
    if (already?.case_number) {
      insertRecord.case_number = already.case_number;
    } else if (authCtx.tenant_id) {
      const { data: nextNo } = await supabase.rpc('next_case_number', { p_tenant: authCtx.tenant_id });
      if (typeof nextNo === 'number') insertRecord.case_number = nextNo;
    }

    let { data, error } = await supabase
      .from('incidents')
      .upsert(insertRecord, { onConflict: 'client_incident_id' })
      .select()
      .single();

    if (error) {
      const basicRecord = {
        client_incident_id: incidentUuid,
        guard_id: resolvedGuardId,
        title: insertRecord.title,
        description: insertRecord.description,
        priority: insertRecord.priority,
        photo_url: finalPhotoUrl,
        status: 'OPEN',
        assignment_group: targetGroup,
        tenant_id: authCtx.tenant_id,
        case_number: insertRecord.case_number ?? null,
        reported_at: insertRecord.reported_at
      };
      const retry = await supabase
        .from('incidents')
        .upsert(basicRecord, { onConflict: 'client_incident_id' })
        .select()
        .single();
      if (retry.error) return c.json({ success: false, message: 'Database error', error: retry.error }, 500);
      data = retry.data;
    }

    // Only dispatch Gmail if licensed to this tenant
    let emailResult: { ok: boolean; recipients: string[]; error?: string } = { ok: false, recipients: [], error: 'Module not licensed' };
    if (tenantFeatures.module_integrations?.channels?.gmail_oauth) {
      emailResult = await sendGroupAssignmentEmail(c.env, {
        incidentId: incidentUuid,
        priority: body.priority || 'P3',
        description: description || title || 'Security Incident',
        photoUrl: finalPhotoUrl,
        assignmentGroup: targetGroup,
        assignedTo: 'Unassigned (Group Queue)',
        status: 'OPEN',
        tenantId: authCtx.tenant_id,
        caseNumber: data?.case_number ?? insertRecord.case_number ?? null,
      });
    }

    const emailLogLine = emailResult.ok
      ? `Incident created & Auto-Email Dispatched to [${targetGroup}] members (${emailResult.recipients.join(', ')})`
      : `Incident created. Auto-Email Notice: ${emailResult.error}`;

    await supabase.from('incident_updates').insert([{
      incident_id: incidentUuid,
      sender_type: 'admin',
      sender_name: 'SOC Dispatch System',
      message: emailLogLine,
      photo_url: null
    }]);

    return c.json({
      success: true,
      incident: data,
      email_dispatched: emailResult.ok,
      email_recipients: emailResult.recipients,
      email_error: emailResult.error
    }, 201);

  } catch (error) {
    return c.json({ success: false, message: 'Internal Server Error' }, 500);
  }
});

app.get('/api/v1/incidents', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const a = c.get('auth');
    let incQuery: any = applyTenant(supabase.from('incidents').select('*'), scopeTenant(c));
    if (a.tier === 'USER') incQuery = incQuery.eq('guard_id', a.guard_id); // field users see only their own tickets
    const [incRes, guardsRes] = await Promise.all([
      incQuery.order('reported_at', { ascending: false }),
      applyTenant(supabase.from('guards').select('guard_id, full_name, employee_code'), scopeTenant(c))
    ]);
    
    if (incRes.error) throw incRes.error;
    const guardsMap = new Map((guardsRes.data || []).map((g: any) => [g.guard_id, g]));

    const enriched = (incRes.data || []).map((inc: any) => {
      const g = inc.guard_id ? guardsMap.get(inc.guard_id) : null;
      return {
        ...inc,
        guards: g ? { full_name: g.full_name, employee_code: g.employee_code } : null
      };
    });

    return c.json({ success: true, incidents: enriched });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch incidents' }, 500);
  }
});

async function resolveIncidentRecord(supabase: any, rawParam: string, tenant?: string | null) {
  const target = decodeURIComponent(rawParam).trim().toLowerCase();

  let { data: match } = await applyTenant(
    supabase.from('incidents').select('*').eq('client_incident_id', rawParam),
    tenant
  ).maybeSingle();

  if (match) return match;

  const { data: all } = await applyTenant(supabase.from('incidents').select('*'), tenant).limit(100);

  if (all && all.length > 0) {
    match = all.find((inc: any) => {
      const cId = (inc.client_incident_id || '').toLowerCase();
      if (cId === target) return true;
      if (inc.incident_id && String(inc.incident_id).toLowerCase() === target) return true;
      const formatted = `inc${cId.replace(/[^0-9]/g, '').padEnd(7, '0').slice(0, 7)}`;
      return formatted === target;
    });
  }

  return match || null;
}

app.get('/api/v1/incidents/:id', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const supabase = getSupabase(c.env);

    const incident = await resolveIncidentRecord(supabase, rawParam, scopeTenant(c));
    if (!incident || (c.get('auth').tier === 'USER' && incident.guard_id !== c.get('auth').guard_id)) {
      return c.json({ success: false, message: 'Incident record not found.' }, 404);
    }

    const targetId = incident.client_incident_id;

    const { data: updates, error: updatesError } = await supabase
      .from('incident_updates')
      .select('*')
      .eq('incident_id', targetId)
      .order('created_at', { ascending: false });

    if (updatesError) throw updatesError;
    return c.json({ success: true, incident, updates: updates || [] });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Failed to fetch incident details') }, 500);
  }
});

app.post('/api/v1/incidents/:id/updates', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const url = new URL(c.req.url);
    const body = await c.req.json();
    const { sender_type, sender_name, message, photo_base64 } = body;
    const supabase = getSupabase(c.env);

    const incident = await resolveIncidentRecord(supabase, rawParam, scopeTenant(c));
    if (!incident || (c.get('auth').tier === 'USER' && incident.guard_id !== c.get('auth').guard_id)) {
      return c.json({ success: false, message: 'Incident record not found.' }, 404);
    }
    const incidentId = incident.client_incident_id;

    const finalPhotoUrl = photo_base64
      ? await storeImage(c.env.R2_BUCKET, url.origin, 'incident_updates', 'photo', photo_base64)
      : null;

    const { data, error } = await supabase
      .from('incident_updates')
      .insert([{
        incident_id: incidentId,
        sender_type,
        sender_name,
        message,
        photo_url: finalPhotoUrl
      }])
      .select()
      .single();
      
    if (error) throw error;
    return c.json({ success: true, update: data });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to post update' }, 500);
  }
});

app.patch('/api/v1/incidents/:id', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const body = await c.req.json();
    const supabase = getSupabase(c.env);

    const current = await resolveIncidentRecord(supabase, rawParam, scopeTenant(c));
    if (!current) {
      return c.json({ success: false, message: 'Incident not found.' }, 404);
    }
    const incidentId = current.client_incident_id;

    const normalizedNewAssignee =
      body.assigned_to !== undefined
        ? (body.assigned_to && String(body.assigned_to).trim() !== '' ? String(body.assigned_to).trim() : null)
        : undefined;

    const updates: Record<string, any> = {};
    if (body.description !== undefined) updates.description = body.description;
    if (body.title !== undefined) updates.title = body.title;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;
    if (body.category !== undefined) updates.category = body.category;
    if (body.impact !== undefined) updates.impact = body.impact;
    if (body.urgency !== undefined) updates.urgency = body.urgency;
    if (body.assignment_group !== undefined) updates.assignment_group = body.assignment_group;
    if (normalizedNewAssignee !== undefined) updates.assigned_to = normalizedNewAssignee;
    if (body.guard_id !== undefined) updates.guard_id = body.guard_id;

    let { data: updatedIncident, error: updateErr } = await supabase
      .from('incidents')
      .update(updates)
      .eq('client_incident_id', incidentId)
      .select()
      .maybeSingle();

    if (updateErr) {
      const basicUpdates: Record<string, any> = {};
      if (body.description !== undefined) basicUpdates.description = body.description;
      if (body.priority !== undefined) basicUpdates.priority = body.priority;
      if (body.status !== undefined) basicUpdates.status = body.status;

      const fallback = await supabase
        .from('incidents')
        .update(basicUpdates)
        .eq('client_incident_id', incidentId)
        .select()
        .maybeSingle();

      updatedIncident = fallback.data;
    }

    const changes: string[] = [];
    if (body.priority && body.priority !== current.priority) {
      changes.push(`Priority changed from ${current.priority} to ${body.priority}`);
    }
    if (body.impact && body.impact !== current.impact) {
      changes.push(`Impact changed from "${current.impact || 'None'}" to "${body.impact}"`);
    }
    if (body.urgency && body.urgency !== current.urgency) {
      changes.push(`Urgency changed from "${current.urgency || 'None'}" to "${body.urgency}"`);
    }
    if (body.status && body.status !== current.status) {
      changes.push(`State changed from ${current.status} to ${body.status}`);
    }

    const groupChanged =
      body.assignment_group !== undefined &&
      body.assignment_group !== (current.assignment_group || '');

    const currentAssigneeClean = (current.assigned_to || '').trim();
    const newAssigneeClean = (normalizedNewAssignee || '').trim();
    const assigneeChanged =
      normalizedNewAssignee !== undefined &&
      newAssigneeClean !== currentAssigneeClean;

    if (groupChanged) {
      changes.push(`Assignment group set to "${body.assignment_group}"`);
    }
    if (assigneeChanged) {
      changes.push(
        newAssigneeClean
          ? `Assigned to "${newAssigneeClean}"`
          : `Assigned to cleared (Unassigned)`
      );
    }

    let emailTriggered = false;
    let emailDispatchResult: { ok: boolean; recipients: string[]; error?: string } = {
      ok: false,
      recipients: [],
    };
    let emailLogLine = '';

    if (groupChanged || (assigneeChanged && newAssigneeClean !== '')) {
      emailTriggered = true;
      const targetGroup = body.assignment_group || current.assignment_group || 'Security Operations L1';
      const targetAssignee = newAssigneeClean || 'Unassigned (Group Queue)';

      emailDispatchResult = await sendGroupAssignmentEmail(c.env, {
        incidentId,
        priority: body.priority || current.priority || 'P3',
        description: body.description || current.description || 'Security Incident',
        photoUrl: current.photo_url || null,
        assignmentGroup: targetGroup,
        assignedTo: targetAssignee,
        status: body.status || current.status || 'OPEN',
        workNote: body.work_note,
        tenantId: current.tenant_id,
        caseNumber: current.case_number ?? null,
      });

      emailLogLine = emailDispatchResult.ok
        ? `Auto-Email Dispatched to [${targetGroup}] members (${emailDispatchResult.recipients.join(', ')})`
        : `Auto-Email Notice for [${targetGroup}]: ${emailDispatchResult.error}`;
    }

    let createdActivity = null;
    const combinedMessage = [
      body.work_note ? body.work_note.trim() : '',
      changes.length > 0 ? `Field Changes: ${changes.join(', ')}` : '',
      emailLogLine
    ].filter(Boolean).join('\n\n');

    if (combinedMessage) {
      const { data: logData } = await supabase
        .from('incident_updates')
        .insert([{
          incident_id: incidentId,
          sender_type: 'admin',
          sender_name: body.updated_by || 'System Administrator',
          message: combinedMessage,
          photo_url: null
        }])
        .select()
        .single();

      createdActivity = logData;
    }

    return c.json({ 
      success: true, 
      incident: updatedIncident, 
      activity: createdActivity,
      email_triggered: emailTriggered,
      email_dispatched: emailDispatchResult.ok,
      email_recipients: emailDispatchResult.recipients,
      email_error: emailDispatchResult.error
    });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Failed to update incident') }, 500);
  }
});

app.patch('/api/v1/incidents/:id/resolve', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const body = await c.req.json();
    const supabase = getSupabase(c.env);

    const current = await resolveIncidentRecord(supabase, rawParam, scopeTenant(c));
    const incidentId = current?.client_incident_id || rawParam;

    const resolutionCode = body.resolution_code || 'Solved (Permanently)';
    const resolutionNotes = body.resolution_notes;
    const resolvedBy = body.resolved_by || 'System Administrator';

    if (!resolutionNotes || resolutionNotes.trim() === '') {
      return c.json({ 
        success: false, 
        message: 'Resolution notes are mandatory to resolve this incident.' 
      }, 400);
    }

    let { data: resolvedIncident, error: incError } = await supabase
      .from('incidents')
      .update({ 
        status: 'RESOLVED',
        resolution_code: resolutionCode,
        resolution_notes: resolutionNotes.trim(),
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString()
      })
      .eq('client_incident_id', incidentId)
      .select()
      .maybeSingle();

    if (incError) {
      const fallback = await supabase
        .from('incidents')
        .update({ status: 'RESOLVED' })
        .eq('client_incident_id', incidentId)
        .select()
        .maybeSingle();
      resolvedIncident = fallback.data;
    }

    const activityMessage = `INCIDENT RESOLVED\nResolution Code: ${resolutionCode}\nResolution Notes: ${resolutionNotes.trim()}`;

    const { data: newUpdate } = await supabase
      .from('incident_updates')
      .insert([{
        incident_id: incidentId,
        sender_type: 'admin',
        sender_name: resolvedBy,
        message: activityMessage,
        photo_url: null
      }])
      .select()
      .single();

    return c.json({ 
      success: true, 
      incident: resolvedIncident || { status: 'RESOLVED' }, 
      activity: newUpdate 
    });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Failed to resolve incident') }, 500);
  }
});

app.delete('/api/v1/incidents/:id', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const supabase = getSupabase(c.env);

    const current = await resolveIncidentRecord(supabase, rawParam, scopeTenant(c));
    const incidentId = current?.client_incident_id || rawParam;

    const { error } = await supabase
      .from('incidents')
      .delete()
      .eq('client_incident_id', incidentId);

    if (error) return c.json({ success: false, message: errMsg(error) }, 500);
    return c.json({ success: true, message: 'Incident deleted successfully' });
  } catch (error: any) {
    return c.json({ success: false, message: errMsg(error, 'Failed to delete incident') }, 500);
  }
});

// ==========================================
// 7. ADMIN CONFIGS & GOOGLE OAUTH2 REFRESH TOKEN DISPATCH
// ==========================================
async function resolveAdminTenantId(c: any, supabase: any): Promise<string | null> {
  const a = c.get('auth') as AuthContext;
  const queryTenant = c.req.query('tenant_id');
  if (a.tier === 'SUPER_ADMIN') {
    if (queryTenant) return queryTenant;
    if (a.tenant_id) return a.tenant_id;
    const { data: firstTenant } = await supabase
      .from('tenants')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return firstTenant?.id || null;
  }
  return a.tenant_id || null;
}

app.get('/api/v1/admin/configs', async (c) => {
  try {
    const a = c.get('auth');
    const supabase = getSupabase(c.env);
    const tenantId = await resolveAdminTenantId(c, supabase);
    if (!tenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);

    const features = await tenantFeaturesFor(supabase, tenantId);
    const cfg = await loadTenantConfig(supabase, tenantId);

    const configs = Object.entries(cfg)
      .filter(([k]) => a.tier === 'SUPER_ADMIN' || configKeyAllowed(k, features))
      .map(([k, v]) => ({ key_name: k, key_value: SECRET_KEYS.has(k) && v ? MASK : v }));
    return c.json({ success: true, configs });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to load configs' }, 500);
  }
});

app.post('/api/v1/admin/configs', async (c) => {
  try {
    const a = c.get('auth');
    const supabase = getSupabase(c.env);
    const tenantId = await resolveAdminTenantId(c, supabase);
    if (!tenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);

    const body = await c.req.json();
    const rows: any[] = Array.isArray(body) ? body : [body];
    const features = await tenantFeaturesFor(supabase, tenantId);

    const toWrite: { key_name: string; key_value: any }[] = [];
    for (const r of rows) {
      const key = String(r?.key_name || '');
      if (!key) continue;
      // Skip keys for unpurchased channels instead of failing the entire save batch
      if (a.tier !== 'SUPER_ADMIN' && !configKeyAllowed(key, features)) {
        continue;
      }
      if (r.key_value === MASK) continue; // unchanged secret echoed back by the form
      toWrite.push({ key_name: cfgKey(tenantId, key), key_value: r.key_value });
    }
    if (toWrite.length > 0) {
      const { error } = await supabase.from('admin_configurations').upsert(toWrite, { onConflict: 'key_name' });
      if (error) throw error;
    }
    return c.json({ success: true, message: 'Configurations updated' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to save configs' }, 500);
  }
});

app.post('/api/v1/admin/test-gmail', async (c) => {
  const supabase = getSupabase(c.env);
  const tenantId = await resolveAdminTenantId(c, supabase);

  const result = await sendGroupAssignmentEmail(c.env, {
    incidentId: '100999',
    priority: 'P2 - High',
    description: 'This is a live verification email from Rakshak Patrol using your Google OAuth2 credentials.',
    photoUrl: null,
    assignmentGroup: 'Security Operations L1',
    assignedTo: 'System Test',
    status: 'ACTIVE',
    includeManagerFallback: true,
    tenantId,
  });

  if (!result.ok) {
    return c.json({ success: false, message: result.error }, 400);
  }
  return c.json({ success: true, recipients: result.recipients });
});

async function getValidGmailAccessToken(
  supabase: any,
  configMap: Record<string, string>,
  keyPrefix: string = ''
): Promise<{ token: string | null; error?: string }> {
  const clientId = (configMap['GMAIL_CLIENT_ID'] || '').trim();
  const clientSecret = (configMap['GMAIL_CLIENT_SECRET'] || '').trim();
  const refreshToken = (configMap['GMAIL_REFRESH_TOKEN'] || '').trim();

  if (clientId && refreshToken) {
    try {
      const params: Record<string, string> = {
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      };
      if (clientSecret) {
        params.client_secret = clientSecret;
      }

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });

      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data.access_token) {
        await supabase
          .from('admin_configurations')
          .upsert([{ key_name: `${keyPrefix}GMAIL_ACCESS_TOKEN`, key_value: data.access_token }], {
            onConflict: 'key_name',
          });
        return { token: data.access_token };
      } else {
        return {
          token: null,
          error: `OAuth2 Refresh Token exchange failed: ${data.error_description || data.error || res.status}`,
        };
      }
    } catch (e: any) {
      return { token: null, error: e.message || 'Network error refreshing OAuth2 token' };
    }
  }

  const directToken = (configMap['GMAIL_ACCESS_TOKEN'] || '').trim();
  if (directToken) {
    return { token: directToken };
  }

  return {
    token: null,
    error: 'Missing OAuth2 Refresh Token in API Integrations.',
  };
}

async function sendGroupAssignmentEmail(
  env: Bindings,
  params: {
    incidentId: string;
    priority: string;
    description: string;
    photoUrl: string | null;
    assignmentGroup: string;
    assignedTo: string;
    status: string;
    workNote?: string;
    includeManagerFallback?: boolean;
    tenantId?: string | null;
    caseNumber?: number | null;
  }
): Promise<{ ok: boolean; recipients: string[]; error?: string }> {
  const supabase = getSupabase(env);
  if (!params.tenantId) return { ok: false, recipients: [], error: 'No tenant context for email dispatch' };

  const [configMap, guardsRes, blobRes] = await Promise.all([
    loadTenantConfig(supabase, params.tenantId),
    supabase.from('guards').select('*').eq('tenant_id', params.tenantId), // never email another tenant's staff
    supabase.from('admin_configurations').select('key_value').eq('key_name', 'GUARD_EXTENDED_PROFILES').maybeSingle()
  ]);
  if (blobRes.data?.key_value) configMap['GUARD_EXTENDED_PROFILES'] = blobRes.data.key_value;

  if (configMap['ENABLE_GMAIL'] === 'false') {
    return { ok: false, recipients: [], error: 'Gmail integration is disabled' };
  }

  let extProfilesMap: Record<string, GuardExtendedProfile> = {};
  if (configMap['GUARD_EXTENDED_PROFILES']) {
    try {
      extProfilesMap = JSON.parse(configMap['GUARD_EXTENDED_PROFILES']);
    } catch (_) {}
  }

  const targetGroupClean = (params.assignmentGroup || '').trim().toLowerCase();
  const recipientSet = new Set<string>();

  (guardsRes.data || []).forEach((g: any) => {
    if (g.is_active === false) return;
    const ext = extProfilesMap[g.guard_id] || {};

    const gGroups: string[] =
      Array.isArray(g.assignment_groups) && g.assignment_groups.length > 0
        ? g.assignment_groups
        : Array.isArray(ext.assignment_groups) && ext.assignment_groups.length > 0
        ? ext.assignment_groups
        : g.assignment_group
        ? [g.assignment_group]
        : ['Security Operations L1'];

    const belongsToTargetGroup = gGroups.some(
      (grp) => (grp || '').trim().toLowerCase() === targetGroupClean
    );

    const memberEmail = safeEmail(g.email || ext.email || '');
    if (belongsToTargetGroup && memberEmail) {
      recipientSet.add(memberEmail);
    }
  });

  if (params.includeManagerFallback) {
    const managerEmail = safeEmail(configMap['MANAGER_EMAIL'] || '');
    if (managerEmail) {
      recipientSet.add(managerEmail);
    }
  }

  const recipients = Array.from(recipientSet);
  if (recipients.length === 0) {
    return {
      ok: false,
      recipients: [],
      error: `No members in "${params.assignmentGroup}" have an email address configured on the Guards page.`,
    };
  }

  const tokenResult = await getValidGmailAccessToken(supabase, configMap, `t:${params.tenantId}:`);
  if (!tokenResult.token) {
    return { ok: false, recipients, error: tokenResult.error };
  }

  const caseNumber = params.caseNumber
    ? `RKS-${String(params.caseNumber).padStart(6, '0')}`
    : `RKS-${params.incidentId.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6)}`;
  const subjectText = `[Rakshak Dispatch - ${params.assignmentGroup}] ${params.priority} Case ${caseNumber}`;
  const encodedSubject = `=?utf-8?B?${utf8ToBase64(subjectText)}?=`;

  const safePhoto = /^https:\/\//.test(String(params.photoUrl || '')) ? String(params.photoUrl) : '';
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
      <div style="background: #0f172a; color: #ffffff; padding: 16px 20px;">
        <h2 style="margin: 0; font-size: 17px;">Rakshak Security Dispatch Alert</h2>
        <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">
          Assignment Group: <strong style="color:#38bdf8;">${esc(params.assignmentGroup)}</strong> • Case: ${caseNumber}
        </p>
      </div>
      <div style="padding: 20px; color: #1e293b; font-size: 13px; line-height: 1.6; background: #ffffff;">
        <p style="margin-top:0;">This security incident has been assigned to <strong>${esc(params.assignmentGroup)}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px;">
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold; width: 35%;">Case ID</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace;">${caseNumber}</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Severity / Status</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>${esc(params.priority)}</strong> (${esc(params.status)})</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Assignment Group</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${esc(params.assignmentGroup)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Assigned Responder</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${esc(params.assignedTo || 'Unassigned (Group Queue)')}</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Description</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${esc(params.description)}</td>
          </tr>
          ${params.workNote ? `
          <tr>
            <td style="padding: 6px 8px; background: #fffbeb; border: 1px solid #fde68a; font-weight: bold;">Instructions</td>
            <td style="padding: 6px 8px; background: #fffbeb; border: 1px solid #fde68a;">${esc(params.workNote)}</td>
          </tr>` : ''}
        </table>
        ${safePhoto ? `<div style="margin-top: 14px;"><img src="${esc(safePhoto)}" alt="Incident Evidence" style="max-width: 100%; max-height: 260px; border-radius: 8px; border: 1px solid #cbd5e1;"/></div>` : ''}
      </div>
    </div>
  `;

  const emailLines = [
    `To: ${recipients.join(', ')}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody
  ];

  const base64EncodedEmail = utf8ToBase64(emailLines.join('\r\n'))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenResult.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64EncodedEmail })
    });

    if (!response.ok) {
      const errBody: any = await response.json().catch(() => ({}));
      const msg = errBody?.error?.message || `HTTP ${response.status}`;
      return {
        ok: false,
        recipients,
        error: `${msg}`,
      };
    }

    return { ok: true, recipients };
  } catch (err: any) {
    return { ok: false, recipients, error: err.message || 'Network error calling Gmail API' };
  }
}

async function sendWhatsAppAlert(env: Bindings, tenantId: string, incidentId: string, priority: string, description: string) {
  const supabase = getSupabase(env);
  const configMap = await loadTenantConfig(supabase, tenantId);
  if (configMap['ENABLE_WHATSAPP'] === 'false') return false;

  const token = configMap['WHATSAPP_API_TOKEN'];
  const phoneId = configMap['WHATSAPP_PHONE_ID']; 
  const managerPhone = configMap['MANAGER_PHONE']; 

  if (!token || !managerPhone || !phoneId) return false;

  const payload = {
    messaging_product: "whatsapp",
    to: managerPhone,
    type: "text",
    text: {
      body: `*CRITICAL ALERT: ${priority} INCIDENT*\n\nAn incident has been open for 10 minutes and requires immediate attention.\n\n*ID:* ${incidentId}\n*Details:* ${description}\n\nPlease check the admin dashboard immediately.`
    }
  };

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch (err) {
    return false;
  }
}

async function sendGoogleEmergencyEmail(env: Bindings, tenantId: string, incidentId: string, priority: string, description: string, photoUrl: string | null, caseNumber?: number | null) {
  const res = await sendGroupAssignmentEmail(env, {
    incidentId,
    priority,
    description,
    photoUrl,
    assignmentGroup: 'Security Operations L1',
    assignedTo: 'SLA Escalation',
    status: 'ESCALATED',
    includeManagerFallback: true,
    tenantId,
    caseNumber,
  });
  return res.ok;
}

// --- WORKER EXPORT ---
export default {
  fetch: async (request: Request, env: Bindings, ctx: ExecutionContext) => {
    return app.fetch(request, env, ctx)
  },
  
  scheduled: async (event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
    // Housekeeping first, each guarded so one failure never blocks incident escalation below.
    try { await closeStaleRuns(env); } catch (e) { console.error('closeStaleRuns failed', e); }
    try { await runDailyReports(env); } catch (e) { console.error('runDailyReports failed', e); }

    const supabase = getSupabase(env);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60000).toISOString();
    
    const { data: incidents, error } = await supabase
      .from('incidents')
      .select('*')
      .in('priority', ['P1', 'P2'])
      .eq('status', 'OPEN')
      .lte('reported_at', tenMinutesAgo);

    if (error || !incidents || incidents.length === 0) return;

    // Each tenant is escalated only through channels THEY bought, with THEIR credentials.
    const { data: tenantRows } = await supabase.from('tenants').select('id, features, status');
    const tenants = new Map<string, { f: ReturnType<typeof normalizeTenantFeatures>; active: boolean }>(
      (tenantRows || []).map((t: any) => [t.id, { f: normalizeTenantFeatures(t.features), active: (t.status || 'ACTIVE') === 'ACTIVE' }])
    );

    for (const incident of incidents) {
      const t = incident.tenant_id ? tenants.get(incident.tenant_id) : undefined;
      if (!t || !t.active || !t.f.module_incidents.enabled) continue; // no licence => no escalation, no notifications

      const jobs: Promise<any>[] = [];
      if (t.f.module_integrations.channels.gmail_oauth) {
        jobs.push(sendGoogleEmergencyEmail(env, incident.tenant_id, incident.client_incident_id, incident.priority, incident.description, incident.photo_url, incident.case_number));
      }
      if (t.f.module_integrations.channels.whatsapp_api) {
        jobs.push(sendWhatsAppAlert(env, incident.tenant_id, incident.client_incident_id, incident.priority, incident.description));
      }
      await Promise.all(jobs);

      await supabase
        .from('incidents')
        .update({ status: 'ESCALATED' })
        .eq('client_incident_id', incident.client_incident_id);
    }
  }
}
