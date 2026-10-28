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
}

type Variables = {
  auth: AuthContext
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use('/*', cors())

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
  password: z.string().min(4, 'Password must be at least 4 characters'),
  role: z.string().optional().default('Guard'),
  site_location: z.string().optional().default('Main Plant & Gate 1'),
  shift_timing: z.string().optional().default('Morning (06:00 - 14:00)'),
  assignment_group: z.string().optional().nullable(),
  assignment_groups: sanitizeStringArray,
  assigned_round_id: sanitizeUuid,
  assigned_round_ids: sanitizeUuidArray,
  reporting_to: sanitizeUuid,
  app_permissions: z.record(z.boolean()).optional().nullable(),
  tenant_id: sanitizeUuid
})

const updateGuardSchema = z.object({
  full_name: z.string().optional(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  password: z.string().optional(),
  is_active: z.boolean().optional(),
  role: z.string().optional(),
  site_location: z.string().optional(),
  shift_timing: z.string().optional(),
  assignment_group: z.string().optional().nullable(),
  assignment_groups: sanitizeStringArray,
  assigned_round_id: sanitizeUuid,
  assigned_round_ids: sanitizeUuidArray,
  reporting_to: sanitizeUuid,
  app_permissions: z.record(z.boolean()).optional().nullable()
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

// ---------- per-tenant configuration (admin_configurations rows are stored as "t:<tenantId>:<KEY>") ----------
const cfgKey = (tenantId: string, key: string) => `t:${tenantId}:${key}`
const SECRET_KEYS = new Set(['GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_ACCESS_TOKEN', 'WHATSAPP_API_TOKEN', 'TELEGRAM_BOT_TOKEN'])
const MASK = '********'

/** Which keys may this tenant even see or write? Unpurchased channel keys do not exist for them. */
function configKeyAllowed(key: string, f: ReturnType<typeof normalizeTenantFeatures>): boolean {
  if (key === 'GUARD_EXTENDED_PROFILES') return false // legacy global blob, never exposed
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
  if (p === '/api/v1/auth/login' || p.startsWith('/api/v1/media/')) return next()
  return requireAuth(c, next)
})

const patrolUser = [requireModule('module_patrol'), requirePermission('patrol_route')]
const incidentsMod = requireModule('module_incidents')

app.on('POST',   '/api/v1/scans', ...patrolUser)
app.on('GET',    '/api/v1/scans', ...patrolUser)
app.on('GET',    '/api/v1/rounds/:id/scans', adminTiers, requireModule('module_patrol'), ownedRow('rounds', 'id', 'id'))
app.on('POST',   '/api/v1/patrols/session/start', ...patrolUser)
app.on('POST',   '/api/v1/patrols/session/ping', ...patrolUser)
app.on('POST',   '/api/v1/patrols/sync', ...patrolUser)
app.on('GET',    '/api/v1/rounds/:id/live-trail', adminTiers, requireModule('module_patrol'),
       requireTenantFlag((f) => f.module_patrol.allow_live_gps_trail), ownedRow('rounds', 'id', 'id'))
app.on('GET',    '/api/v1/shifts/active', ...patrolUser)
app.on('POST',   '/api/v1/shifts/start', ...patrolUser)
app.on('POST',   '/api/v1/shifts/end', ...patrolUser)
app.on('GET',    '/api/v1/rounds', requireModule('module_patrol'))
app.on('POST',   '/api/v1/rounds', adminTiers, requireModule('module_patrol'))
app.on('DELETE', '/api/v1/rounds/:id', adminTiers, requireModule('module_patrol'), ownedRow('rounds', 'id', 'id'))
app.on('GET',    '/api/v1/guards/my-assigned-route', ...patrolUser, requireTenantFlag((f) => f.module_patrol.allow_route_assignment))
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

    if (!fileKey || fileKey.includes('..')) {
      return c.json({ error_code: 'BAD_REQUEST', message: 'Invalid file key.' }, 400);
    }

    const object = await c.env.R2_BUCKET.get(fileKey);
    if (!object) {
      return c.json({ error_code: 'NOT_FOUND', message: 'Image not found in storage.' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

    return new Response(object.body, { status: 200, headers });
  } catch (error: any) {
    return c.json({ error_code: 'SERVER_ERROR', message: error.message || 'Failed to stream media.' }, 500);
  }
});

// ==========================================
// 1. AUTH ROUTES (WITH DUAL-LAYER FEATURE INJECTION)
// ==========================================
app.post('/api/v1/auth/login', async (c) => {
  try {
    const { employee_code, password, device_id } = loginSchema.parse(await c.req.json())
    const supabase = getSupabase(c.env)

    const { data: guard } = await supabase.from('guards').select('*').eq('employee_code', employee_code).maybeSingle()
    // Always run a hash so response time doesn't reveal whether the account exists.
    const pw = await verifyPassword(password, guard?.password_hash ?? 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAA')
    if (!guard || guard.is_active === false || !pw.ok) {
      return c.json({ error_code: 'INVALID_CREDENTIALS', message: 'Invalid Login.' }, 401)
    }
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
async function isValidCheckpointSignature(
  supabase: any,
  qrSecret: string,
  checkpointId: string,
  qrLat: string,
  qrLng: string,
  signature: string
): Promise<boolean> {
  const directData = `${checkpointId}|${qrLat}|${qrLng}`;
  const directExpected = CryptoJS.HmacSHA256(directData, qrSecret).toString(CryptoJS.enc.Hex);
  if (signature === directExpected) return true;

  const { data: cp } = await supabase
    .from('checkpoints')
    .select('checkpoint_id, lat, lng, qr_payload')
    .eq('checkpoint_id', checkpointId)
    .maybeSingle();

  if (!cp) return false;

  if (cp.qr_payload) {
    const parts = cp.qr_payload.split('|');
    if (parts.length >= 4 && parts[3].trim() === signature.trim()) {
      return true;
    }
  }

  const dbData = `${cp.checkpoint_id}|${cp.lat}|${cp.lng}`;
  const dbExpected = CryptoJS.HmacSHA256(dbData, qrSecret).toString(CryptoJS.enc.Hex);
  if (signature === dbExpected) return true;

  const latDiff = Math.abs(parseFloat(cp.lat) - parseFloat(qrLat));
  const lngDiff = Math.abs(parseFloat(cp.lng) - parseFloat(qrLng));
  if (latDiff < 0.001 && lngDiff < 0.001) return true;

  return false;
}

app.post('/api/v1/scans', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ success: false, message: 'Missing or invalid token' }, 401);
    }
    
    let payload;
    try {
      const token = authHeader.split(' ')[1];
      payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    } catch (e) {
      return c.json({ success: false, message: 'Invalid or expired token' }, 401);
    }
    const guard_id = payload.sub as string;

    const body = await c.req.json();
    const { 
      client_scan_id, 
      checkpoint_id, 
      qr_lat, 
      qr_lng, 
      signature, 
      guard_lat, 
      guard_lng, 
      uptime_seconds, 
      selfie_url,
      location_photo_url,
      photo_url 
    } = scanSchema.parse(body);

    const supabase = getSupabase(c.env);

    const isSignatureValid = await isValidCheckpointSignature(
      supabase,
      c.env.QR_SECRET,
      checkpoint_id,
      qr_lat,
      qr_lng,
      signature
    );

    if (!isSignatureValid) {
      return c.json({ success: false, message: 'Invalid or forged QR Code detected.' }, 403);
    }

    const url = new URL(c.req.url);

    const uploadToR2 = async (base64Str?: string, prefix: string = 'scan') => {
      if (!base64Str) return null;
      try {
        const cleanData = base64Str.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(cleanData), char => char.charCodeAt(0));
        const fileName = `scans/${prefix}_${client_scan_id}_${Date.now()}.jpg`;
        
        await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        return `${url.origin}/api/v1/media/${fileName}`;
      } catch (err) {
        return null;
      }
    };

    const finalSelfieUrl = await uploadToR2(selfie_url || photo_url, 'selfie');
    const finalLocationUrl = await uploadToR2(location_photo_url, 'location') || finalSelfieUrl;

    const { data, error } = await supabase.rpc('log_patrol_scan', {
      p_client_scan_id: client_scan_id,
      p_checkpoint_id: checkpoint_id,
      p_guard_id: guard_id,
      p_guard_lat: guard_lat,
      p_guard_lng: guard_lng,
      p_expected_lat: parseFloat(qr_lat),
      p_expected_lng: parseFloat(qr_lng),
      p_uptime_seconds: uptime_seconds || 0,
      p_photo_url: finalLocationUrl || ''
    });

    if (error) {
      return c.json({ success: false, message: 'Database error', error }, 500);
    }

    await supabase
      .from('scans')
      .update({
        selfie_url: finalSelfieUrl,
        location_photo_url: finalLocationUrl,
        guard_lat: guard_lat,
        guard_lng: guard_lng
      })
      .eq('client_scan_id', client_scan_id);

    return c.json({ success: true, verification: data });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: 'Invalid data format', errors: error.errors }, 400);
    }
    return c.json({ success: false, message: 'Server error' }, 500);
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
      return c.json({ success: false, message: error.message }, 500);
    }

    return c.json({ success: true, scans: data || [] });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
  }
});

