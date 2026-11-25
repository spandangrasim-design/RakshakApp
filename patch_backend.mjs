import fs from 'node:fs';
import path from 'node:path';

const targetFile = path.resolve('backend/src/index.ts');
let code = fs.readFileSync(targetFile, 'utf8');

function replaceOnce(label, search, replacement) {
  if (!code.includes(search)) {
    throw new Error(`Pattern not found for [${label}]. File may already be patched or modified.`);
  }
  code = code.replace(search, replacement);
  console.log(`✔ Applied: ${label}`);
}

function replaceAll(label, search, replacement) {
  if (!code.includes(search)) {
    throw new Error(`Pattern not found for [${label}].`);
  }
  code = code.split(search).join(replacement);
  console.log(`✔ Applied: ${label}`);
}

// 1. Add assigned_plants to createGuardSchema & updateGuardSchema
replaceAll(
  'guard schemas assigned_plants',
  '  assignment_groups: sanitizeStringArray,',
  '  assignment_groups: sanitizeStringArray,\n  assigned_plants: sanitizeStringArray,'
);

// 2. Add assigned_plants to GuardExtendedProfile & saveGuardExtendedProfile
replaceOnce(
  'GuardExtendedProfile interface',
  `  assignment_groups?: string[];
  app_permissions?: Record<string, boolean> | null;`,
  `  assignment_groups?: string[];
  assigned_plants?: string[];
  app_permissions?: Record<string, boolean> | null;`
);

replaceOnce(
  'saveGuardExtendedProfile assigned_plants',
  `    ...(updates.assignment_groups !== undefined ? { assignment_groups: updates.assignment_groups } : {}),
    ...(updates.app_permissions !== undefined ? { app_permissions: updates.app_permissions } : {}),`,
  `    ...(updates.assignment_groups !== undefined ? { assignment_groups: updates.assignment_groups } : {}),
    ...(updates.assigned_plants !== undefined ? { assigned_plants: updates.assigned_plants } : {}),
    ...(updates.app_permissions !== undefined ? { app_permissions: updates.app_permissions } : {}),`
);

// 3. Order checkpoints sequentially in GET /api/v1/rounds
replaceOnce(
  'GET /rounds checkpoints query',
  `applyTenant(supabase.from('checkpoints').select('checkpoint_id, round_id, name, lat, lng, qr_payload'), scopeTenant(c)),`,
  `applyTenant(supabase.from('checkpoints').select('checkpoint_id, round_id, name, lat, lng, qr_payload, sequence_order'), scopeTenant(c)).order('sequence_order', { ascending: true }).order('name', { ascending: true }),`
);

replaceOnce(
  'GET /rounds checkpoints map',
  `            id: cp.checkpoint_id,
            name: cp.name,
            lat: cp.lat,
            lng: cp.lng,
            ...(viewer.is_guest ? {} : { qr_payload: cp.qr_payload })`,
  `            id: cp.checkpoint_id,
            name: cp.name,
            lat: cp.lat,
            lng: cp.lng,
            sequence_order: cp.sequence_order ?? 0,
            ...(viewer.is_guest ? {} : { qr_payload: cp.qr_payload })`
);

// 4. Save sequence_order in POST /api/v1/rounds
replaceOnce(
  'POST /rounds map index',
  `    if (checkpoints.length > 0) {
      const rows = checkpoints.map((cp) => {`,
  `    if (checkpoints.length > 0) {
      const rows = checkpoints.map((cp, idx) => {`
);

replaceOnce(
  'POST /rounds sequence_order field',
  `          tenant_id: roundTenant,
          location: \`SRID=4326;POINT(\${cp.lng} \${cp.lat})\``,
  `          tenant_id: roundTenant,
          sequence_order: idx + 1,
          location: \`SRID=4326;POINT(\${cp.lng} \${cp.lat})\``
);

