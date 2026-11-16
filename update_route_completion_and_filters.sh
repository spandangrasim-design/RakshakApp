#!/bin/bash
set -e

echo "🚀 Applying Route-Completion Auto-Email (Guard-Isolated) & Frontend Date/Guard/Shift Filters..."

# ==============================================================================
# 1. BACKEND: Guard-isolated route completion email + date/guard/shift filtering
# ==============================================================================
python3 - << 'PYEOF'
with open("backend/src/index.ts", "r", encoding="utf-8") as f:
    code = f.read()

# A. Add `dispatchRouteCompletionReport` right before `app.post('/api/v1/field/runs/:id/complete'`
route_complete_helper = '''
async function dispatchRouteCompletionReport(
  env: Bindings,
  tenantId: string,
  guardId: string,
  session: any,
  doneAt: string
) {
  try {
    const supabase = getSupabase(env);
    const { data: tenant } = await supabase.from('tenants').select('id, name, features, status').eq('id', tenantId).maybeSingle();
    if (!tenant || (tenant.status || 'ACTIVE') !== 'ACTIVE') return;
    const f = normalizeTenantFeatures(tenant.features);
    if (!f.module_patrol.allow_daily_reports || !f.module_integrations.channels.gmail_oauth) return;

    const cfg = await loadTenantConfig(supabase, tenantId);
    if (cfg['DAILY_REPORT_ENABLED'] === 'false') return;

    const [guardRes, roundRes, cpsRes, scansRes, incRes] = await Promise.all([
      supabase.from('guards').select('*').eq('guard_id', guardId).maybeSingle(),
      supabase.from('rounds').select('id, name').eq('id', session.round_id).maybeSingle(),
      supabase.from('checkpoints').select('checkpoint_id, round_id, name, lat, lng').eq('round_id', session.round_id),
      supabase.from('scans').select('*')
        .eq('tenant_id', tenantId)
        .eq('guard_id', guardId)
        .eq('round_id', session.round_id)
        .gte('scan_time', session.start_time)
        .lte('scan_time', doneAt)
        .order('scan_time', { ascending: true }),
      // STRICT ISOLATION: only incidents logged by THIS guard during THIS route window
      supabase.from('incidents').select('*')
        .eq('tenant_id', tenantId)
        .eq('guard_id', guardId)
        .gte('reported_at', session.start_time)
        .lte('reported_at', doneAt)
        .order('reported_at', { ascending: true }),
    ]);

    const guard = guardRes.data;
    if (!guard) return;
    const roundName = roundRes.data?.name || 'Patrol Route';
    const checkpoints: any[] = cpsRes.data || [];
    const scans: any[] = scansRes.data || [];
    const incidents: any[] = incRes.data || [];
    const cpById = new Map<string, any>(checkpoints.map((c) => [String(c.checkpoint_id), c]));

    // Collect recipients from Shift/Route schedule + fallback + assigned supervisor
    let schedules: Record<string, { enabled: boolean; emails: string }> = {};
    try { schedules = JSON.parse(cfg['REPORT_SCHEDULES_JSON'] || '{}'); } catch {}
    const recipSet = new Set<string>(await reportRecipients(supabase, cfg, guard));
    for (const raw of [schedules.shift?.emails, schedules.daily?.emails]) {
      for (const e of String(raw || '').split(/[,;\\s]+/)) {
        const ok = safeEmail(e);
        if (ok) recipSet.add(ok);
      }
    }
    const recipients = [...recipSet];
    if (recipients.length === 0) return;

    const mapHtml = buildStaticRouteMapSvg(checkpoints, scans);
    const startHM = localHM(env, new Date(session.start_time).getTime());
    const endHM = localHM(env, new Date(doneAt).getTime());
    const dateStr = localDate(env, new Date(doneAt).getTime());
    const plantName = tenant.name || 'Enterprise Security Site';

    const cellHead = 'padding:8px 10px;background:#f8fafc;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;border-bottom:1px solid #e2e8f0;text-align:left;';
    const cellRow = 'padding:8px 10px;font-size:12px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle;';

    const subject = `[${plantName}] Route Completed: ${roundName} · ${guard.full_name} · ${dateStr}`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:760px;margin:0 auto;padding:20px;background:#f1f5f9;color:#0f172a;">
        <div style="background:#0f172a;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;">
          <div style="font-size:11px;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;">Spandan IT Professionals · Instant Patrol Completion Alert</div>
          <h2 style="margin:6px 0 0;font-size:20px;font-weight:800;">Route Completed: ${esc(roundName)}</h2>
          <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">
            Guard: <strong>${esc(guard.full_name)}</strong> (${esc(guard.employee_code || '—')}) | Window: <strong>${esc(startHM)} – ${esc(endHM)}</strong> | Date: <strong>${esc(dateStr)}</strong>
          </p>
        </div>
        <div style="background:#ffffff;padding:22px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
            <tr>
              <td style="padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;text-align:center;width:33%;">
                <div style="font-size:10px;color:#166534;font-weight:700;text-transform:uppercase;">Route Status</div>
                <div style="font-size:18px;font-weight:800;color:#15803d;margin-top:2px;">COMPLETED</div>
              </td>
              <td style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;width:33%;">
                <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;">Checkpoints Verified</div>
                <div style="font-size:18px;font-weight:800;color:#2563eb;margin-top:2px;">${scans.length} / ${checkpoints.length}</div>
              </td>
              <td style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;width:33%;">
                <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;">Incidents by Guard</div>
                <div style="font-size:18px;font-weight:800;color:${incidents.length > 0 ? '#dc2626' : '#16a34a'};margin-top:2px;">${incidents.length}</div>
              </td>
            </tr>
          </table>

          <h3 style="margin:0 0 8px;font-size:14px;color:#0f172a;">Checkpoint GPS Verification Log</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-bottom:16px;">
            <thead><tr>
              <th style="${cellHead}">Time</th>
              <th style="${cellHead}">Checkpoint</th>
              <th style="${cellHead}">Expected GPS</th>
              <th style="${cellHead}">Captured GPS</th>
              <th style="${cellHead}">Drift</th>
            </tr></thead>
            <tbody>
              ${scans.map((sc) => {
                const cp = cpById.get(String(sc.checkpoint_id));
                const gLat = sc.guard_lat ?? sc.guard_latitude ?? sc.latitude ?? sc.lat;
                const gLng = sc.guard_lng ?? sc.guard_longitude ?? sc.longitude ?? sc.lng;
                return `<tr>
                  <td style="${cellRow}font-size:11px;">${sc.scan_time ? esc(localHM(env, new Date(sc.scan_time).getTime())) : '—'}</td>
                  <td style="${cellRow}font-weight:600;">${esc(cp?.name || sc.checkpoint_id)}</td>
                  <td style="${cellRow}font-family:monospace;font-size:11px;">${cp?.lat ? `${Number(cp.lat).toFixed(5)}, ${Number(cp.lng).toFixed(5)}` : '—'}</td>
                  <td style="${cellRow}font-family:monospace;font-size:11px;">${gLat != null ? `${Number(gLat).toFixed(5)}, ${Number(gLng).toFixed(5)}` : '—'}</td>
                  <td style="${cellRow}">${sc.distance_meters != null ? Number(sc.distance_meters).toFixed(1) + 'm' : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>

          ${mapHtml}

          <h3 style="margin:18px 0 8px;font-size:14px;color:#0f172a;">Incidents Reported During This Route (${esc(guard.full_name)})</h3>
          ${incidents.length === 0 ? `
            <div style="padding:12px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:12px;color:#166534;font-weight:600;">
              ✔ No incidents reported by ${esc(guard.full_name)} during this route.
            </div>
          ` : `
            <table style="width:100%;border-collapse:collapse;border:1px solid #fed7aa;">
              <thead><tr style="background:#fff7ed;">
                <th style="${cellHead}color:#9a3412;">Case #</th>
                <th style="${cellHead}color:#9a3412;">Time</th>
                <th style="${cellHead}color:#9a3412;">Priority</th>
                <th style="${cellHead}color:#9a3412;">Title &amp; Details</th>
                <th style="${cellHead}color:#9a3412;">Status</th>
              </tr></thead>
              <tbody>
                ${incidents.map((i) => `<tr>
                  <td style="${cellRow}font-family:monospace;font-weight:700;color:#c2410c;">${i.case_number ? 'RKS-' + String(i.case_number).padStart(6, '0') : '—'}</td>
                  <td style="${cellRow}font-size:11px;">${i.reported_at ? esc(localHM(env, new Date(i.reported_at).getTime())) : '—'}</td>
                  <td style="${cellRow}"><strong>${esc(i.priority || 'P3')}</strong></td>
                  <td style="${cellRow}"><strong>${esc(i.title || 'Incident')}</strong><div style="font-size:11px;color:#64748b;">${esc(i.description || '')}</div></td>
                  <td style="${cellRow}">${esc(i.status || 'OPEN')}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          `}

          <div style="margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;display:flex;justify-content:space-between;">
            <span>Instant Route Completion Report · <strong>Spandan IT Professionals</strong></span>
            <a href="https://spandanit.com" style="color:#2563eb;text-decoration:none;font-weight:700;">www.spandanit.com</a>
          </div>
        </div>
      </div>
    `;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scans.map((s, idx) => {
      const cp = cpById.get(String(s.checkpoint_id));
      const gLat = s.guard_lat ?? s.guard_latitude ?? s.latitude ?? s.lat;
      const gLng = s.guard_lng ?? s.guard_longitude ?? s.longitude ?? s.lng;
      return {
        '#': idx + 1,
        'Time': s.scan_time ? new Date(s.scan_time).toLocaleString() : '—',
        'Guard': guard.full_name,
        'Route': roundName,
        'Checkpoint': cp?.name || s.checkpoint_id,
        'Expected GPS': cp?.lat ? `${cp.lat}, ${cp.lng}` : '—',
        'Captured GPS': gLat != null ? `${gLat}, ${gLng}` : '—',
        'Drift (m)': s.distance_meters != null ? Number(s.distance_meters).toFixed(1) : '—',
      };
    })), 'Route Scans');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incidents.length > 0 ? incidents.map((i) => ({
      'Case #': i.case_number ? 'RKS-' + String(i.case_number).padStart(6, '0') : '—',
      'Time': i.reported_at ? new Date(i.reported_at).toLocaleString() : '—',
      'Guard': guard.full_name,
      'Priority': i.priority || 'P3',
      'Title': i.title || '—',
      'Description': i.description || '—',
      'Status': i.status || 'OPEN',
    })) : [{ Notice: 'No incidents reported by this guard during this route' }]), 'Guard Incidents');

    const excelBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const filename = `Route_Completed_${roundName.replace(/[^a-zA-Z0-9]/g, '_')}_${guard.full_name.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.xlsx`;

    const res = await sendTenantEmail(env, tenantId, recipients, subject, html, {
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentBase64: excelBase64,
    });

    await supabase.from('daily_report_log').insert({
      tenant_id: tenantId,
      guard_id: guardId,
      shift_name: `Route Completed: ${roundName}`,
      report_date: dateStr,
      status: res.ok ? 'SENT' : 'FAILED',
      error: res.error || null,
      recipients: recipients.join(', '),
      sent_at: res.ok ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error('dispatchRouteCompletionReport error:', err);
  }
}
'''

