#!/bin/bash
set -e

echo "🚀 Upgrading Backend & Frontend Reporting Automation..."

# ==============================================================================
# 1. BACKEND: Add multi-report generator, map snapshot renderer, & custom time cron
# ==============================================================================
python3 - << 'PYEOF'
with open("backend/src/index.ts", "r", encoding="utf-8") as f:
    code = f.read()

# Helper block to inject right before `async function runDailyReports`
multi_report_engine = '''
// =====================================================================
// MULTI-REPORT AUTOMATION ENGINE (INDIVIDUAL, SHIFT+MAP, DAILY, WEEKLY, MONTHLY, INCIDENT)
// =====================================================================
type ReportCategory = 'individual' | 'shift' | 'daily' | 'weekly' | 'monthly' | 'incident';

function buildStaticRouteMapSvg(checkpoints: any[], scans: any[]): string {
  const pts: { lat: number; lng: number; type: 'qr' | 'scan'; label: string; drift?: number }[] = [];
  checkpoints.forEach((cp, idx) => {
    const lat = Number(cp.latitude ?? cp.lat);
    const lng = Number(cp.longitude ?? cp.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
      pts.push({ lat, lng, type: 'qr', label: `QR #${idx + 1}` });
    }
  });
  scans.forEach((sc, idx) => {
    const lat = Number(sc.guard_latitude ?? sc.latitude ?? sc.lat);
    const lng = Number(sc.guard_longitude ?? sc.longitude ?? sc.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
      pts.push({
        lat,
        lng,
        type: 'scan',
        label: `Cap #${idx + 1}`,
        drift: sc.distance_meters != null ? Number(sc.distance_meters) : undefined,
      });
    }
  });

  if (pts.length === 0) {
    return `<div style="padding:14px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b;font-size:12px;text-align:center;">No GPS coordinates recorded for route map snapshot in this window.</div>`;
  }

  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const padLat = Math.max(0.0006, (maxLat - minLat) * 0.22);
  const padLng = Math.max(0.0006, (maxLng - minLng) * 0.22);
  const loLat = minLat - padLat, hiLat = maxLat + padLat;
  const loLng = minLng - padLng, hiLng = maxLng + padLng;

  const W = 680, H = 260;
  const toX = (lng: number) => Math.round(((lng - loLng) / (hiLng - loLng)) * (W - 80) + 40);
  const toY = (lat: number) => Math.round(H - (((lat - loLat) / (hiLat - loLat)) * (H - 60) + 30));

  const qrPts = pts.filter((p) => p.type === 'qr');
  const scanPts = pts.filter((p) => p.type === 'scan');
  const qrPolyline = qrPts.map((p) => `${toX(p.lng)},${toY(p.lat)}`).join(' ');
  const scanPolyline = scanPts.map((p) => `${toX(p.lng)},${toY(p.lat)}`).join(' ');

  const svgInner = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;background:#f1f5f9;border-radius:8px;border:1px solid #cbd5e1;display:block;">
      <defs>
        <pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse">
          <path d="M 34 0 L 0 0 0 34" fill="none" stroke="#e2e8f0" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#grid)" />
      ${qrPts.length > 1 ? `<polyline fill="none" stroke="#10b981" stroke-width="2.5" stroke-dasharray="6,4" points="${qrPolyline}" />` : ''}
      ${scanPts.length > 1 ? `<polyline fill="none" stroke="#2563eb" stroke-width="2.5" points="${scanPolyline}" />` : ''}
      ${qrPts.map((p) => {
        const x = toX(p.lng), y = toY(p.lat);
        return `<g transform="translate(${x},${y})">
          <circle r="11" fill="#059669" stroke="#ffffff" stroke-width="2"/>
          <text y="3.5" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="8" font-weight="bold">${esc(p.label)}</text>
        </g>`;
      }).join('')}
      ${scanPts.map((p) => {
        const x = toX(p.lng), y = toY(p.lat);
        const far = (p.drift ?? 0) > 50;
        const fill = far ? '#dc2626' : '#2563eb';
        return `<g transform="translate(${x},${y})">
          <rect x="-18" y="-22" width="36" height="14" rx="4" fill="${fill}" stroke="#ffffff" stroke-width="1.5"/>
          <text y="-12" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="8" font-weight="bold">${esc(p.label)}</text>
        </g>`;
      }).join('')}
    </svg>
  `;

  return `
    <div style="margin-top:12px;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;background:#ffffff;">
      <div style="background:#0f172a;color:#ffffff;padding:8px 14px;font-size:12px;font-weight:bold;">
        🗺️ Patrol Route Map (Expected QR Locations vs Guard Capture Locations)
      </div>
      <div style="padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11px;color:#334155;">
        <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:#059669;color:#fff;font-weight:bold;margin-right:8px;">QR #</span> Expected Checkpoint
        <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:#2563eb;color:#fff;font-weight:bold;margin:0 8px;">Cap #</span> Guard Capture (&le;50m)
        <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:#dc2626;color:#fff;font-weight:bold;margin-left:8px;">Cap #</span> Drift (&gt;50m)
      </div>
      <div style="padding:10px;">${svgInner}</div>
    </div>
  `;
}

async function generateTypedReport(
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
  }

  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(nowMs).toISOString();
  const dateLabel = `${localDate(env, startMs)}${localDate(env, startMs) !== localDate(env, nowMs) ? ' to ' + localDate(env, nowMs) : ''}`;

  const [guardsRes, roundsRes, cpsRes, sessionsRes, scansRes, incRes] = await Promise.all([
    supabase.from('guards').select('guard_id, full_name, employee_code, phone, reporting_to, email').eq('tenant_id', tenantId),
    supabase.from('rounds').select('id, name, checkpoints, assigned_guards').eq('tenant_id', tenantId),
    supabase.from('checkpoints').select('checkpoint_id, round_id, name, latitude, longitude').eq('tenant_id', tenantId),
    supabase.from('patrol_sessions').select('id, guard_id, round_id, status, completed_route, start_time, end_time, paused_seconds')
      .eq('tenant_id', tenantId).gte('start_time', startISO).lte('start_time', endISO).order('start_time', { ascending: false }).limit(2000),
    supabase.from('scans').select('checkpoint_id, guard_id, round_id, scan_time, is_verified, distance_meters, guard_latitude, guard_longitude')
      .eq('tenant_id', tenantId).gte('scan_time', startISO).lte('scan_time', endISO).order('scan_time', { ascending: false }).limit(3000),
    supabase.from('incidents').select('case_number, title, description, priority, category, status, reported_at, guard_id, photo_url')
      .eq('tenant_id', tenantId).gte('reported_at', startISO).lte('reported_at', endISO).order('reported_at', { ascending: false }).limit(1000),
  ]);

  const allGuards: any[] = guardsRes.data || [];
  const rounds: any[] = roundsRes.data || [];
  const checkpoints: any[] = cpsRes.data || [];
  const sessions: any[] = sessionsRes.data || [];
  const scans: any[] = scansRes.data || [];
  const incidents: any[] = incRes.data || [];

  const guardById = new Map<string, any>(allGuards.map((g) => [String(g.guard_id), g]));
  const roundById = new Map<string, any>(rounds.map((r) => [String(r.id), r]));
  const cpById = new Map<string, any>(checkpoints.map((c) => [String(c.checkpoint_id), c]));

  const TITLES: Record<ReportCategory, string> = {
    individual: 'Individual Guard Patrol Performance Report',
    shift: `Shift-Wise Patrol & Route Map Report${shiftLabel ? ' (' + shiftLabel + ')' : ''}`,
    daily: 'Daily Consolidated Security & Patrol Digest',
    weekly: 'Weekly Executive Security & Compliance Summary',
    monthly: 'Monthly Security Operations & Audit Report',
    incident: 'Security & Safety Incident Exception Report',
  };

  const cellHead = 'padding:9px 11px;background:#f8fafc;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;border-bottom:1px solid #e2e8f0;text-align:left;';
  const cellRow = 'padding:9px 11px;font-size:12px;color:#1e293b;border-bottom:1px solid #f1f5f9;vertical-align:middle;';

  // Guard-level metrics
  const guardStats = allGuards.map((g) => {
    const gId = String(g.guard_id);
    const gSessions = sessions.filter((s) => String(s.guard_id) === gId);
    const gScans = scans.filter((s) => String(s.guard_id) === gId);
    const gInc = incidents.filter((i) => String(i.guard_id) === gId);
    const completed = gSessions.filter((s) => s.completed_route).length;
    const verified = gScans.filter((s) => s.is_verified).length;
    const avgDrift = gScans.length > 0
      ? (gScans.reduce((acc, x) => acc + (Number(x.distance_meters) || 0), 0) / gScans.length).toFixed(1)
      : '0.0';
    return {
      guardId: gId,
      name: g.full_name,
      code: g.employee_code || '—',
      phone: g.phone || '—',
      runsTotal: gSessions.length,
      runsCompleted: completed,
      scansTotal: gScans.length,
      scansVerified: verified,
      avgDriftM: avgDrift,
      incidentsCount: gInc.length,
    };
  }).filter((gs) => reportType === 'monthly' || reportType === 'weekly' || gs.runsTotal > 0 || gs.scansTotal > 0 || gs.incidentsCount > 0 || allGuards.length <= 25);

  const mapHtml = (reportType === 'shift' || reportType === 'daily')
    ? buildStaticRouteMapSvg(checkpoints, scans)
    : '';

  let sectionHtml = '';
  if (reportType === 'individual') {
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
      </table>`;
  } else if (reportType === 'incident') {
    sectionHtml = `
      <h3 style="margin:0 0 10px;font-size:14px;color:#0f172a;">Logged Incidents (${incidents.length})</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #fed7aa;">
        <thead><tr>
          <th style="${cellHead}">Case #</th>
          <th style="${cellHead}">Time</th>
          <th style="${cellHead}">Priority</th>
          <th style="${cellHead}">Title &amp; Details</th>
          <th style="${cellHead}">Reported By</th>
          <th style="${cellHead}">Status</th>
        </tr></thead>
        <tbody>
          ${incidents.length === 0 ? `<tr><td colspan="6" style="${cellRow}text-align:center;color:#16a34a;font-weight:600;">No incidents reported during this period.</td></tr>` : incidents.map((i) => `
            <tr>
              <td style="${cellRow}font-family:monospace;font-weight:700;color:#c2410c;">${i.case_number ? 'RKS-' + String(i.case_number).padStart(6, '0') : '—'}</td>
              <td style="${cellRow}font-size:11px;">${i.reported_at ? esc(new Date(i.reported_at).toLocaleString()) : '—'}</td>
              <td style="${cellRow}"><strong>${esc(i.priority || 'P3')}</strong></td>
              <td style="${cellRow}"><strong>${esc(i.title || 'Incident')}</strong><div style="font-size:11px;color:#64748b;">${esc(i.description || '')}</div></td>
              <td style="${cellRow}">${esc(guardById.get(String(i.guard_id))?.full_name || 'Field Guard')}</td>
              <td style="${cellRow}">${esc(i.status || 'OPEN')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } else {
    // shift, daily, weekly, monthly
    sectionHtml = `
      <h3 style="margin:0 0 10px;font-size:14px;color:#0f172a;">Shift &amp; Patrol Execution Summary</h3>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-bottom:18px;">
        <thead><tr>
          <th style="${cellHead}">Guard</th>
          <th style="${cellHead}">Route</th>
          <th style="${cellHead}">Start – End</th>
          <th style="${cellHead}">Status</th>
        </tr></thead>
        <tbody>
          ${sessions.length === 0 ? `<tr><td colspan="4" style="${cellRow}text-align:center;color:#64748b;">No patrol sessions logged in this window.</td></tr>` : sessions.slice(0, 60).map((s) => `
            <tr>
              <td style="${cellRow}font-weight:600;">${esc(guardById.get(String(s.guard_id))?.full_name || 'Guard')}</td>
              <td style="${cellRow}">${esc(roundById.get(String(s.round_id))?.name || 'Route')}</td>
              <td style="${cellRow}font-size:11px;">${s.start_time ? esc(localHM(env, new Date(s.start_time).getTime())) : '—'} – ${s.end_time ? esc(localHM(env, new Date(s.end_time).getTime())) : 'Active'}</td>
              <td style="${cellRow}">${s.completed_route ? '<span style="color:#15803d;font-weight:700;">Completed</span>' : esc(s.status || 'IN_PROGRESS')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${mapHtml}
    `;
  }

  const subject = `[${tenantName}] ${TITLES[reportType]} · ${dateLabel}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:780px;margin:0 auto;padding:20px;background:#f1f5f9;color:#0f172a;">
      <div style="background:#0f172a;color:#ffffff;padding:22px 24px;border-radius:12px 12px 0 0;">
        <div style="font-size:11px;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;">Spandan IT Professionals · Enterprise Security Suite</div>
        <h2 style="margin:6px 0 0;font-size:20px;font-weight:800;">${esc(TITLES[reportType])}</h2>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Site: <strong>${esc(tenantName)}</strong> | Period: <strong>${esc(dateLabel)}</strong></p>
      </div>
      <div style="background:#ffffff;padding:22px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;width:25%;">
              <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;">Guards Active</div>
              <div style="font-size:22px;font-weight:800;color:#0f172a;">${guardStats.length}</div>
            </td>
            <td style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;width:25%;">
              <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;">Patrol Runs</div>
              <div style="font-size:22px;font-weight:800;color:#16a34a;">${sessions.filter((s) => s.completed_route).length} / ${sessions.length}</div>
            </td>
            <td style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;width:25%;">
              <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;">QR Scans</div>
              <div style="font-size:22px;font-weight:800;color:#2563eb;">${scans.length}</div>
            </td>
            <td style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;width:25%;">
              <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;">Incidents</div>
              <div style="font-size:22px;font-weight:800;color:${incidents.length > 0 ? '#dc2626' : '#16a34a'};">${incidents.length}</div>
            </td>
          </tr>
        </table>
        ${sectionHtml}
        <div style="margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;display:flex;justify-content:space-between;">
          <span>Automated Report Engine · Powered by <strong>Spandan IT Professionals</strong></span>
          <a href="https://spandanit.com" style="color:#2563eb;text-decoration:none;font-weight:700;">www.spandanit.com</a>
        </div>
      </div>
    </div>
  `;

  // Build multi-sheet Excel workbook for attachment & frontend download
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(guardStats.length > 0 ? guardStats.map((g) => ({
      'Guard Name': g.name,
      'Employee Code': g.code,
      'Phone': g.phone,
      'Completed Runs': g.runsCompleted,
      'Total Runs': g.runsTotal,
      'Verified Scans': g.scansVerified,
      'Total Scans': g.scansTotal,
      'Avg GPS Drift (m)': g.avgDriftM,
      'Incidents': g.incidentsCount,
    })) : [{ Notice: 'No guard records in period' }]),
    'Individual Guard Summary'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(scans.length > 0 ? scans.map((s, idx) => ({
      '#': idx + 1,
      'Scan Time': s.scan_time ? new Date(s.scan_time).toLocaleString() : '—',
      'Guard': guardById.get(String(s.guard_id))?.full_name || s.guard_id,
      'Route': roundById.get(String(s.round_id))?.name || s.round_id,
      'Checkpoint': cpById.get(String(s.checkpoint_id))?.name || s.checkpoint_id,
      'Expected Lat/Lng': cpById.get(String(s.checkpoint_id)) ? `${cpById.get(String(s.checkpoint_id)).latitude}, ${cpById.get(String(s.checkpoint_id)).longitude}` : '—',
      'Guard Capture Lat/Lng': s.guard_latitude ? `${s.guard_latitude}, ${s.guard_longitude}` : '—',
      'Drift (m)': s.distance_meters != null ? Number(s.distance_meters).toFixed(1) : '—',
      'Verified': s.is_verified ? 'Yes' : 'No',
    })) : [{ Notice: 'No scans in period' }]),
    'Patrol Scans & GPS Map'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(incidents.length > 0 ? incidents.map((i) => ({
      'Case #': i.case_number ? 'RKS-' + String(i.case_number).padStart(6, '0') : '—',
      'Reported At': i.reported_at ? new Date(i.reported_at).toLocaleString() : '—',
      'Priority': i.priority || 'P3',
      'Category': i.category || 'Security',
      'Title': i.title || '—',
      'Description': i.description || '—',
      'Status': i.status || 'OPEN',
    })) : [{ Notice: 'No incidents in period' }]),
    'Incidents'
  );

  const excelBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const filename = `${tenantName.replace(/[^a-zA-Z0-9]/g, '_')}_${reportType.toUpperCase()}_Report_${localDate(env, nowMs)}.xlsx`;

  return { subject, html, excelBase64, filename, counts: { guards: guardStats.length, scans: scans.length, incidents: incidents.length } };
}
'''