// 5. Return assigned_plants in GET /api/v1/guards
replaceOnce(
  'GET /guards resolve assigned_plants',
  `      const uniqueGroups = Array.from(new Set(rawGroups.filter(Boolean)));`,
  `      const uniqueGroups = Array.from(new Set(rawGroups.filter(Boolean)));
      const rawPlants: string[] =
        Array.isArray(g.assigned_plants) && g.assigned_plants.length > 0
          ? g.assigned_plants
          : Array.isArray(ext.assigned_plants)
          ? ext.assigned_plants
          : [];
      const uniquePlants = Array.from(new Set(rawPlants.filter(Boolean)));`
);

replaceOnce(
  'GET /guards return assigned_plants',
  `        assignment_group: uniqueGroups[0] || 'Security Operations L1',
        assignment_groups: uniqueGroups,`,
  `        assignment_group: uniqueGroups[0] || 'Security Operations L1',
        assignment_groups: uniqueGroups,
        assigned_plants: uniquePlants,`
);

// 6. Order checkpoints sequentially in computeRouteBoard()
replaceOnce(
  'computeRouteBoard checkpoints query',
  `supabase.from('checkpoints').select('checkpoint_id, round_id, name').in('round_id', roundIds).order('name'),`,
  `supabase.from('checkpoints').select('checkpoint_id, round_id, name, sequence_order').in('round_id', roundIds).order('sequence_order', { ascending: true }).order('name', { ascending: true }),`
);

replaceOnce(
  'computeRouteBoard checkpoints map',
  `      checkpoints: rCps.map((x) => {
        const sc = scanned.get(x.checkpoint_id);
        return { id: x.checkpoint_id, name: x.name, scanned: !!sc, scanned_by: sc ? nm(sc.guard_id) : null, scanned_at: sc ? sc.at : null };
      }),`,
  `      checkpoints: rCps.map((x, idx) => {
        const sc = scanned.get(x.checkpoint_id);
        return { id: x.checkpoint_id, name: x.name, sequence_order: x.sequence_order || idx + 1, scanned: !!sc, scanned_by: sc ? nm(sc.guard_id) : null, scanned_at: sc ? sc.at : null };
      }),`
);

// 7. Return plants list in GET /api/v1/field/routes
replaceOnce(
  'GET /field/routes plants',
  `    const shift = currentShift(c.env, parseShifts(cfg['DAILY_REPORT_SHIFTS']));
    return c.json({
      success: true,
      routes: board,`,
  `    const shift = currentShift(c.env, parseShifts(cfg['DAILY_REPORT_SHIFTS']));
    let plants: string[] = ['Test - P1', 'Test2 - P2'];
    if (cfg['CUSTOM_PLANTS']) {
      try {
        const parsedPlants = JSON.parse(cfg['CUSTOM_PLANTS']);
        if (Array.isArray(parsedPlants) && parsedPlants.length > 0) plants = parsedPlants;
      } catch {}
    }
    return c.json({
      success: true,
      routes: board,
      plants,`
);

// 8. Save assigned_plants in POST /api/v1/guards & PATCH /api/v1/guards/:id
replaceOnce(
  'POST /guards insertPayload assigned_plants',
  `      assignment_group: groupsList[0],
      assignment_groups: groupsList,`,
  `      assignment_group: groupsList[0],
      assignment_groups: groupsList,
      assigned_plants: parsed.assigned_plants || [],`
);

replaceOnce(
  'POST /guards saveGuardExtendedProfile assigned_plants',
  `        assignment_groups: groupsList,
        app_permissions: clampedPerms`,
  `        assignment_groups: groupsList,
        assigned_plants: parsed.assigned_plants || [],
        app_permissions: clampedPerms`
);

replaceOnce(
  'PATCH /guards assigned_plants',
  `    if (parsed.app_permissions !== undefined) {
      updates.app_permissions = parsed.app_permissions;
      extUpdates.app_permissions = parsed.app_permissions;
    }`,
  `    if (parsed.assigned_plants !== undefined) {
      updates.assigned_plants = parsed.assigned_plants;
      extUpdates.assigned_plants = parsed.assigned_plants;
    }

    if (parsed.app_permissions !== undefined) {
      updates.app_permissions = parsed.app_permissions;
      extUpdates.app_permissions = parsed.app_permissions;
    }`
);