target_complete = "app.post('/api/v1/field/runs/:id/complete', async (c) => {"
assert target_complete in code, "Could not find /api/v1/field/runs/:id/complete"
code = code.replace(target_complete, route_complete_helper + "\n" + target_complete, 1)

old_complete_return = """    const doneAt = new Date().toISOString();
    const { error } = await supabase.from('patrol_sessions').update({
      status: 'COMPLETED', end_time: doneAt, completed_route: true, paused_at: null, paused_seconds: (session.paused_seconds || 0) + pausedExtraSeconds(session),
    }).eq('id', session.id);
    if (error) throw error;
    return c.json({ success: true, done_at: doneAt });"""

new_complete_return = """    const doneAt = new Date().toISOString();
    const { error } = await supabase.from('patrol_sessions').update({
      status: 'COMPLETED', end_time: doneAt, completed_route: true, paused_at: null, paused_seconds: (session.paused_seconds || 0) + pausedExtraSeconds(session),
    }).eq('id', session.id);
    if (error) throw error;
    if (a.tenant_id && a.guard_id) {
      c.executionCtx.waitUntil(dispatchRouteCompletionReport(c.env, a.tenant_id, a.guard_id, session, doneAt));
    }
    return c.json({ success: true, done_at: doneAt });"""

assert old_complete_return in code, "Could not find complete return block"
code = code.replace(old_complete_return, new_complete_return, 1)

