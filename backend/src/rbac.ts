import { verify } from 'hono/jwt'

// =====================================================================
// THREE-TIER MODEL
//   SUPER_ADMIN     -> platform owner. Sets what each industry (tenant) bought.
//   INDUSTRY_ADMIN  -> CSO / plant head. Allocates purchased features to users.
//   USER            -> field guard / supervisor. Sees only the final cascade.
//
// Final feature = (Super Admin enabled for tenant) AND (Industry Admin enabled for user)
// Fail-CLOSED: anything missing, null or malformed resolves to "off".
// =====================================================================

export type Tier = 'SUPER_ADMIN' | 'INDUSTRY_ADMIN' | 'USER'

// ---------- Tier 1: what an industry bought (stored in tenants.features) ----------
export interface TenantFeatures {
  module_patrol: {
    enabled: boolean
    allow_route_assignment: boolean
    allow_live_gps_trail: boolean
    allow_geofence_audit: boolean
  }
  module_incidents: {
    enabled: boolean
    allow_web_ticket_queue: boolean
    allow_mobile_incident_creation: boolean
    allowed_creation_options: {
      option_1_severity: boolean
      option_2_category: boolean
      option_3_group_routing: boolean
      option_4_title: boolean
      option_5_description: boolean
      option_6_camera_photo: boolean
    }
  }
  module_integrations: {
    enabled: boolean
    channels: { gmail_oauth: boolean; whatsapp_api: boolean; telegram_bot: boolean }
  }
  module_qr_generator: { enabled: boolean; allow_pdf_export: boolean }
  module_activity_logs: { enabled: boolean }
  module_sync_queue: { enabled: boolean }
}

// Nothing is licensed by default. A new tenant must be explicitly provisioned.
export const NO_FEATURES: TenantFeatures = {
  module_patrol: { enabled: false, allow_route_assignment: false, allow_live_gps_trail: false, allow_geofence_audit: false },
  module_incidents: {
    enabled: false,
    allow_web_ticket_queue: false,
    allow_mobile_incident_creation: false,
    allowed_creation_options: {
      option_1_severity: false,
      option_2_category: false,
      option_3_group_routing: false,
      option_4_title: false,
      option_5_description: false,
      option_6_camera_photo: false,
    },
  },
  module_integrations: { enabled: false, channels: { gmail_oauth: false, whatsapp_api: false, telegram_bot: false } },
  module_qr_generator: { enabled: false, allow_pdf_export: false },
  module_activity_logs: { enabled: false },
  module_sync_queue: { enabled: false },
}

// Every flag is read with `=== true` so a missing/garbled value can never grant access.
export function normalizeTenantFeatures(raw: any): TenantFeatures {
  const t = (v: any) => v === true
  const r = raw && typeof raw === 'object' ? raw : {}
  const p = r.module_patrol || {}
  const i = r.module_incidents || {}
  const o = i.allowed_creation_options || {}
  const g = r.module_integrations || {}
  const ch = g.channels || {}
  const q = r.module_qr_generator || {}
  return {
    module_patrol: {
      enabled: t(p.enabled),
      allow_route_assignment: t(p.enabled) && t(p.allow_route_assignment),
      allow_live_gps_trail: t(p.enabled) && t(p.allow_live_gps_trail),
      allow_geofence_audit: t(p.enabled) && t(p.allow_geofence_audit),
    },
    module_incidents: {
      enabled: t(i.enabled),
      allow_web_ticket_queue: t(i.enabled) && t(i.allow_web_ticket_queue),
      allow_mobile_incident_creation: t(i.enabled) && t(i.allow_mobile_incident_creation),
      allowed_creation_options: {
        option_1_severity: t(i.enabled) && t(o.option_1_severity),
        option_2_category: t(i.enabled) && t(o.option_2_category),
        option_3_group_routing: t(i.enabled) && t(o.option_3_group_routing),
        option_4_title: t(i.enabled) && t(o.option_4_title),
        option_5_description: t(i.enabled) && t(o.option_5_description),
        option_6_camera_photo: t(i.enabled) && t(o.option_6_camera_photo),
      },
    },
    module_integrations: {
      enabled: t(g.enabled),
      channels: {
        gmail_oauth: t(g.enabled) && t(ch.gmail_oauth),
        whatsapp_api: t(g.enabled) && t(ch.whatsapp_api),
        telegram_bot: t(g.enabled) && t(ch.telegram_bot),
      },
    },
    module_qr_generator: { enabled: t(q.enabled), allow_pdf_export: t(q.enabled) && t(q.allow_pdf_export) },
    module_activity_logs: { enabled: t((r.module_activity_logs || {}).enabled) },
    module_sync_queue: { enabled: t((r.module_sync_queue || {}).enabled) },
  }
}