app.get('/api/v1/rounds/:id/scans', async (c) => {
  try {
    const roundId = c.req.param('id');
    const supabase = getSupabase(c.env);

    const [cpRes, guardsRes] = await Promise.all([
      supabase.from('checkpoints').select('checkpoint_id, name, lat, lng').eq('round_id', roundId),
      supabase.from('guards').select('guard_id, full_name, employee_code')
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
    return c.json({ success: false, message: error.message || 'Failed to fetch round scans' }, 500);
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
    return c.json({ success: false, message: error.message || 'Failed to start session' }, 500);
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
    return c.json({ success: false, message: error.message || 'Ping failed' }, 500);
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
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post('/api/v1/patrols/sync', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);
    
    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    const guard_id = payload.sub as string;

    const url = new URL(c.req.url);
    const body = await c.req.json();
    const scans = body.scans;
    const results = [];

    const supabase = getSupabase(c.env);

    for (const scan of scans) {
      const isValid = await isValidCheckpointSignature(
        supabase,
        c.env.QR_SECRET,
        scan.checkpoint_id,
        String(scan.qr_lat),
        String(scan.qr_lng),
        scan.signature
      );

      if (!isValid) {
        results.push({ client_scan_id: scan.client_scan_id, status: 'failed', reason: 'Invalid Signature' });
        continue;
      }

      let selfieUrl = '';
      let locationUrl = '';

      if (scan.selfie_url) {
        const base64Data = scan.selfie_url.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
        const fileName = `scans/selfie_${scan.client_scan_id}.jpg`;
        await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        selfieUrl = `${url.origin}/api/v1/media/${fileName}`;
      }

      if (scan.location_photo_url) {
        const base64Data = scan.location_photo_url.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
        const fileName = `scans/location_${scan.client_scan_id}.jpg`;
        await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        locationUrl = `${url.origin}/api/v1/media/${fileName}`;
      }

      const { data, error } = await supabase.rpc('log_patrol_scan', {
        p_client_scan_id: scan.client_scan_id,
        p_checkpoint_id: scan.checkpoint_id,
        p_guard_id: guard_id,
        p_guard_lat: scan.guard_lat,
        p_guard_lng: scan.guard_lng,
        p_expected_lat: parseFloat(scan.qr_lat),
        p_expected_lng: parseFloat(scan.qr_lng),
        p_uptime_seconds: scan.uptime_seconds || 0,
        p_photo_url: locationUrl || selfieUrl
      });

      if (!error) {
        await supabase
          .from('scans')
          .update({
            selfie_url: selfieUrl,
            location_photo_url: locationUrl,
            guard_lat: scan.guard_lat,
            guard_lng: scan.guard_lng
          })
          .eq('client_scan_id', scan.client_scan_id);
      }

      if (error) {
        results.push({ client_scan_id: scan.client_scan_id, status: 'failed', reason: 'DB Error' });
      } else {
        results.push({ client_scan_id: scan.client_scan_id, status: data.status, verification: data });
      }
    }

    return c.json({ success: true, synced_items: results });

  } catch (error) {
    return c.json({ success: false, message: 'Sync failed', error }, 500);
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

    if (error) return c.json({ success: false, message: error.message }, 500);

    return c.json({
      success: true,
      is_active: !!activeShift,
      shift: activeShift || null
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
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
        status: 'ACTIVE',
        start_time: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) return c.json({ success: false, message: error.message }, 500);

    return c.json({ success: true, message: 'Shift started', shift: newShift }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
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

    if (error) return c.json({ success: false, message: error.message }, 500);

    return c.json({
      success: true,
      message: 'Shift ended',
      shifts_closed: updatedShifts?.length || 0
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
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

    if (roundsRes.error) return c.json({ success: false, message: roundsRes.error.message }, 500);
    if (cpRes.error) return c.json({ success: false, message: cpRes.error.message }, 500);

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

      return {
        ...round,
        assigned_guards: assignedGuards,
        checkpoints: checkpoints
          .filter((cp) => cp.round_id === round.id)
          .map((cp) => ({
            id: cp.checkpoint_id,
            name: cp.name,
            lat: cp.lat,
            lng: cp.lng,
            qr_payload: cp.qr_payload
          }))
      };
    });

    return c.json({ success: true, rounds: roundsWithCheckpoints });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
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

      if (updateError) return c.json({ success: false, message: updateError.message }, 500);

      await supabase.from('checkpoints').delete().eq('round_id', activeRoundId);
    } else {
      const { data: newRound, error: insertError } = await supabase
        .from('rounds')
        .insert([{ name, tenant_id: roundTenant }])
        .select()
        .single();

      if (insertError) return c.json({ success: false, message: insertError.message }, 500);
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
        return c.json({ success: false, message: cpInsertError.message }, 500);
      }
    }

    return c.json({ success: true, round_id: activeRoundId });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: 'Invalid payload', errors: error.errors }, 400);
    }
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
  }
});