# B. Upgrade `generateTypedReport` and `/api/v1/daily-reports/send-now` to support `guardId`, `dateFrom`, `dateTo`, and `shiftName`
old_gen_sig = """async function generateTypedReport(
  supabase: any,
  env: Bindings,
  tenantId: string,
  tenantName: string,
  reportType: ReportCategory,
  customStartMs?: number,
  customEndMs?: number,
  shiftLabel?: string
) {
  const nowMs = customEndMs || Date.now();
  const siteDayStartMs = new Date(startOfSiteDayISO(env)).getTime();
  let startMs = customStartMs ?? siteDayStartMs;
  if (!customStartMs) {
    if (reportType === 'weekly') startMs = nowMs - 7 * 86400000;
    else if (reportType === 'monthly') startMs = nowMs - 30 * 86400000;
  }"""

new_gen_sig = """async function generateTypedReport(
  supabase: any,
  env: Bindings,
  tenantId: string,
  tenantName: string,
  reportType: ReportCategory,
  customStartMs?: number,
  customEndMs?: number,
  shiftLabel?: string,
  filterGuardId?: string
) {
  const nowMs = customEndMs || Date.now();
  const siteDayStartMs = new Date(startOfSiteDayISO(env)).getTime();
  let startMs = customStartMs ?? siteDayStartMs;
  if (!customStartMs) {
    if (reportType === 'weekly') startMs = nowMs - 7 * 86400000;
    else if (reportType === 'monthly') startMs = nowMs - 30 * 86400000;
  }"""

assert old_gen_sig in code, "Could not find generateTypedReport signature"
code = code.replace(old_gen_sig, new_gen_sig, 1)

old_data_arrays = """  const allGuards: any[] = guardsRes.data || [];
  const rounds: any[] = roundsRes.data || [];
  const checkpoints: any[] = cpsRes.data || [];
  const sessions: any[] = sessionsRes.data || [];
  const scans: any[] = scansRes.data || [];
  const incidents: any[] = incRes.data || [];"""

new_data_arrays = """  const allGuards: any[] = guardsRes.data || [];
  const rounds: any[] = roundsRes.data || [];
  const checkpoints: any[] = cpsRes.data || [];
  let sessions: any[] = sessionsRes.data || [];
  let scans: any[] = scansRes.data || [];
  let incidents: any[] = incRes.data || [];

  if (filterGuardId) {
    sessions = sessions.filter((s) => String(s.guard_id) === String(filterGuardId));
    scans = scans.filter((s) => String(s.guard_id) === String(filterGuardId));
    incidents = incidents.filter((i) => String(i.guard_id) === String(filterGuardId));
  }"""

assert old_data_arrays in code, "Could not find data arrays in generateTypedReport"
code = code.replace(old_data_arrays, new_data_arrays, 1)

# Filter guardStats when filterGuardId is set, and show full guard detail view when a single guard is selected
old_guard_stats_filter = """  }).filter((gs) => reportType === 'monthly' || reportType === 'weekly' || gs.runsTotal > 0 || gs.scansTotal > 0 || gs.incidentsCount > 0 || allGuards.length <= 25);"""

new_guard_stats_filter = """  }).filter((gs) => filterGuardId ? gs.guardId === String(filterGuardId) : (reportType === 'monthly' || reportType === 'weekly' || gs.runsTotal > 0 || gs.scansTotal > 0 || gs.incidentsCount > 0 || allGuards.length <= 25));"""

assert old_guard_stats_filter in code, "Could not find guardStats filter"
code = code.replace(old_guard_stats_filter, new_guard_stats_filter, 1)