// ---------- Tier 2/3: what the Industry Admin allocated to a user ----------
export interface AppPermissions {
  patrol_route: boolean
  report_incident: boolean
  incident_tickets: boolean
  activity_log: boolean
  sync_queue: boolean
  incident_option_1_severity: boolean
  incident_option_2_category: boolean
  incident_option_3_group: boolean
  incident_option_4_title: boolean
  incident_option_5_description: boolean
  incident_option_6_photo: boolean
}

export const PERMISSION_KEYS: (keyof AppPermissions)[] = [
  'patrol_route', 'report_incident', 'incident_tickets', 'activity_log', 'sync_queue',
  'incident_option_1_severity', 'incident_option_2_category', 'incident_option_3_group',
  'incident_option_4_title', 'incident_option_5_description', 'incident_option_6_photo',
]

// The 6 incident-form fields in their canonical order.
// The UI numbers whatever survives the cascade 1..n with no gaps.
export const INCIDENT_FORM_FIELDS = [
  { id: 'severity', perm: 'incident_option_1_severity' },
  { id: 'category', perm: 'incident_option_2_category' },
  { id: 'group', perm: 'incident_option_3_group' },
  { id: 'title', perm: 'incident_option_4_title' },
  { id: 'description', perm: 'incident_option_5_description' },
  { id: 'photo', perm: 'incident_option_6_photo' },
] as const

export function emptyPermissions(): AppPermissions {
  const out: any = {}
  for (const k of PERMISSION_KEYS) out[k] = false
  return out as AppPermissions
}

export interface ResolvedAccess {
  active_permissions: AppPermissions
  visible_modules: Record<string, boolean>
  incident_form_fields: string[] // ordered, already filtered. UI numbers them 1..n.
}

/**
 * THE CASCADE.  final = tenantLicense AND userAllocation.
 * userAllocation must be an explicit `true` (no "default true" for missing keys).
 */
export function resolveAccess(tenantRaw: any, user: Partial<AppPermissions> | null | undefined): ResolvedAccess {
  const tf = normalizeTenantFeatures(tenantRaw)
  const u: any = user || {}
  const on = (k: keyof AppPermissions) => u[k] === true
  const inc = tf.module_incidents
  const o = inc.allowed_creation_options

  const active: AppPermissions = {
    patrol_route: tf.module_patrol.enabled && on('patrol_route'),
    report_incident: inc.enabled && inc.allow_mobile_incident_creation && on('report_incident'),
    incident_tickets: inc.enabled && inc.allow_web_ticket_queue && on('incident_tickets'),
    activity_log: tf.module_activity_logs.enabled && on('activity_log'),
    sync_queue: tf.module_sync_queue.enabled && on('sync_queue'),
    incident_option_1_severity: inc.enabled && o.option_1_severity && on('incident_option_1_severity'),
    incident_option_2_category: inc.enabled && o.option_2_category && on('incident_option_2_category'),
    incident_option_3_group: inc.enabled && o.option_3_group_routing && on('incident_option_3_group'),
    incident_option_4_title: inc.enabled && o.option_4_title && on('incident_option_4_title'),
    incident_option_5_description: inc.enabled && o.option_5_description && on('incident_option_5_description'),
    incident_option_6_photo: inc.enabled && o.option_6_camera_photo && on('incident_option_6_photo'),
  }

  // An incident form with no fields is useless; if the guard can't fill anything, hide the entry point too.
  const fields = INCIDENT_FORM_FIELDS.filter((f) => active[f.perm as keyof AppPermissions]).map((f) => f.id as string)
  if (fields.length === 0) active.report_incident = false

  return {
    active_permissions: active,
    // Modules the *tenant* bought. Industry-admin console uses these; users get active_permissions only.
    visible_modules: {
      module_patrol: tf.module_patrol.enabled,
      module_incidents: inc.enabled,
      module_qr_generator: tf.module_qr_generator.enabled,
      module_integrations: tf.module_integrations.enabled,
      module_activity_logs: tf.module_activity_logs.enabled,
      module_sync_queue: tf.module_sync_queue.enabled,
      integration_gmail: tf.module_integrations.channels.gmail_oauth,
      integration_whatsapp: tf.module_integrations.channels.whatsapp_api,
      integration_telegram: tf.module_integrations.channels.telegram_bot,
    },
    incident_form_fields: fields,
  }
}