assert "async function runDailyReports(env: Bindings)" in code, "Could not locate runDailyReports"
code = code.replace("async function runDailyReports(env: Bindings)", multi_report_engine + "\nasync function runDailyReports(env: Bindings)", 1)

# Enhance runDailyReports to also check custom daily send time (e.g., 20:00 IST) for daily/weekly/monthly/individual/incident reports
old_cron_loop_end = """        const report = await buildShiftReport(supabase, env, t.name, g, w.startMs, w.endMs, w.name);
        const sent = await sendTenantEmail(env, t.id, recipients, report.subject, report.html);
        await supabase.from('daily_report_log')
          .update({ status: sent.ok ? 'SENT' : 'FAILED', error: sent.error || null, recipients: recipients.join(', '), sent_at: sent.ok ? new Date().toISOString() : null })
          .match(key);
      }
    }
  }
}"""

new_cron_loop_end = """        const report = await buildShiftReport(supabase, env, t.name, g, w.startMs, w.endMs, w.name);
        const sent = await sendTenantEmail(env, t.id, recipients, report.subject, report.html);
        await supabase.from('daily_report_log')
          .update({ status: sent.ok ? 'SENT' : 'FAILED', error: sent.error || null, recipients: recipients.join(', '), sent_at: sent.ok ? new Date().toISOString() : null })
          .match(key);
      }
    }

    // Custom Daily Send Time Scheduler (defaults to 20:00 site local time)
    const sendTime = (cfg['DAILY_REPORT_SEND_TIME'] || '20:00').trim();
    const [targetH, targetM] = sendTime.split(':').map((n) => parseInt(n, 10) || 0);
    const localNow = new Date(nowMs + siteOffsetMinutes(env) * MIN_MS);
    const curMinutes = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
    const targetMinutes = targetH * 60 + targetM;
    const todayStr = localDate(env, nowMs);
    const isSunday = localNow.getUTCDay() === 0;
    const isFirstOfMonth = localNow.getUTCDate() === 1;

    if (curMinutes >= targetMinutes && curMinutes < targetMinutes + 30) {
      let schedules: Record<string, { enabled: boolean; emails: string }> = {};
      try { schedules = JSON.parse(cfg['REPORT_SCHEDULES_JSON'] || '{}'); } catch {}

      const typesToCheck: ReportCategory[] = ['individual', 'shift', 'daily', 'incident'];
      if (isSunday) typesToCheck.push('weekly');
      if (isFirstOfMonth) typesToCheck.push('monthly');

      for (const rType of typesToCheck) {
        if (budget <= 0) break;
        const rule = schedules[rType];
        if (!rule || !rule.enabled || !rule.emails?.trim()) continue;
        const recips = rule.emails.split(/[,;\s]+/).map((e) => safeEmail(e)).filter(Boolean) as string[];
        if (recips.length === 0) continue;

        const logKey = { tenant_id: t.id, guard_id: `AUTO_${rType.toUpperCase()}`, shift_name: `Scheduled ${rType.toUpperCase()} (${sendTime})`, report_date: todayStr };
        const claim = await supabase.from('daily_report_log').insert([{ ...logKey, status: 'PENDING' }]);
        if (claim.error) continue;
        budget--;

        const built = await generateTypedReport(supabase, env, t.id, t.name, rType);
        const res = await sendTenantEmail(env, t.id, recips, built.subject, built.html, {
          filename: built.filename,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          contentBase64: built.excelBase64,
        });
        await supabase.from('daily_report_log').update({
          status: res.ok ? 'SENT' : 'FAILED',
          error: res.error || null,
          recipients: recips.join(', '),
          sent_at: res.ok ? new Date().toISOString() : null,
        }).match(logKey);
      }
    }
  }
}"""