# Enhance `individual` report HTML to show complete guard patrol runs, GPS scan coordinates, route map, and incidents when a guard is filtered (or overall)
old_indiv_html = """  if (reportType === 'individual') {
    sectionHtml = `
      <h3 style="margin:0 0 10px;font-size:14px;color:#0f172a;">Individual Guard Breakdown</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
        <thead><tr>
          <th style="${cellHead}">Guard Name</th>
          <th style="${cellHead}">Code</th>
          <th style="${cellHead}">Patrol Runs</th>
          <th style="${cellHead}">Verified Scans</th>
          <th style="${cellHead}">Avg GPS Drift</th>
          <th style="${cellHead}">Incidents</th>
        </tr></thead>
        <tbody>
          ${guardStats.length === 0 ? `<tr><td colspan="6" style="${cellRow}text-align:center;color:#64748b;">No guard patrol activity recorded in this period.</td></tr>` : guardStats.map((g) => `
            <tr>
              <td style="${cellRow}font-weight:700;">${esc(g.name)}</td>
              <td style="${cellRow}font-family:monospace;">${esc(g.code)}</td>
              <td style="${cellRow}">${g.runsCompleted} / ${g.runsTotal} completed</td>
              <td style="${cellRow}"><strong>${g.scansVerified}</strong> / ${g.scansTotal}</td>
              <td style="${cellRow}">${esc(g.avgDriftM)} m</td>
              <td style="${cellRow}">${g.incidentsCount}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;"""

new_indiv_html = """  if (reportType === 'individual') {
    const selectedGuardObj = filterGuardId ? guardById.get(String(filterGuardId)) : null;
    sectionHtml = `
      ${selectedGuardObj ? `<div style="margin-bottom:14px;padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e3a8a;">
        <strong>Complete Guard Dossier:</strong> ${esc(selectedGuardObj.full_name)} (${esc(selectedGuardObj.employee_code || '—')}) · Phone: ${esc(selectedGuardObj.phone || '—')}
      </div>` : ''}
      <h3 style="margin:0 0 10px;font-size:14px;color:#0f172a;">Individual Guard Performance Summary</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-bottom:18px;">
        <thead><tr>
          <th style="${cellHead}">Guard Name</th>
          <th style="${cellHead}">Code</th>
          <th style="${cellHead}">Patrol Runs</th>
          <th style="${cellHead}">Verified Scans</th>
          <th style="${cellHead}">Avg GPS Drift</th>
          <th style="${cellHead}">Incidents</th>
        </tr></thead>
        <tbody>
          ${guardStats.length === 0 ? `<tr><td colspan="6" style="${cellRow}text-align:center;color:#64748b;">No guard patrol activity recorded in this period.</td></tr>` : guardStats.map((g) => `
            <tr>
              <td style="${cellRow}font-weight:700;">${esc(g.name)}</td>
              <td style="${cellRow}font-family:monospace;">${esc(g.code)}</td>
              <td style="${cellRow}">${g.runsCompleted} / ${g.runsTotal} completed</td>
              <td style="${cellRow}"><strong>${g.scansVerified}</strong> / ${g.scansTotal}</td>
              <td style="${cellRow}">${esc(g.avgDriftM)} m</td>
              <td style="${cellRow}">${g.incidentsCount}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <h3 style="margin:16px 0 10px;font-size:14px;color:#0f172a;">Patrol Runs &amp; Route History (${sessions.length})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-bottom:18px;">
        <thead><tr>
          <th style="${cellHead}">Date</th>
          <th style="${cellHead}">Guard</th>
          <th style="${cellHead}">Route</th>
          <th style="${cellHead}">Start – End</th>
          <th style="${cellHead}">Status</th>
        </tr></thead>
        <tbody>
          ${sessions.length === 0 ? `<tr><td colspan="5" style="${cellRow}text-align:center;color:#64748b;">No patrol runs in this window.</td></tr>` : sessions.slice(0, 80).map((s) => `
            <tr>
              <td style="${cellRow}font-size:11px;">${s.start_time ? esc(localDate(env, new Date(s.start_time).getTime())) : '—'}</td>
              <td style="${cellRow}font-weight:600;">${esc(guardById.get(String(s.guard_id))?.full_name || 'Guard')}</td>
              <td style="${cellRow}">${esc(roundById.get(String(s.round_id))?.name || 'Patrol Route')}</td>
              <td style="${cellRow}font-size:11px;">${s.start_time ? esc(localHM(env, new Date(s.start_time).getTime())) : '—'} – ${s.end_time ? esc(localHM(env, new Date(s.end_time).getTime())) : 'Active'}</td>
              <td style="${cellRow}">${s.completed_route ? '<span style="color:#15803d;font-weight:700;">Completed</span>' : esc(s.status || 'IN_PROGRESS')}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <h3 style="margin:16px 0 10px;font-size:14px;color:#0f172a;">Checkpoint Scans &amp; GPS Coordinates (${scans.length})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-bottom:18px;">
        <thead><tr>
          <th style="${cellHead}">Date &amp; Time</th>
          <th style="${cellHead}">Guard</th>
          <th style="${cellHead}">Checkpoint</th>
          <th style="${cellHead}">Expected GPS</th>
          <th style="${cellHead}">Captured GPS</th>
          <th style="${cellHead}">Drift</th>
        </tr></thead>
        <tbody>
          ${scans.length === 0 ? `<tr><td colspan="6" style="${cellRow}text-align:center;color:#64748b;">No QR scans recorded in this window.</td></tr>` : scans.slice(0, 80).map((sc) => {
            const cp = cpById.get(String(sc.checkpoint_id));
            const gLat = sc.guard_lat ?? sc.guard_latitude ?? sc.latitude ?? sc.lat;
            const gLng = sc.guard_lng ?? sc.guard_longitude ?? sc.longitude ?? sc.lng;
            return `<tr>
              <td style="${cellRow}font-size:11px;">${sc.scan_time ? esc(localDate(env, new Date(sc.scan_time).getTime()) + ' ' + localHM(env, new Date(sc.scan_time).getTime())) : '—'}</td>
              <td style="${cellRow}font-weight:600;">${esc(guardById.get(String(sc.guard_id))?.full_name || 'Guard')}</td>
              <td style="${cellRow}">${esc(cp?.name || sc.checkpoint_id || 'Checkpoint')}</td>
              <td style="${cellRow}font-family:monospace;font-size:11px;">${cp?.lat ? `${Number(cp.lat).toFixed(5)}, ${Number(cp.lng).toFixed(5)}` : '—'}</td>
              <td style="${cellRow}font-family:monospace;font-size:11px;">${gLat != null ? `${Number(gLat).toFixed(5)}, ${Number(gLng).toFixed(5)}` : '—'}</td>
              <td style="${cellRow}">${sc.distance_meters != null ? Number(sc.distance_meters).toFixed(1) + 'm' : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      ${buildStaticRouteMapSvg(checkpoints, scans)}

      <h3 style="margin:18px 0 10px;font-size:14px;color:#0f172a;">Incidents Reported (${incidents.length})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #fed7aa;">
        <thead><tr style="background:#fff7ed;">
          <th style="${cellHead}color:#9a3412;">Case #</th>
          <th style="${cellHead}color:#9a3412;">Date &amp; Time</th>
          <th style="${cellHead}color:#9a3412;">Priority</th>
          <th style="${cellHead}color:#9a3412;">Title &amp; Details</th>
          <th style="${cellHead}color:#9a3412;">Status</th>
        </tr></thead>
        <tbody>
          ${incidents.length === 0 ? `<tr><td colspan="5" style="${cellRow}text-align:center;color:#16a34a;font-weight:600;">No incidents logged by selected guard(s).</td></tr>` : incidents.map((i) => `
            <tr>
              <td style="${cellRow}font-family:monospace;font-weight:700;color:#c2410c;">${i.case_number ? 'RKS-' + String(i.case_number).padStart(6, '0') : '—'}</td>
              <td style="${cellRow}font-size:11px;">${i.reported_at ? esc(localDate(env, new Date(i.reported_at).getTime()) + ' ' + localHM(env, new Date(i.reported_at).getTime())) : '—'}</td>
              <td style="${cellRow}"><strong>${esc(i.priority || 'P3')}</strong></td>
              <td style="${cellRow}"><strong>${esc(i.title || 'Incident')}</strong><div style="font-size:11px;color:#64748b;">${esc(i.description || '')}</div></td>
              <td style="${cellRow}">${esc(i.status || 'OPEN')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;"""