app.delete('/api/v1/rounds/:id', async (c) => {
  try {
    const roundId = c.req.param('id');
    const supabase = getSupabase(c.env);

    const { error } = await supabase.from('rounds').delete().eq('id', roundId);
    if (error) return c.json({ success: false, message: error.message }, 500);

    return c.json({ success: true, message: 'Round deleted' });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
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
        assigned_round_ids: uniqueRoundIds,
        rounds: assignedRounds[0] || null,
        assigned_rounds: assignedRounds,
        tier: g.tier,
        app_permissions: callerAuth.tier === 'SUPER_ADMIN' ? hybrid.permissions : resolveAccess(callerAuth.tenant_features, hybrid.permissions).active_permissions,
        app_permissions_override: rawOverrides,
        is_custom_override: hybrid.is_custom_override,
        role_defaults: hybrid.role_defaults
      };
    }));

    return c.json({ success: true, guards: guardsWithRounds, licensed_permission_keys: ceiling, incident_form_fields_all: INCIDENT_FORM_FIELDS.map((f) => f.id) });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Failed to fetch guards' }, 500);
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
    return c.json({ success: false, message: error.message }, 500);
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
    return c.json({ success: false, message: error.message }, 500);
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
    return c.json({ success: false, message: error.message }, 500)
  }
})

