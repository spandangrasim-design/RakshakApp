import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sign, verify } from 'hono/jwt' 
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import CryptoJS from 'crypto-js' 

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  JWT_SECRET: string
  QR_SECRET: string 
  R2_BUCKET: R2Bucket // Cloudflare R2 Private Storage
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/*', cors())

// --- SCHEMAS ---
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
  password: z.string().min(4, 'Password must be at least 4 characters'),
  role: z.string().optional(),
  site_location: z.string().optional(),
  shift_timing: z.string().optional(),
  assigned_round_id: z.string().uuid().nullable().optional(),
  reporting_to: z.string().uuid().nullable().optional(),
})

const updateGuardSchema = z.object({
  full_name: z.string().optional(),
  password: z.string().optional(),
  is_active: z.boolean().optional(),
  role: z.string().optional(),
  site_location: z.string().optional(),
  shift_timing: z.string().optional(),
  assigned_round_id: z.string().uuid().nullable().optional(),
  reporting_to: z.string().uuid().nullable().optional(),
})

const getSupabase = (env: Bindings) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { 
    auth: { persistSession: false },
    global: { fetch: (...args) => fetch(...args) } 
  });

// ==========================================
// SECURE PRIVATE R2 MEDIA STREAMING ROUTE
// ==========================================
app.get('/api/v1/media/*', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    const queryToken = c.req.query('token');
    const referer = c.req.header('Referer') || '';
    const origin = c.req.header('Origin') || '';

    let token = '';
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (queryToken) {
      token = queryToken.trim();
    }

    const isFromDashboard = 
      origin.includes('rakshakapp.pages.dev') || 
      referer.includes('rakshakapp.pages.dev') ||
      origin.includes('localhost') || 
      referer.includes('localhost');

    if (token) {
      try {
        await verify(token, c.env.JWT_SECRET, 'HS256');
      } catch (e) {
        return c.json({ error_code: 'UNAUTHORIZED', message: 'Invalid or expired token.' }, 401);
      }
    } else if (!isFromDashboard) {
      return c.json({ error_code: 'UNAUTHORIZED', message: 'Missing authentication token.' }, 401);
    }

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
    headers.set('Cache-Control', 'private, max-age=86400');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { status: 200, headers });
  } catch (error: any) {
    return c.json({ error_code: 'SERVER_ERROR', message: error.message || 'Failed to stream media.' }, 500);
  }
});

// ==========================================
// 1. AUTH ROUTES
// ==========================================
app.post('/api/v1/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const { employee_code, password, device_id } = loginSchema.parse(body)

    const supabase = getSupabase(c.env);

    const { data: guard, error } = await supabase
      .from('guards')
      .select('guard_id, full_name, employee_code, password_hash, is_active, role, site_location, shift_timing, assigned_round_id')
      .eq('employee_code', employee_code)
      .single()

    if (error || !guard || !guard.is_active || guard.password_hash !== password) {
      return c.json({ error_code: 'INVALID_CREDENTIALS', message: 'Invalid Login.' }, 401)
    }

    const payload = {
      sub: guard.guard_id,
      role: guard.role || 'guard',
      device_id: device_id || 'unknown',
      exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60) 
    }
    const access_token = await sign(payload, c.env.JWT_SECRET, 'HS256')

    return c.json({
      access_token,
      refresh_token: "dummy_refresh_token_for_now",
      server_time_ms: Date.now(),
      guard: {
        guard_id: guard.guard_id,
        full_name: guard.full_name,
        employee_code: guard.employee_code,
        role: guard.role || 'Guard',
        site_location: guard.site_location || 'Main Plant',
        assigned_round_id: guard.assigned_round_id || null
      },
      active_shift: null 
    }, 200)

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error_code: 'BAD_REQUEST', message: 'Invalid fields.' }, 400)
    }
    return c.json({ error_code: 'SERVER_ERROR', message: 'Server error.' }, 500)
  }
})

// ==========================================
// 2. PATROL SCANS API (2-STEP VERIFICATION)
// ==========================================
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

    const dataToSign = `${checkpoint_id}|${qr_lat}|${qr_lng}`;
    const expectedSignature = CryptoJS.HmacSHA256(dataToSign, c.env.QR_SECRET).toString(CryptoJS.enc.Hex);

    if (signature !== expectedSignature) {
      return c.json({ success: false, message: 'Invalid or forged QR Code detected.' }, 403);
    }

    const url = new URL(c.req.url);

    const uploadToR2 = async (base64Str?: string, prefix: string = 'scan') => {
      if (!base64Str || !base64Str.startsWith('data:image')) return null;
      try {
        const cleanData = base64Str.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(cleanData), char => char.charCodeAt(0));
        const fileName = `scans/${prefix}_${client_scan_id}_${Date.now()}.jpg`;
        
        await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        return `${url.origin}/api/v1/media/${fileName}`;
      } catch (err) {
        console.error(`Failed to upload ${prefix} image to R2:`, err);
        return null;
      }
    };

    const finalSelfieUrl = await uploadToR2(selfie_url || photo_url, 'selfie');
    const finalLocationUrl = await uploadToR2(location_photo_url, 'location') || finalSelfieUrl;

    const supabase = getSupabase(c.env);

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
        location_photo_url: finalLocationUrl
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
      .limit(30);

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

    const { data: checkpoints, error: cpError } = await supabase
      .from('checkpoints')
      .select('checkpoint_id, name, lat, lng')
      .eq('round_id', roundId);

    if (cpError) throw cpError;

    const checkpointIds = (checkpoints || []).map((cp) => cp.checkpoint_id);

    let scans: any[] = [];
    if (checkpointIds.length > 0) {
      const { data: scanRecords, error: scanError } = await supabase
        .from('scans')
        .select('*')
        .in('checkpoint_id', checkpointIds)
        .order('scan_time', { ascending: true });

      if (!scanError && scanRecords) {
        scans = scanRecords.map((s) => {
          const matchCp = checkpoints?.find((cp) => cp.checkpoint_id === s.checkpoint_id);
          return {
            ...s,
            checkpoint_name: matchCp?.name || s.checkpoint_id,
            expected_lat: matchCp?.lat,
            expected_lng: matchCp?.lng,
          };
        });
      }
    }

    return c.json({ success: true, scans });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Failed to fetch round scans' }, 500);
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
      const dataToSign = `${scan.checkpoint_id}|${scan.qr_lat}|${scan.qr_lng}`;
      const expectedSignature = CryptoJS.HmacSHA256(dataToSign, c.env.QR_SECRET).toString(CryptoJS.enc.Hex);
      
      if (scan.signature !== expectedSignature) {
        results.push({ client_scan_id: scan.client_scan_id, status: 'failed', reason: 'Invalid Signature' });
        continue;
      }

      let selfieUrl = '';
      let locationUrl = '';

      if (scan.selfie_url && scan.selfie_url.startsWith('data:image')) {
        const base64Data = scan.selfie_url.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
        const fileName = `scans/selfie_${scan.client_scan_id}.jpg`;
        await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        selfieUrl = `${url.origin}/api/v1/media/${fileName}`;
      }

      if (scan.location_photo_url && scan.location_photo_url.startsWith('data:image')) {
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
            location_photo_url: locationUrl
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

    const { data: rounds, error: roundsError } = await supabase
      .from('rounds')
      .select('*')
      .order('created_at', { ascending: false });

    if (roundsError) {
      return c.json({ success: false, message: roundsError.message }, 500);
    }

    const { data: checkpoints, error: cpError } = await supabase
      .from('checkpoints')
      .select('checkpoint_id, round_id, name, lat, lng, qr_payload');

    if (cpError) {
      return c.json({ success: false, message: cpError.message }, 500);
    }

    const roundsWithCheckpoints = (rounds || []).map((round) => ({
      ...round,
      checkpoints: (checkpoints || [])
        .filter((cp) => cp.round_id === round.id)
        .map((cp) => ({
          id: cp.checkpoint_id,
          name: cp.name,
          lat: cp.lat,
          lng: cp.lng,
          qr_payload: cp.qr_payload
        }))
    }));

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

    if (activeRoundId) {
      const { error: updateError } = await supabase
        .from('rounds')
        .update({ name })
        .eq('id', activeRoundId);

      if (updateError) return c.json({ success: false, message: updateError.message }, 500);

      await supabase.from('checkpoints').delete().eq('round_id', activeRoundId);
    } else {
      const { data: newRound, error: insertError } = await supabase
        .from('rounds')
        .insert([{ name }])
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
// 5. GUARD MANAGEMENT CRUD & HIERARCHY
// ==========================================

// Helper to sanitize UUID inputs (converts "" to null)
const sanitizeUuid = z.string().optional().nullable().transform(v => (!v || v.trim() === '' ? null : v.trim()));

const createGuardSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  employee_code: z.string().min(1, 'Employee code is required'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
  role: z.string().optional().default('Guard'),
  site_location: z.string().optional().default('Main Plant & Gate 1'),
  shift_timing: z.string().optional().default('Morning (06:00 - 14:00)'),
  assigned_round_id: sanitizeUuid,
  reporting_to: sanitizeUuid,
});

const updateGuardSchema = z.object({
  full_name: z.string().optional(),
  password: z.string().optional(),
  is_active: z.boolean().optional(),
  role: z.string().optional(),
  site_location: z.string().optional(),
  shift_timing: z.string().optional(),
  assigned_round_id: sanitizeUuid,
  reporting_to: sanitizeUuid,
});

// GET all guards + mapped round names (bulletproof in-memory join)
app.get('/api/v1/guards', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    
    const { data: guards, error } = await supabase
      .from('guards')
      .select('guard_id, full_name, employee_code, role, site_location, shift_timing, is_active, created_at, assigned_round_id, reporting_to')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch rounds and join in memory (avoids PostgREST schema cache relationship errors)
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id, name');

    const roundsMap = new Map((rounds || []).map((r: any) => [r.id, r]));

    const guardsWithRounds = (guards || []).map((g: any) => ({
      ...g,
      rounds: g.assigned_round_id ? roundsMap.get(g.assigned_round_id) || null : null
    }));

    return c.json({ success: true, guards: guardsWithRounds });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Failed to fetch guards' }, 500);
  }
});

// Create new guard
app.post('/api/v1/guards', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createGuardSchema.parse(body);
    const supabase = getSupabase(c.env);

    const { data: existing } = await supabase
      .from('guards')
      .select('guard_id')
      .eq('employee_code', parsed.employee_code.trim())
      .maybeSingle();

    if (existing) {
      return c.json({ success: false, message: 'A guard with this employee code already exists.' }, 400);
    }

    const { data: newGuard, error } = await supabase
      .from('guards')
      .insert([{
        full_name: parsed.full_name.trim(),
        employee_code: parsed.employee_code.trim(),
        password_hash: parsed.password,
        role: parsed.role,
        site_location: parsed.site_location,
        shift_timing: parsed.shift_timing,
        assigned_round_id: parsed.assigned_round_id,
        reporting_to: parsed.reporting_to,
        is_active: true,
      }])
      .select('guard_id, full_name, employee_code, role, site_location, shift_timing, is_active, created_at, assigned_round_id, reporting_to')
      .single();

    if (error) throw error;
    return c.json({ success: true, guard: newGuard }, 201);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: error.errors[0]?.message || 'Invalid format' }, 400);
    }
    return c.json({ success: false, message: error.message || 'Failed to create guard' }, 500);
  }
});

// Update guard details, hierarchy, or patrol route assignment
app.patch('/api/v1/guards/:id', async (c) => {
  try {
    const guardId = c.req.param('id');
    const body = await c.req.json();
    const parsed = updateGuardSchema.parse(body);
    const supabase = getSupabase(c.env);

    const updates: Record<string, any> = {};
    if (parsed.full_name !== undefined) updates.full_name = parsed.full_name.trim();
    if (parsed.password !== undefined && parsed.password.trim() !== '') updates.password_hash = parsed.password;
    if (parsed.is_active !== undefined) updates.is_active = parsed.is_active;
    if (parsed.role !== undefined) updates.role = parsed.role;
    if (parsed.site_location !== undefined) updates.site_location = parsed.site_location;
    if (parsed.shift_timing !== undefined) updates.shift_timing = parsed.shift_timing;
    if (parsed.assigned_round_id !== undefined) updates.assigned_round_id = parsed.assigned_round_id;
    if (parsed.reporting_to !== undefined) updates.reporting_to = parsed.reporting_to;

    if (Object.keys(updates).length === 0) {
      return c.json({ success: false, message: 'No fields provided to update.' }, 400);
    }

    const { data: updatedGuard, error } = await supabase
      .from('guards')
      .update(updates)
      .eq('guard_id', guardId)
      .select('guard_id, full_name, employee_code, role, site_location, shift_timing, is_active, created_at, assigned_round_id, reporting_to')
      .maybeSingle();

    if (error) throw error;

    // Attach round info if assigned
    let roundInfo = null;
    if (updatedGuard?.assigned_round_id) {
      const { data: rData } = await supabase
        .from('rounds')
        .select('id, name')
        .eq('id', updatedGuard.assigned_round_id)
        .maybeSingle();
      roundInfo = rData;
    }

    return c.json({ success: true, guard: { ...updatedGuard, rounds: roundInfo } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: error.errors[0]?.message || 'Invalid format' }, 400);
    }
    return c.json({ success: false, message: error.message || 'Failed to update guard' }, 500);
  }
});

// Mobile App Route: Fetch assigned route for currently logged-in guard
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
      .select('guard_id, full_name, role, assigned_round_id')
      .eq('guard_id', guard_id)
      .maybeSingle();

    if (gError || !guard || !guard.assigned_round_id) {
      return c.json({ success: true, has_route: false, message: 'No patrol route currently assigned to you.' });
    }

    const { data: round, error: rError } = await supabase
      .from('rounds')
      .select('id, name')
      .eq('id', guard.assigned_round_id)
      .maybeSingle();

    if (rError || !round) {
      return c.json({ success: true, has_route: false, message: 'Assigned route not found.' });
    }

    const { data: checkpoints } = await supabase
      .from('checkpoints')
      .select('checkpoint_id, name, lat, lng, qr_payload')
      .eq('round_id', round.id);

    return c.json({
      success: true,
      has_route: true,
      route: {
        id: round.id,
        name: round.name,
        total_checkpoints: checkpoints?.length || 0,
        checkpoints: checkpoints || []
      }
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
  }
});

// ==========================================
// 6. TICKETING & INCIDENT COMMAND (R2 SECURED)
// ==========================================
app.post('/api/v1/incidents', async (c) => {
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

    const url = new URL(c.req.url);
    const body = await c.req.json();
    const { client_incident_id, title, description, priority, photo_url, reported_at } = body;

    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_incident_id || '');
    const incidentUuid = isValidUUID ? client_incident_id : crypto.randomUUID();

    let finalPhotoUrl = null;
    if (photo_url && photo_url.startsWith('data:image')) {
      const base64Data = photo_url.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
      const fileName = `incidents/${incidentUuid}.jpg`;
      
      await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
      finalPhotoUrl = `${url.origin}/api/v1/media/${fileName}`; 
    }

    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('incidents')
      .upsert({
        client_incident_id: incidentUuid,
        guard_id: guard_id, 
        title: title || (description ? description.substring(0, 30) : 'Security Incident'),
        description: description,
        priority: priority || 'P3',
        photo_url: finalPhotoUrl,
        status: 'OPEN',
        reported_at: reported_at || new Date().toISOString()
      }, { onConflict: 'client_incident_id' }) 
      .select()
      .single();

    if (error) return c.json({ success: false, message: 'Database error', error }, 500);
    return c.json({ success: true, incident: data }, 201);

  } catch (error) {
    return c.json({ success: false, message: 'Internal Server Error' }, 500);
  }
});

// GET all Incidents (Admin Web Dashboard Feed)
app.get('/api/v1/incidents', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .order('reported_at', { ascending: false });
    
    if (error) throw error;
    return c.json({ success: true, incidents: data });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch incidents' }, 500);
  }
});

// Helper: Resolve true incident record regardless of ID representation
async function resolveIncidentRecord(supabase: any, rawParam: string) {
  const target = decodeURIComponent(rawParam).trim().toLowerCase();

  // Try exact client_incident_id match
  let { data: match } = await supabase
    .from('incidents')
    .select('*')
    .eq('client_incident_id', rawParam)
    .maybeSingle();

  if (match) return match;

  // Search across recent incidents for UUID prefixes or INC ticket numbers
  const { data: all } = await supabase
    .from('incidents')
    .select('*')
    .limit(100);

  if (all && all.length > 0) {
    match = all.find((inc: any) => {
      const cId = (inc.client_incident_id || '').toLowerCase();
      if (cId === target) return true;
      if (cId && target && (cId.includes(target) || target.includes(cId))) return true;
      if (inc.incident_id && String(inc.incident_id).toLowerCase() === target) return true;
      
      const formatted = `inc${cId.replace(/[^0-9]/g, '').padEnd(7, '0').slice(0, 7)}`;
      return formatted === target;
    });
  }

  return match || null;
}

// GET Single Incident + Threaded Updates (Newest updates first at the TOP)
app.get('/api/v1/incidents/:id', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const supabase = getSupabase(c.env);

    const incident = await resolveIncidentRecord(supabase, rawParam);
    if (!incident) {
      return c.json({ success: false, message: 'Incident record not found.' }, 404);
    }

    const targetId = incident.client_incident_id;

    // Sort by created_at DESC so newest comments are at the top
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

// POST an Update/Comment to an Incident Thread
app.post('/api/v1/incidents/:id/updates', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const url = new URL(c.req.url);
    const body = await c.req.json();
    const { sender_type, sender_name, message, photo_base64 } = body;
    const supabase = getSupabase(c.env);

    const incident = await resolveIncidentRecord(supabase, rawParam);
    const incidentId = incident?.client_incident_id || rawParam;

    let finalPhotoUrl = null;
    if (photo_base64 && photo_base64.startsWith('data:image')) {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
      const fileName = `incident_updates/${incidentId}_${Date.now()}.jpg`;
      
      await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
      finalPhotoUrl = `${url.origin}/api/v1/media/${fileName}`; 
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

// PATCH: General Incident Field Updates + Auto-Audit Logging
app.patch('/api/v1/incidents/:id', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const body = await c.req.json();
    const supabase = getSupabase(c.env);

    const current = await resolveIncidentRecord(supabase, rawParam);
    if (!current) {
      return c.json({ success: false, message: 'Incident not found.' }, 404);
    }
    const incidentId = current.client_incident_id;

    const updates: Record<string, any> = {};
    if (body.description !== undefined) updates.description = body.description;
    if (body.title !== undefined) updates.title = body.title;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;
    if (body.category !== undefined) updates.category = body.category;
    if (body.impact !== undefined) updates.impact = body.impact;
    if (body.urgency !== undefined) updates.urgency = body.urgency;
    if (body.assignment_group !== undefined) updates.assignment_group = body.assignment_group;
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;

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

    let createdActivity = null;
    const combinedMessage = [
      body.work_note ? body.work_note.trim() : '',
      changes.length > 0 ? `Field Changes: ${changes.join(', ')}` : ''
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
      activity: createdActivity 
    });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Failed to update incident' }, 500);
  }
});

// PATCH: Mark Incident as RESOLVED with mandatory Resolution Information
app.patch('/api/v1/incidents/:id/resolve', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const body = await c.req.json();
    const supabase = getSupabase(c.env);

    const current = await resolveIncidentRecord(supabase, rawParam);
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

    const activityMessage = `✅ INCIDENT RESOLVED\nResolution Code: ${resolutionCode}\nResolution Notes: ${resolutionNotes.trim()}`;

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

// DELETE Incident
app.delete('/api/v1/incidents/:id', async (c) => {
  try {
    const rawParam = c.req.param('id');
    const supabase = getSupabase(c.env);

    const current = await resolveIncidentRecord(supabase, rawParam);
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
// 7. ADMIN WEB DASHBOARD: CONFIGS
// ==========================================
app.get('/api/v1/admin/configs', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data, error } = await supabase.from('admin_configurations').select('*');
    
    if (error) throw error;
    return c.json({ success: true, configs: data });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to load configs' }, 500);
  }
});

app.post('/api/v1/admin/configs', async (c) => {
  try {
    const body = await c.req.json();
    const supabase = getSupabase(c.env);
    const { error } = await supabase
      .from('admin_configurations')
      .upsert(body, { onConflict: 'key_name' });
      
    if (error) throw error;
    return c.json({ success: true, message: 'Configurations updated' });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to save configs' }, 500);
  }
});

// Alerts
async function sendWhatsAppAlert(env: Bindings, incidentId: string, priority: string, description: string) {
  const supabase = getSupabase(env);
  const { data: configs, error } = await supabase
    .from('admin_configurations')
    .select('key_name, key_value')
    .in('key_name', ['WHATSAPP_API_TOKEN', 'MANAGER_PHONE', 'WHATSAPP_PHONE_ID']);

  if (error || !configs) return false;

  const configMap = configs.reduce((acc: any, curr) => ({ ...acc, [curr.key_name]: curr.key_value }), {});
  const token = configMap['WHATSAPP_API_TOKEN'];
  const phoneId = configMap['WHATSAPP_PHONE_ID']; 
  const managerPhone = configMap['MANAGER_PHONE']; 

  if (!token || !managerPhone || !phoneId) return false;

  const payload = {
    messaging_product: "whatsapp",
    to: managerPhone,
    type: "text",
    text: {
      body: `🚨 *CRITICAL ALERT: ${priority} INCIDENT*\n\nAn incident has been open for 10 minutes and requires immediate attention.\n\n*ID:* ${incidentId}\n*Details:* ${description}\n\nPlease check the admin dashboard immediately.`
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

async function sendGoogleEmergencyEmail(env: Bindings, incidentId: string, priority: string, description: string, photoUrl: string | null) {
  const supabase = getSupabase(env);
  const { data: configs, error } = await supabase
    .from('admin_configurations')
    .select('key_name, key_value')
    .in('key_name', ['GMAIL_ACCESS_TOKEN', 'MANAGER_EMAIL']);

  if (error || !configs) return false;

  const configMap = configs.reduce((acc: any, curr) => ({ ...acc, [curr.key_name]: curr.key_value }), {});
  const token = configMap['GMAIL_ACCESS_TOKEN'];
  const managerEmail = configMap['MANAGER_EMAIL'];

  if (!token || !managerEmail) return false;

  const emailLines = [
    `To: ${managerEmail}`,
    'Subject: =?utf-8?B?' + btoa(`🚨 CRITICAL SLA BREACH: ${priority} Incident`) + '?=',
    'Content-Type: text/html; charset=utf-8',
    '',
    `<h2>SLA Escalation: ${priority} Incident</h2>`,
    `<p><strong>Incident ID:</strong> ${incidentId}</p>`,
    `<p><strong>Description:</strong> ${description}</p>`,
    photoUrl ? `<p><img src="${photoUrl}" alt="Incident Photo" style="max-width:300px;"/></p>` : '',
    `<p>This incident has been OPEN for more than 10 minutes. Please take immediate action.</p>`
  ];

  const email = emailLines.join('\r\n');
  const base64EncodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64EncodedEmail })
    });
    return response.ok;
  } catch (err) {
    return false;
  }
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

    for (const incident of incidents) {
      await Promise.all([
        sendGoogleEmergencyEmail(env, incident.client_incident_id, incident.priority, incident.description, incident.photo_url),
        sendWhatsAppAlert(env, incident.client_incident_id, incident.priority, incident.description)
      ]);

      await supabase
        .from('incidents')
        .update({ status: 'ESCALATED' })
        .eq('client_incident_id', incident.client_incident_id);
    }
  }
}