assert old_indiv_html in code, "Could not locate individual report HTML block"
code = code.replace(old_indiv_html, new_indiv_html, 1)

# C. Parse `date_from`, `date_to`, `guard_id`, and `shift_name` in `/api/v1/daily-reports/send-now`
old_typed_handler = """    // Handle typed report requests (individual, shift, daily, weekly, monthly, incident)
    if (body?.report_type) {
      const rType = body.report_type as ReportCategory;
      const plantName = tenant?.name || 'Enterprise Security Site';
      const built = await generateTypedReport(supabase, c.env, tenantId, plantName, rType);"""

new_typed_handler = """    // Handle typed report requests (individual, shift, daily, weekly, monthly, incident)
    if (body?.report_type) {
      const rType = body.report_type as ReportCategory;
      const plantName = tenant?.name || 'Enterprise Security Site';
      const offMs = siteOffsetMinutes(c.env) * MIN_MS;
      let customStartMs: number | undefined;
      let customEndMs: number | undefined;

      if (body?.date_from) {
        const dFrom = new Date(`${body.date_from}T00:00:00.000Z`).getTime() - offMs;
        if (!Number.isNaN(dFrom)) customStartMs = dFrom;
      }
      if (body?.date_to) {
        const dTo = new Date(`${body.date_to}T23:59:59.999Z`).getTime() - offMs;
        if (!Number.isNaN(dTo)) customEndMs = dTo;
      }

      // If a specific shift is chosen on a date, narrow start/end to that shift window
      if (body?.shift_name && body?.date_from) {
        const shifts = parseShifts(cfg['DAILY_REPORT_SHIFTS']);
        const matched = shifts.find((s) => s.name === body.shift_name);
        if (matched) {
          const [sh, sm] = matched.start.split(':').map(Number);
          const [eh, em] = matched.end.split(':').map(Number);
          const baseStart = new Date(`${body.date_from}T00:00:00.000Z`).getTime() - offMs;
          customStartMs = baseStart + (sh * 60 + sm) * MIN_MS;
          const endOffsetDays = matched.end <= matched.start ? 1 : 0;
          customEndMs = baseStart + endOffsetDays * 86400000 + (eh * 60 + em) * MIN_MS;
        }
      }

      const filterGuardId = body?.guard_id ? String(body.guard_id) : undefined;
      const shiftLabel = body?.shift_name ? String(body.shift_name) : undefined;
      const built = await generateTypedReport(supabase, c.env, tenantId, plantName, rType, customStartMs, customEndMs, shiftLabel, filterGuardId);"""

assert old_typed_handler in code, "Could not locate typed handler in send-now"
code = code.replace(old_typed_handler, new_typed_handler, 1)

with open("backend/src/index.ts", "w", encoding="utf-8") as f:
    f.write(code)
print("✅ Backend updated with route-completion auto-email (guard-isolated) & date/guard/shift filtering.")
PYEOF