/** Industry admin can only grant what the tenant owns. Anything else is silently dropped. */
export function clampToTenant(tenantRaw: any, requested: Record<string, any> | null | undefined): Partial<AppPermissions> {
  const ceiling = resolveAccess(tenantRaw, Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]))).active_permissions
  const out: any = {}
  for (const k of PERMISSION_KEYS) {
    if (requested && k in requested) out[k] = requested[k] === true && ceiling[k] === true
  }
  return out
}

// =====================================================================
// MIDDLEWARE
// =====================================================================
export interface AuthContext {
  guard_id: string
  tier: Tier
  role: string
  employee_code: string
  tenant_id: string | null
  tenant_active: boolean
  tenant_features: TenantFeatures
  access: ResolvedAccess
}

export function tierFrom(row: { tier?: string | null }): Tier {
  if (row.tier === 'SUPER_ADMIN' || row.tier === 'INDUSTRY_ADMIN') return row.tier
  return 'USER'
}

const ALL_PERMS_TRUE = () => Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]))

/**
 * Single source of truth used by login, /my-permissions and the auth middleware.
 * Always built from the DB row, never from JWT claims, so revoking a feature or disabling
 * a tenant takes effect on the very next request.
 */
export async function buildAuthContext(
  supabase: any,
  guard: any,
  loadUserPerms: (supabase: any, guard: any) => Promise<Partial<AppPermissions>>
): Promise<AuthContext> {
  const tier = tierFrom(guard)
  let tenantRaw: any = null
  let tenantActive = false
  if (guard.tenant_id) {
    const { data: tenant } = await supabase.from('tenants').select('features, status').eq('id', guard.tenant_id).maybeSingle()
    if (tenant && (tenant.status || 'ACTIVE') === 'ACTIVE') {
      tenantRaw = tenant.features
      tenantActive = true
    }
  }

  let access: ResolvedAccess
  if (tier === 'SUPER_ADMIN') {
    // Platform owner bypasses tenant licensing entirely.
    access = resolveAccess(
      {
        module_patrol: { enabled: true, allow_route_assignment: true, allow_live_gps_trail: true, allow_geofence_audit: true },
        module_incidents: {
          enabled: true, allow_web_ticket_queue: true, allow_mobile_incident_creation: true,
          allowed_creation_options: {
            option_1_severity: true, option_2_category: true, option_3_group_routing: true,
            option_4_title: true, option_5_description: true, option_6_camera_photo: true,
          },
        },
        module_integrations: { enabled: true, channels: { gmail_oauth: true, whatsapp_api: true, telegram_bot: true } },
        module_qr_generator: { enabled: true, allow_pdf_export: true },
        module_activity_logs: { enabled: true },
        module_sync_queue: { enabled: true },
      },
      ALL_PERMS_TRUE()
    )
    tenantActive = true
  } else if (tier === 'INDUSTRY_ADMIN') {
    // A plant admin automatically holds everything their plant bought, nothing more.
    access = resolveAccess(tenantRaw, ALL_PERMS_TRUE())
  } else {
    access = resolveAccess(tenantRaw, await loadUserPerms(supabase, guard))
  }

  return {
    guard_id: guard.guard_id,
    tier,
    role: guard.role || 'Guard',
    employee_code: guard.employee_code,
    tenant_id: guard.tenant_id || null,
    tenant_active: tenantActive,
    tenant_features: normalizeTenantFeatures(tenantRaw),
    access,
  }
}

/**
 * What the web console may render. Admins see modules their tenant bought.
 * Users see only what survived BOTH gates (derived from active_permissions).
 */