assert old_cron_loop_end in code, "Could not locate end of runDailyReports"
code = code.replace(old_cron_loop_end, new_cron_loop_end, 1)

# Support `report_type`, `download`, `preview`, and custom `recipients` in `/api/v1/daily-reports/send-now`
old_send_now_start = """app.post('/api/v1/daily-reports/send-now', async (c) => {
  const esc = (s: any) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  try {
    const tenantId = reportTenant(c);
    if (!tenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);
    const supabase = getSupabase(c.env);
    const body = await c.req.json().catch(() => ({}));
    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle();
    const cfg = await loadTenantConfig(supabase, tenantId);"""

new_send_now_start = """app.post('/api/v1/daily-reports/send-now', async (c) => {
  const esc = (s: any) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  try {
    const tenantId = reportTenant(c);
    if (!tenantId) return c.json({ success: false, message: 'tenant_id is required.' }, 400);
    const supabase = getSupabase(c.env);
    const body = await c.req.json().catch(() => ({}));
    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle();
    const cfg = await loadTenantConfig(supabase, tenantId);

    // Handle typed report requests (individual, shift, daily, weekly, monthly, incident)
    if (body?.report_type) {
      const rType = body.report_type as ReportCategory;
      const plantName = tenant?.name || 'Enterprise Security Site';
      const built = await generateTypedReport(supabase, c.env, tenantId, plantName, rType);
      if (body?.preview || body?.download) {
        return c.json({
          success: true,
          subject: built.subject,
          html: built.html,
          filename: built.filename,
          excelBase64: built.excelBase64,
        });
      }
      let schedules: Record<string, { enabled: boolean; emails: string }> = {};
      try { schedules = JSON.parse(cfg['REPORT_SCHEDULES_JSON'] || '{}'); } catch {}
      const rawEmails = body?.recipients || schedules[rType]?.emails || cfg['DAILY_REPORT_EMAILS'] || '';
      const recips = String(rawEmails).split(/[,;\\s]+/).map((e) => safeEmail(e)).filter(Boolean) as string[];
      if (recips.length === 0) {
        return c.json({ success: false, message: `No recipient email configured for ${rType} report.` }, 400);
      }
      const res = await sendTenantEmail(c.env, tenantId, recips, built.subject, built.html, {
        filename: built.filename,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentBase64: built.excelBase64,
      });
      if (!res.ok) return c.json({ success: false, message: res.error || 'Email send failed' }, 500);
      try {
        await supabase.from('daily_report_log').insert({
          tenant_id: tenantId,
          guard_id: `MANUAL_${rType.toUpperCase()}`,
          shift_name: `${rType.toUpperCase()} Report`,
          report_date: localDate(c.env, Date.now()),
          status: 'SENT',
          recipients: recips.join(', '),
          sent_at: new Date().toISOString(),
        });
      } catch (_) {}
      return c.json({ success: true, sent: 1, message: `${rType.toUpperCase()} report sent to ${recips.join(', ')}` });
    }"""