# ==============================================================================
# 2. FRONTEND: Add Date Range, Guard Selector, & Shift Selector to DailyReportsPage.tsx
# ==============================================================================
cat << 'TSEOF' > frontend/src/pages/DailyReportsPage.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  Mail, Plus, Trash2, Eye, Send, Save, X, Clock, CheckCircle2,
  AlertTriangle, Loader2, Download, MapPin, Users, Calendar, ShieldAlert, FileSpreadsheet, Filter
} from 'lucide-react';

const API = `${(import.meta as any).env?.VITE_API_URL || 'https://rakshak-api.spandangrasim.workers.dev'}/api/v1`;

type ReportCategory = 'individual' | 'shift' | 'daily' | 'weekly' | 'monthly' | 'incident';

interface Shift { name: string; start: string; end: string }
interface GuardOption { guard_id: string; full_name: string; employee_code?: string }
interface ScheduleRule { enabled: boolean; emails: string }
interface LogRow { guard_id?: string; guard_name?: string; shift_name: string; report_date: string; status: string; recipients: string | null; error: string | null; sent_at: string | null; created_at: string }

const REPORT_TYPES: {
  key: ReportCategory;
  title: string;
  subtitle: string;
  frequency: string;
  badge?: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    key: 'shift',
    title: 'Shift-Wise & Route Completion Report',
    subtitle: 'Sent automatically when a route completes (with guard-isolated incidents + map) & after each shift.',
    frequency: 'On Route Completion + Shift End',
    badge: 'Auto on Route Done + Map',
    icon: MapPin,
  },
  {
    key: 'individual',
    title: 'Individual Guard Dossier Report',
    subtitle: 'All patrol runs, verified QR GPS coordinates, route map, and incidents for the selected guard.',
    frequency: 'Daily at configured time or On-Demand',
    icon: Users,
  },
  {
    key: 'daily',
    title: 'Daily Consolidated Digest',
    subtitle: 'Complete 24-hour site overview with KPIs, route completion, GPS logs, and Excel workbook.',
    frequency: 'Once daily (Default 8:00 PM)',
    icon: Calendar,
  },
  {
    key: 'weekly',
    title: 'Weekly Management Summary',
    subtitle: '7-day or custom date-range compliance and patrol performance summary.',
    frequency: 'Every Sunday at configured time',
    icon: FileSpreadsheet,
  },
  {
    key: 'monthly',
    title: 'Monthly Audit & Operations Report',
    subtitle: 'Full 30-day or custom month patrol attendance, GPS verification rate, and audit trail.',
    frequency: '1st of every month at configured time',
    icon: FileSpreadsheet,
  },
  {
    key: 'incident',
    title: 'Incident & Exception Report',
    subtitle: 'All logged P1–P4 security, fire, safety, and equipment incidents in the selected date window.',
    frequency: 'Daily at configured time',
    icon: ShieldAlert,
  },
];

const DEFAULT_SCHEDULES: Record<ReportCategory, ScheduleRule> = {
  individual: { enabled: true, emails: '' },
  shift: { enabled: true, emails: '' },
  daily: { enabled: true, emails: '' },
  weekly: { enabled: false, emails: '' },
  monthly: { enabled: false, emails: '' },
  incident: { enabled: true, emails: '' },
};

const PRESET: Shift[] = [
  { name: 'Morning', start: '06:00', end: '14:00' },
  { name: 'Evening', start: '14:00', end: '22:00' },
  { name: 'Night', start: '22:00', end: '06:00' },
];