replaceOnce(
  'PATCH /guards safeUpdates strip assigned_plants',
  `      delete safeUpdates.assignment_groups;`,
  `      delete safeUpdates.assignment_groups;
      delete safeUpdates.assigned_plants;`
);

// 9. Update POST /api/v1/incidents for plant_name
replaceOnce(
  'POST /incidents destructure plant_name',
  `      priority,
      category,`,
  `      priority,
      plant_name,
      category,`
);

replaceOnce(
  'POST /incidents insertRecord plant_name',
  `    const targetGroup = assignment_group || 'Security Operations L1';

    const insertRecord: Record<string, any> = {
      client_incident_id: incidentUuid,
      guard_id: resolvedGuardId,
      title: title || (description ? description.substring(0, 40) : 'Security Incident'),
      description: description || title || 'Security Incident',
      priority: priority || 'P3',`,
  `    const targetGroup = assignment_group || 'Security Operations L1';
    const targetPlant = String(plant_name || 'Test - P1').trim();

    const insertRecord: Record<string, any> = {
      client_incident_id: incidentUuid,
      guard_id: resolvedGuardId,
      title: title || (description ? description.substring(0, 40) : 'Security Incident'),
      description: description || title || 'Security Incident',
      plant_name: targetPlant,
      priority: priority || null,`
);

replaceOnce(
  'POST /incidents basicRecord plant_name',
  `        title: insertRecord.title,
        description: insertRecord.description,
        priority: insertRecord.priority,`,
  `        title: insertRecord.title,
        description: insertRecord.description,
        plant_name: targetPlant,
        priority: insertRecord.priority,`
);

replaceOnce(
  'POST /incidents email dispatch plantName',
  `      emailResult = await sendGroupAssignmentEmail(c.env, {
        incidentId: incidentUuid,
        priority: body.priority || 'P3',
        description: description || title || 'Security Incident',
        photoUrl: finalPhotoUrl,
        assignmentGroup: targetGroup,`,
  `      emailResult = await sendGroupAssignmentEmail(c.env, {
        incidentId: incidentUuid,
        priority: body.priority || '',
        plantName: targetPlant,
        description: description || title || 'Security Incident',
        photoUrl: finalPhotoUrl,
        assignmentGroup: targetGroup,`
);

// 10. Filter by plant_name in GET /api/v1/incidents
replaceOnce(
  'GET /incidents plantFilter read',
  `    const priorityFilter = (c.req.query('priority') || '').trim().toUpperCase();`,
  `    const priorityFilter = (c.req.query('priority') || '').trim().toUpperCase();
    const plantFilter = (c.req.query('plant_name') || '').trim();`
);

replaceOnce(
  'GET /incidents plantFilter apply',
  `    if (priorityFilter && priorityFilter !== 'ALL') {
      incQuery = incQuery.ilike('priority', \`\${priorityFilter}%\`);
    }`,
  `    if (priorityFilter && priorityFilter !== 'ALL') {
      incQuery = incQuery.ilike('priority', \`\${priorityFilter}%\`);
    }
    if (plantFilter && plantFilter !== 'ALL') {
      incQuery = incQuery.eq('plant_name', plantFilter);
    }`
);

// 11. Update PATCH /api/v1/incidents/:id for plant_name
replaceOnce(
  'PATCH /incidents plant_name update',
  `    if (body.priority !== undefined) updates.priority = body.priority;`,
  `    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.plant_name !== undefined) updates.plant_name = body.plant_name;`
);

replaceOnce(
  'PATCH /incidents plant change email trigger',
  `    const groupChanged =
      body.assignment_group !== undefined &&
      body.assignment_group !== (current.assignment_group || '');`,
  `    const plantChanged =
      body.plant_name !== undefined &&
      body.plant_name !== (current.plant_name || '');
    if (plantChanged) {
      changes.push(\`Plant Name changed from "\${current.plant_name || 'None'}" to "\${body.plant_name}"\`);
    }

    const groupChanged =
      body.assignment_group !== undefined &&
      body.assignment_group !== (current.assignment_group || '');`
);