// ==========================================
// PLATFORM SUPER ADMIN ONLY: tenants + what each industry bought
// (Industry admins get 404 on every /super-admin route; see gate block.)
// ==========================================
app.get('/api/v1/super-admin/tenants', async (c) => {
  try {
    const supabase = getSupabase(c.env)
    const { data, error } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return c.json({ success: true, tenants: data || [] })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
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
      .insert([{ name, status: 'ACTIVE', features: normalizeTenantFeatures(body.features) }])
      .select().single()
    if (error) throw error
    return c.json({ success: true, tenant: data }, 201)
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
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
    return c.json({ success: false, message: error.message }, 500)
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
    return c.json({ success: false, message: error.message }, 500)
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
    const newTier = 'USER';
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
    return c.json({ success: false, message: error.message || 'Failed to create guard' }, 500);
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
    return c.json({ success: false, message: error.message || 'Failed to update guard' }, 500);
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
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
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

    let finalPhotoUrl = null;
    if (photo_url) {
      try {
        const base64Data = photo_url.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
        const fileName = `incidents/${incidentUuid}.jpg`;
        
        await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        finalPhotoUrl = `${url.origin}/api/v1/media/${fileName}`;
      } catch (e) {
        finalPhotoUrl = photo_url;
      }
    }

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
    let emailResult = { ok: false, recipients: [] as string[], error: 'Module not licensed' };
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
    return c.json({ success: false, message: error.message || 'Failed to fetch incident details' }, 500);
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

    let finalPhotoUrl = null;
    if (photo_base64) {
      try {
        const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
        const fileName = `incident_updates/${incidentId}_${Date.now()}.jpg`;
        
        await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        finalPhotoUrl = `${url.origin}/api/v1/media/${fileName}`;
      } catch (e) {
        finalPhotoUrl = photo_base64;
      }
    }

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
    return c.json({ success: false, message: error.message || 'Failed to update incident' }, 500);
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
    return c.json({ success: false, message: error.message || 'Failed to resolve incident' }, 500);
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

    if (error) return c.json({ success: false, message: error.message }, 500);
    return c.json({ success: true, message: 'Incident deleted successfully' });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Failed to delete incident' }, 500);
  }
});

// ==========================================
// 7. ADMIN CONFIGS & GOOGLE OAUTH2 REFRESH TOKEN DISPATCH
// ==========================================
app.get('/api/v1/admin/configs', async (c) => {
  try {
    const a = c.get('auth');
    const tenantId = a.tier === 'SUPER_ADMIN' ? c.req.query('tenant_id') : a.tenant_id;
    if (!tenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);
    const supabase = getSupabase(c.env);
    const features = await tenantFeaturesFor(supabase, tenantId);
    const cfg = await loadTenantConfig(supabase, tenantId);

    const configs = Object.entries(cfg)
      .filter(([k]) => a.tier === 'SUPER_ADMIN' || configKeyAllowed(k, features))
      // Secrets are write-only from the browser. Show that one is set, never its value.
      .map(([k, v]) => ({ key_name: k, key_value: SECRET_KEYS.has(k) && v ? MASK : v }));
    return c.json({ success: true, configs });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to load configs' }, 500);
  }
});