export function uiModules(ctx: AuthContext): Record<string, boolean> {
  if (ctx.tier !== 'USER') return ctx.access.visible_modules
  const p = ctx.access.active_permissions
  return {
    module_patrol: p.patrol_route,
    module_incidents: p.incident_tickets || p.report_incident,
    module_activity_logs: p.activity_log,
    module_sync_queue: p.sync_queue,
    module_qr_generator: false,
    module_integrations: false,
  }
}

export function makeRequireAuth(
  getSupabase: (env: any) => any,
  loadUserPerms: (supabase: any, guard: any) => Promise<Partial<AppPermissions>>
) {
  return async function requireAuth(c: any, next: () => Promise<void>) {
    const h = c.req.header('Authorization')
    if (!h || !h.startsWith('Bearer ')) return c.json({ success: false, message: 'Authentication required.' }, 401)
    let payload: any
    try {
      payload = await verify(h.split(' ')[1], c.env.JWT_SECRET, 'HS256')
    } catch {
      return c.json({ success: false, message: 'Invalid or expired token.' }, 401)
    }
    const supabase = getSupabase(c.env)
    const { data: guard } = await supabase
      .from('guards')
      .select('guard_id, employee_code, role, tier, is_active, tenant_id, app_permissions')
      .eq('guard_id', payload.sub)
      .maybeSingle()
    if (!guard || guard.is_active === false) return c.json({ success: false, message: 'Account disabled.' }, 401)

    const ctx = await buildAuthContext(supabase, guard, loadUserPerms)
    if (ctx.tier !== 'SUPER_ADMIN' && !ctx.tenant_active) {
      return c.json({ success: false, message: 'Organization is suspended or not provisioned.' }, 403)
    }
    c.set('auth', ctx)
    await next()
  }
}

/** Tenant-level sub-flag gate (e.g. live GPS trail). Not purchased -> 404. */
export function requireTenantFlag(pick: (f: TenantFeatures) => boolean) {
  return async (c: any, next: () => Promise<void>) => {
    const a = c.get('auth') as AuthContext
    if (a.tier !== 'SUPER_ADMIN' && !pick(a.tenant_features)) return c.json({ success: false, message: 'Not Found' }, 404)
    await next()
  }
}

/** Tier gate. Wrong tier gets 404 (the route does not "exist" for you) so tier structure is not revealed. */
export function requireTier(...allowed: Tier[]) {
  return async (c: any, next: () => Promise<void>) => {
    const a = c.get('auth') as AuthContext
    if (!allowed.includes(a.tier)) return c.json({ success: false, message: 'Not Found' }, 404)
    await next()
  }
}

/** Gate 1: tenant must own the module. Not owned -> 404, as if the endpoint does not exist. */
export function requireModule(moduleKey: keyof ResolvedAccess['visible_modules'] | string) {
  return async (c: any, next: () => Promise<void>) => {
    const a = c.get('auth') as AuthContext
    if (a.tier !== 'SUPER_ADMIN' && a.access.visible_modules[moduleKey] !== true) {
      return c.json({ success: false, message: 'Not Found' }, 404)
    }
    await next()
  }
}

/** Gate 2: module owned, but this user was not allocated the feature -> 403. */
export function requirePermission(perm: keyof AppPermissions) {
  return async (c: any, next: () => Promise<void>) => {
    const a = c.get('auth') as AuthContext
    if (a.tier !== 'SUPER_ADMIN' && a.access.active_permissions[perm] !== true) {
      return c.json({ success: false, message: 'Forbidden' }, 403)
    }
    await next()
  }
}

/** Scope helper: returns the tenant a query must be limited to. Super admin may pass ?tenant_id= to target one. */
export function scopeTenant(c: any): string | null | undefined {
  const a = c.get('auth') as AuthContext
  if (a.tier === 'SUPER_ADMIN') return c.req.query('tenant_id') || undefined // undefined = all tenants
  return a.tenant_id // string, or null => matches nothing (see applyTenant)
}

/** Apply tenant filter to a supabase query builder. A user without a tenant sees nothing. */
export function applyTenant<T extends { eq: any }>(q: T, tenant: string | null | undefined): T {
  if (tenant === undefined) return q
  if (tenant === null) return q.eq('tenant_id', '00000000-0000-0000-0000-000000000000')
  return q.eq('tenant_id', tenant)
}