const STATUS: Record<string, string> = {
  SENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  SKIPPED: 'bg-slate-50 text-slate-600 border-slate-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const post = (path: string, body: any) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}),
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const DailyReportsPage: React.FC = () => {
  const modules = (() => { try { return JSON.parse(localStorage.getItem('visible_modules') || '{}'); } catch { return {}; } })();
  const gmailOn = modules.integration_gmail === true;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string>('');
  const [enabled, setEnabled] = useState(true);
  const [sendTime, setSendTime] = useState('20:00');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [delay, setDelay] = useState('15');
  const [emails, setEmails] = useState('');
  const [toSupervisor, setToSupervisor] = useState(true);
  const [schedules, setSchedules] = useState<Record<ReportCategory, ScheduleRule>>(DEFAULT_SCHEDULES);
  const [log, setLog] = useState<LogRow[]>([]);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  // Interactive Filters for Preview / Download / Send Now
  const [dateFrom, setDateFrom] = useState<string>(todayISO());
  const [dateTo, setDateTo] = useState<string>(todayISO());
  const [selectedGuardId, setSelectedGuardId] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [guardsList, setGuardsList] = useState<GuardOption[]>([]);

  const token = localStorage.getItem('token');
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const loadLog = useCallback(() => {
    fetch(`${API}/daily-reports/log`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => setLog(d.log || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/admin/configs`, { headers: authHeaders }).then((r) => r.json()),
      fetch(`${API}/guards`, { headers: authHeaders }).then((r) => r.json()).catch(() => ({ guards: [] })),
    ])
      .then(([d, gRes]) => {
        const cfg: Record<string, string> = {};
        for (const row of d.configs || []) cfg[row.key_name] = row.key_value;
        setEnabled(cfg.DAILY_REPORT_ENABLED !== 'false');
        setSendTime(cfg.DAILY_REPORT_SEND_TIME || '20:00');
        try { setShifts(JSON.parse(cfg.DAILY_REPORT_SHIFTS || '[]')); } catch { setShifts([]); }
        setDelay(cfg.DAILY_REPORT_DELAY_MIN || '15');
        setEmails(cfg.DAILY_REPORT_EMAILS || '');
        setToSupervisor(cfg.DAILY_REPORT_TO_SUPERVISOR !== 'false');
        if (cfg.REPORT_SCHEDULES_JSON) {
          try {
            const parsed = JSON.parse(cfg.REPORT_SCHEDULES_JSON);
            setSchedules({ ...DEFAULT_SCHEDULES, ...parsed });
          } catch {}
        }
        setGuardsList(gRes.guards || gRes.data || []);
      })
      .catch(() => alert('Could not load report settings.'))
      .finally(() => setLoading(false));
    loadLog();
  }, [loadLog]);

  const updateSchedule = (key: ReportCategory, patch: Partial<ScheduleRule>) => {
    setSchedules((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setDirty(true);
  };

  const updateShift = (i: number, patch: Partial<Shift>) => {
    setShifts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setDirty(true);
  };

  const applyQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 86400000);
    setDateFrom(start.toISOString().slice(0, 10));
    setDateTo(end.toISOString().slice(0, 10));
  };

  const save = async () => {
    const clean = shifts.filter((s) => s.name.trim() && s.start && s.end).map((s) => ({ name: s.name.trim(), start: s.start, end: s.end }));
    setSaving(true);
    try {
      const d = await post('/admin/configs', [
        { key_name: 'DAILY_REPORT_ENABLED', key_value: enabled ? 'true' : 'false' },
        { key_name: 'DAILY_REPORT_SEND_TIME', key_value: sendTime || '20:00' },
        { key_name: 'DAILY_REPORT_SHIFTS', key_value: JSON.stringify(clean) },
        { key_name: 'DAILY_REPORT_DELAY_MIN', key_value: String(Math.max(0, Math.min(180, Number(delay) || 15))) },
        { key_name: 'DAILY_REPORT_EMAILS', key_value: emails.trim() },
        { key_name: 'DAILY_REPORT_TO_SUPERVISOR', key_value: toSupervisor ? 'true' : 'false' },
        { key_name: 'REPORT_SCHEDULES_JSON', key_value: JSON.stringify(schedules) },
      ]);
      if (!d.success) throw new Error(d.message);
      setShifts(clean);
      setDirty(false);
      alert('Automated reporting configuration saved.');
    } catch (e: any) {
      alert(e.message || 'Could not save report settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleReportAction = async (reportType: ReportCategory, mode: 'preview' | 'download' | 'send') => {
    const key = `${reportType}:${mode}`;
    setActionBusy(key);
    try {
      const recipients = schedules[reportType]?.emails?.trim() || emails.trim();
      if (mode === 'send' && !recipients) {
        alert('Enter at least one recipient email address for this report first.');
        return;
      }
      const d = await post('/daily-reports/send-now', {
        report_type: reportType,
        preview: mode === 'preview',
        download: mode === 'download',
        recipients,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        guard_id: selectedGuardId || undefined,
        shift_name: selectedShift || undefined,
      });
      if (!d.success) throw new Error(d.message);

      if (mode === 'preview') {
        setPreview({ subject: d.subject, html: d.html });
      } else if (mode === 'download') {
        const byteChars = atob(d.excelBase64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = d.filename || `${reportType}_report.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        alert(d.message || 'Report emailed successfully.');
        loadLog();
      }
    } catch (e: any) {
      alert(e.message || 'Report action failed.');
    } finally {
      setActionBusy('');
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl space-y-4 p-6">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-32" />)}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Automated Reporting &amp; Dispatch Center</h2>
          <p className="text-sm text-slate-500">Auto-emails on route completion with guard-isolated incidents, custom date/guard/shift filters, and Excel export.</p>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
          Spandan IT Professionals Engine
        </span>
      </div>

      {!gmailOn && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>Automated emails require <strong>Gmail Alerts</strong> to be connected under Integrations. Excel downloads work anytime.</span>
        </div>
      )}

      {/* Master Toggle & Custom Daily Dispatch Time */}
      <section className="card grid gap-5 p-5 md:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <span>
            <span className="block text-base font-extrabold text-slate-900">Enable Automated Reports</span>
            <span className="block text-xs text-slate-500">Sends instant route completion reports &amp; scheduled digests.</span>
          </span>
          <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? 'bg-brand-600' : 'bg-slate-300'}`}>
            <input type="checkbox" className="sr-only" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setDirty(true); }} />
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </span>
        </label>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div>
            <span className="block text-base font-extrabold text-slate-900">Daily Report Send Time</span>
            <span className="block text-xs text-slate-500">Set exact local time for daily dispatch (default 20:00 / 8:00 PM).</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand-600" />
            <input
              type="time"
              value={sendTime}
              onChange={(e) => { setSendTime(e.target.value); setDirty(true); }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </section>

      {/* Interactive Report Filter Bar (Date Range, Guard, Shift) */}
      <section className="card border-brand-200 bg-brand-50/30 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-extrabold text-slate-900">Report Data Filters (Applies to Preview, Download &amp; Send Now)</h3>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => applyQuickRange(1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:border-brand-400">Today</button>
            <button onClick={() => applyQuickRange(7)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:border-brand-400">Last 7 Days</button>
            <button onClick={() => applyQuickRange(30)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:border-brand-400">Last 30 Days</button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">Individual Guard Filter</label>
            <select
              value={selectedGuardId}
              onChange={(e) => setSelectedGuardId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500"
            >
              <option value="">All Guards</option>
              {guardsList.map((g) => (
                <option key={g.guard_id} value={g.guard_id}>
                  {g.full_name} {g.employee_code ? `(${g.employee_code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">Shift Filter</label>
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-brand-500"
            >
              <option value="">All Shifts</option>
              {(shifts.length > 0 ? shifts : PRESET).map((s, idx) => (
                <option key={idx} value={s.name}>{s.name} ({s.start}–{s.end})</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 6 Report Types Configuration Matrix */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">Report Channels &amp; Recipient Mail Configuration</h3>
          <span className="text-xs text-slate-500">Configure separate email IDs per report type or download directly</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {REPORT_TYPES.map((rt) => {
            const Icon = rt.icon;
            const rule = schedules[rt.key] || { enabled: false, emails: '' };
            return (
              <div key={rt.key} className={`card flex flex-col justify-between p-5 transition ${rule.enabled ? 'border-slate-200' : 'opacity-75 bg-slate-50/50'}`}>
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-extrabold text-slate-900">{rt.title}</h4>
                          {rt.badge && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                              {rt.badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{rt.subtitle}</p>
                        <p className="mt-1 text-[11px] font-semibold text-brand-600">Schedule: {rt.frequency}</p>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => updateSchedule(rt.key, { enabled: e.target.checked })}
                      className="mt-1 h-4 w-4 accent-brand-600"
                      title="Enable automated email for this report"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Configured Mail IDs (comma separated)
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-brand-500">
                      <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                      <input
                        value={rule.emails}
                        onChange={(e) => updateSchedule(rt.key, { emails: e.target.value })}
                        placeholder="manager@company.com, ops@company.com"
                        className="w-full bg-transparent py-2 text-xs font-medium text-slate-800 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <button
                    onClick={() => handleReportAction(rt.key, 'preview')}
                    disabled={actionBusy !== ''}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-brand-300 disabled:opacity-50"
                  >
                    {actionBusy === `${rt.key}:preview` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    Preview
                  </button>

                  <button
                    onClick={() => handleReportAction(rt.key, 'download')}
                    disabled={actionBusy !== ''}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
                  >
                    {actionBusy === `${rt.key}:download` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Download (.xlsx)
                  </button>

                  <button
                    onClick={() => handleReportAction(rt.key, 'send')}
                    disabled={actionBusy !== '' || !gmailOn}
                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {actionBusy === `${rt.key}:send` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send Now
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Shift Timings Configuration */}
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Shift Schedule Windows</h3>
            <p className="text-xs text-slate-500">Define shift start/end timings for shift-wise patrol &amp; map reports.</p>
          </div>
          <div className="flex gap-2">
            {shifts.length === 0 && (
              <button onClick={() => { setShifts(PRESET); setDirty(true); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-brand-300">
                Load 3 Standard Shifts
              </button>
            )}
            <button onClick={() => { setShifts((p) => [...p, { name: '', start: '09:00', end: '17:00' }]); setDirty(true); }} className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
              <Plus className="h-3.5 w-3.5" /> Add Shift
            </button>
          </div>
        </div>

        {shifts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">No shifts configured yet.</div>
        ) : (
          <div className="space-y-2">
            {shifts.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <input value={s.name} onChange={(e) => updateShift(i, { name: e.target.value })} placeholder="Shift name" className="min-w-[8rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500" />
                <input type="time" value={s.start} onChange={(e) => updateShift(i, { start: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
                <span className="text-xs text-slate-400">to</span>
                <input type="time" value={s.end} onChange={(e) => updateShift(i, { end: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" />
                <button onClick={() => { setShifts((p) => p.filter((_, idx) => idx !== i)); setDirty(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={toSupervisor} onChange={(e) => { setToSupervisor(e.target.checked); setDirty(true); }} className="h-4 w-4 accent-brand-600" />
            Also copy each guard&apos;s assigned supervisor on shift &amp; route-completion reports
          </label>
          <div className="flex items-center gap-2">
            <span>Fallback email(s):</span>
            <input value={emails} onChange={(e) => { setEmails(e.target.value); setDirty(true); }} placeholder="admin@company.com" className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs outline-none focus:border-brand-500" />
          </div>
        </div>
      </section>

      {/* Sticky Save Bar */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lift backdrop-blur">
        <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-40">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Automation Settings
        </button>
        <span className="text-xs text-slate-500">Daily dispatch time set to <strong>{sendTime}</strong></span>
        {dirty && <span className="ml-auto text-xs font-bold text-amber-600">Unsaved changes</span>}
      </div>

      {/* Dispatch Log */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">Automated &amp; Manual Dispatch Log</h3>
          <button onClick={loadLog} className="text-xs font-bold text-brand-600 hover:underline">Refresh</button>
        </div>
        {log.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No reports dispatched yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {log.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 py-2.5">
                <CheckCircle2 className={`h-4 w-4 ${r.status === 'SENT' ? 'text-emerald-500' : 'text-slate-300'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-900">
                    {r.guard_name && r.guard_name !== 'Unknown' ? r.guard_name : r.shift_name} <span className="font-medium text-slate-400">· {r.shift_name} · {r.report_date}</span>
                  </div>
                  <div className="truncate text-xs text-slate-400">{r.error ? r.error : r.recipients || '—'}</div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS[r.status] || STATUS.PENDING}`}>{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setPreview(null)} />
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Report Email &amp; Map Preview</div>
                <div className="truncate text-sm font-bold text-slate-900">{preview.subject}</div>
              </div>
              <button onClick={() => setPreview(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe title="Report preview" srcDoc={preview.html} sandbox="" className="h-[75vh] w-full bg-slate-50" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyReportsPage;
TSEOF

echo "✅ Frontend DailyReportsPage.tsx updated with Date Range, Guard, & Shift filters."