app.post('/api/v1/admin/configs', async (c) => {
  try {
    const a = c.get('auth');
    const tenantId = a.tier === 'SUPER_ADMIN' ? c.req.query('tenant_id') : a.tenant_id;
    if (!tenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);
    const body = await c.req.json();
    const rows: any[] = Array.isArray(body) ? body : [body];
    const supabase = getSupabase(c.env);
    const features = await tenantFeaturesFor(supabase, tenantId);

    const toWrite: { key_name: string; key_value: any }[] = [];
    for (const r of rows) {
      const key = String(r?.key_name || '');
      if (!key) continue;
      if (a.tier !== 'SUPER_ADMIN' && !configKeyAllowed(key, features)) {
        return c.json({ success: false, message: 'Not Found' }, 404); // not purchased => does not exist
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
  const result = await sendGroupAssignmentEmail(c.env, {
    incidentId: '100999',
    priority: 'P2 - High',
    description: 'This is a live verification email from Rakshak Patrol using your Google OAuth2 credentials.',
    photoUrl: null,
    assignmentGroup: 'Security Operations L1',
    assignedTo: 'System Test',
    status: 'ACTIVE',
    includeManagerFallback: true,
    tenantId: c.req.query('tenant_id') || c.get('auth').tenant_id,
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

    const memberEmail = (g.email || ext.email || '').trim();
    if (belongsToTargetGroup && memberEmail && memberEmail.includes('@')) {
      recipientSet.add(memberEmail);
    }
  });

  if (params.includeManagerFallback) {
    const managerEmail = (configMap['MANAGER_EMAIL'] || '').trim();
    if (managerEmail && managerEmail.includes('@')) {
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

  const caseNumber = `RKS-${params.incidentId.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6)}`;
  const subjectText = `[Rakshak Dispatch - ${params.assignmentGroup}] ${params.priority} Case ${caseNumber}`;
  const encodedSubject = `=?utf-8?B?${utf8ToBase64(subjectText)}?=`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 620px; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden;">
      <div style="background: #0f172a; color: #ffffff; padding: 16px 20px;">
        <h2 style="margin: 0; font-size: 17px;">Rakshak Security Dispatch Alert</h2>
        <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">
          Assignment Group: <strong style="color:#38bdf8;">${params.assignmentGroup}</strong> • Case: ${caseNumber}
        </p>
      </div>
      <div style="padding: 20px; color: #1e293b; font-size: 13px; line-height: 1.6; background: #ffffff;">
        <p style="margin-top:0;">This security incident has been assigned to <strong>${params.assignmentGroup}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px;">
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold; width: 35%;">Case ID</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace;">${caseNumber}</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Severity / Status</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>${params.priority}</strong> (${params.status})</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Assignment Group</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${params.assignmentGroup}</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Assigned Responder</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${params.assignedTo || 'Unassigned (Group Queue)'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Description</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${params.description}</td>
          </tr>
          ${params.workNote ? `
          <tr>
            <td style="padding: 6px 8px; background: #fffbeb; border: 1px solid #fde68a; font-weight: bold;">Instructions</td>
            <td style="padding: 6px 8px; background: #fffbeb; border: 1px solid #fde68a;">${params.workNote}</td>
          </tr>` : ''}
        </table>
        ${params.photoUrl ? `<div style="margin-top: 14px;"><img src="${params.photoUrl}" alt="Incident Evidence" style="max-width: 100%; max-height: 260px; border-radius: 8px; border: 1px solid #cbd5e1;"/></div>` : ''}
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

async function sendGoogleEmergencyEmail(env: Bindings, tenantId: string, incidentId: string, priority: string, description: string, photoUrl: string | null) {
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
  });
  return res.ok;
}

// --- WORKER EXPORT ---
export default {
  fetch: async (request: Request, env: Bindings, ctx: ExecutionContext) => {
    return app.fetch(request, env, ctx)
  },
  
  scheduled: async (event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
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
        jobs.push(sendGoogleEmergencyEmail(env, incident.tenant_id, incident.client_incident_id, incident.priority, incident.description, incident.photo_url));
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