replaceOnce(
  'PATCH /incidents trigger email on plantChanged',
  `    if (groupChanged || (assigneeChanged && newAssigneeClean !== '')) {
      emailTriggered = true;
      const targetGroup = body.assignment_group || current.assignment_group || 'Security Operations L1';
      const targetAssignee = newAssigneeClean || 'Unassigned (Group Queue)';

      emailDispatchResult = await sendGroupAssignmentEmail(c.env, {
        incidentId,
        priority: body.priority || current.priority || 'P3',`,
  `    if (plantChanged || groupChanged || (assigneeChanged && newAssigneeClean !== '')) {
      emailTriggered = true;
      const targetGroup = body.assignment_group || current.assignment_group || 'Security Operations L1';
      const targetPlant = body.plant_name || current.plant_name || '';
      const targetAssignee = newAssigneeClean || 'Unassigned (Group Queue)';

      emailDispatchResult = await sendGroupAssignmentEmail(c.env, {
        incidentId,
        priority: body.priority || current.priority || '',
        plantName: targetPlant,`
);

// 12. Update sendGroupAssignmentEmail() to notify users assigned to the Plant Name
replaceOnce(
  'sendGroupAssignmentEmail params',
  `    incidentId: string;
    priority: string;
    description: string;`,
  `    incidentId: string;
    priority: string;
    plantName?: string;
    description: string;`
);

replaceOnce(
  'sendGroupAssignmentEmail plant recipient matching',
  `  const targetGroupClean = (params.assignmentGroup || '').trim().toLowerCase();
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
  });`,
  `  const targetPlantClean = (params.plantName || '').trim().toLowerCase();
  const targetGroupClean = (params.assignmentGroup || '').trim().toLowerCase();
  const recipientSet = new Set<string>();

  (guardsRes.data || []).forEach((g: any) => {
    if (g.is_active === false) return;
    const ext = extProfilesMap[g.guard_id] || {};

    const gPlants: string[] =
      Array.isArray(g.assigned_plants) && g.assigned_plants.length > 0
        ? g.assigned_plants
        : Array.isArray(ext.assigned_plants)
        ? ext.assigned_plants
        : [];

    const gGroups: string[] =
      Array.isArray(g.assignment_groups) && g.assignment_groups.length > 0
        ? g.assignment_groups
        : Array.isArray(ext.assignment_groups) && ext.assignment_groups.length > 0
        ? ext.assignment_groups
        : g.assignment_group
        ? [g.assignment_group]
        : ['Security Operations L1'];

    const belongsToTargetPlant =
      targetPlantClean !== '' &&
      gPlants.some((p) => (p || '').trim().toLowerCase() === targetPlantClean);

    const belongsToTargetGroup = gGroups.some(
      (grp) => (grp || '').trim().toLowerCase() === targetGroupClean
    );

    const memberEmail = safeEmail(g.email || ext.email || '');
    if ((belongsToTargetPlant || belongsToTargetGroup) && memberEmail) {
      recipientSet.add(memberEmail);
    }
  });`
);

replaceOnce(
  'sendGroupAssignmentEmail subject & body Plant Name',
  `  const subjectText = \`[Rakshak Dispatch - \${params.assignmentGroup}] \${params.priority} Case \${caseNumber}\`;`,
  `  const plantLabel = params.plantName ? \`Plant: \${params.plantName}\` : params.assignmentGroup;
  const subjectText = \`[Rakshak Alert - \${plantLabel}] Case \${caseNumber}\`;`
);

replaceOnce(
  'sendGroupAssignmentEmail HTML row Plant Name',
  `          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Severity / Status</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>\${esc(params.priority)}</strong> (\${esc(params.status)})</td>
          </tr>`,
  `          <tr>
            <td style="padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold;">Plant Name / Status</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;"><strong>\${esc(params.plantName || 'Unassigned Plant')}</strong> (\${esc(params.status)})</td>
          </tr>`
);

fs.writeFileSync(targetFile, code, 'utf8');
console.log('\\n✅ All backend/src/index.ts updates applied successfully!');