assert old_send_now_start in code, "Could not locate send-now route start"
code = code.replace(old_send_now_start, new_send_now_start, 1)

with open("backend/src/index.ts", "w", encoding="utf-8") as f:
    f.write(code)
print("✅ Backend multi-report engine, map snapshot renderer, and custom schedule updated.")
PYEOF

# ==============================================================================
# 2. FRONTEND: Upgrade DailyReportsPage.tsx with Custom Time + 6 Report Channels
# ==============================================================================
cat << 'TSEOF' > frontend/src/pages/DailyReportsPage.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  Mail, Plus, Trash2, Eye, Send, Save, X, Clock, CheckCircle2,
  AlertTriangle, Loader2, Download, MapPin, Users, Calendar, ShieldAlert, FileSpreadsheet
} from 'lucide-react';

const API = `${(import.meta as any).env?.VITE_API_URL || 'https://rakshak-api.spandangrasim.workers.dev'}/api/v1`;

type ReportCategory = 'individual' | 'shift' | 'daily' | 'weekly' | 'monthly' | 'incident';

interface Shift { name: string; start: string; end: string }
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
    title: 'Shift-Wise Patrol & Route Map Report',
    subtitle: 'Shift execution breakdown with attached Expected QR vs Guard Capture GPS route map.',
    frequency: 'After each shift & at Daily Time',
    badge: 'Includes Map',
    icon: MapPin,
  },
  {
    key: 'individual',
    title: 'Individual User / Guard Report',
    subtitle: 'Guard-by-guard patrol runs, verified QR scans, GPS drift accuracy, and incident counts.',
    frequency: 'Daily at configured time',
    icon: Users,
  },
  {
    key: 'daily',
    title: 'Daily Consolidated Digest',
    subtitle: 'Complete 24-hour site overview with KPIs, route completion, and Excel workbook attachment.',
    frequency: 'Once daily (Default 8:00 PM)',
    icon: Calendar,
  },
  {
    key: 'weekly',
    title: 'Weekly Management Summary',
    subtitle: '7-day rolling compliance and patrol performance summary for plant leadership.',
    frequency: 'Every Sunday at configured time',
    icon: FileSpreadsheet,
  },
  {
    key: 'monthly',
    title: 'Monthly Audit & Operations Report',
    subtitle: 'Full 30-day patrol attendance, checkpoint verification rate, and audit trail.',
    frequency: '1st of every month at configured time',
    icon: FileSpreadsheet,
  },
  {
    key: 'incident',
    title: 'Incident & Exception Report',
    subtitle: 'All logged P1–P4 security, fire, safety, and equipment incidents with timestamps.',
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

  const authHeaders = localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {};

  const loadLog = useCallback(() => {
    fetch(`${API}/daily-reports/log`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => setLog(d.log || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/admin/configs`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => {
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
          <p className="text-sm text-slate-500">Configure recipients, daily dispatch time, route map attachments, and download reports on demand.</p>
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
            <span className="block text-xs text-slate-500">Master switch for scheduled email dispatches.</span>
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
            Also copy each guard&apos;s assigned supervisor on shift reports
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
                    {r.guard_name || r.shift_name} <span className="font-medium text-slate-400">· {r.shift_name} · {r.report_date}</span>
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

echo "✅ Frontend DailyReportsPage.tsx updated."
echo "✨ All changes applied! Ready to build and deploy."
