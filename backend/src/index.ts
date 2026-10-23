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
  R2_BUCKET: R2Bucket // Sprint 4 Cloudflare R2 Storage
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
  client_scan_id: z.string(), // Sprint 4 Idempotency UUID
  checkpoint_id: z.string(),
  qr_lat: z.string(),
  qr_lng: z.string(),
  signature: z.string(),
  guard_lat: z.number(),
  guard_lng: z.number(),
  uptime_seconds: z.number().optional(), 
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

// Guard Management Schemas
const createGuardSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  employee_code: z.string().min(1, 'Employee code is required'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
})

const updateGuardSchema = z.object({
  full_name: z.string().optional(),
  password: z.string().optional(),
  is_active: z.boolean().optional(),
})

// Helper to initialize Supabase admin client
const getSupabase = (env: Bindings) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { 
    auth: { persistSession: false },
    global: { fetch: (...args) => fetch(...args) } 
  });

// --- ROUTES ----

// 1. Auth Login Route
app.post('/api/v1/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const { employee_code, password, device_id } = loginSchema.parse(body)

    const supabase = getSupabase(c.env);

    const { data: guard, error } = await supabase
      .from('guards')
      .select('guard_id, full_name, employee_code, password_hash, is_active')
      .eq('employee_code', employee_code)
      .single()

    if (error || !guard || !guard.is_active || guard.password_hash !== password) {
      return c.json({ error_code: 'INVALID_CREDENTIALS', message: 'Invalid Login.' }, 401)
    }

    const payload = {
      sub: guard.guard_id,
      role: 'guard',
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
        employee_code: guard.employee_code
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

// 2. Patrol Scan Route (Single Live Scan)
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
    const { client_scan_id, checkpoint_id, qr_lat, qr_lng, signature, guard_lat, guard_lng, uptime_seconds, photo_url } = scanSchema.parse(body);

    const dataToSign = `${checkpoint_id}|${qr_lat}|${qr_lng}`;
    const expectedSignature = CryptoJS.HmacSHA256(dataToSign, c.env.QR_SECRET).toString(CryptoJS.enc.Hex);

    if (signature !== expectedSignature) {
      return c.json({ success: false, message: 'Invalid or forged QR Code detected.' }, 403);
    }

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
      p_photo_url: photo_url || ''
    });

    if (error) {
      return c.json({ success: false, message: 'Database error', error }, 500);
    }

    return c.json({ success: true, verification: data });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: 'Invalid data format', errors: error.errors }, 400);
    }
    return c.json({ success: false, message: 'Server error' }, 500);
  }
});

// 2B. GET Recent Scans for Authenticated Guard (Activity Log)
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

// 3. Sprint 4: Auto-Sync Engine (Bulk Offline Upload)
app.post('/api/v1/patrols/sync', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);
    
    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    const guard_id = payload.sub as string;

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

      let photoUrl = 'https://pub-e772f9cb2c7c4e53801177d8059805a8.r2.dev';
      if (scan.photo_url && scan.photo_url.startsWith('data:image')) {
        const base64Data = scan.photo_url.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
        const fileName = `scans/${scan.client_scan_id}.jpg`;
        
        await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        photoUrl = `https://pub-e772f9cb2c7c4e53801177d8059805a8.r2.dev/${fileName}`; 
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
        p_photo_url: photoUrl
      });

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
// SHIFT TRACKING API
// ==========================================

// 1. GET Current Active Shift for Guard
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

// 2. POST Start Shift
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

// 3. POST End Shift
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

// 4A. GET All Rounds with Checkpoints
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

// 4B. POST Create or Update Round with Checkpoints
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

// 4C. DELETE Round
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
// GUARD MANAGEMENT CRUD (NEW)
// ==========================================

// 1. GET all guards
app.get('/api/v1/guards', async (c) => {
  try {
    const supabase = getSupabase(c.env);
    const { data: guards, error } = await supabase
      .from('guards')
      .select('guard_id, full_name, employee_code, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json({ success: true, guards: guards || [] });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Failed to fetch guards' }, 500);
  }
});

// 2. POST create a new guard
app.post('/api/v1/guards', async (c) => {
  try {
    const body = await c.req.json();
    const { full_name, employee_code, password } = createGuardSchema.parse(body);
    const supabase = getSupabase(c.env);

    const { data: existing } = await supabase
      .from('guards')
      .select('guard_id')
      .eq('employee_code', employee_code.trim())
      .maybeSingle();

    if (existing) {
      return c.json({ success: false, message: 'A guard with this employee code already exists.' }, 400);
    }

    const { data: newGuard, error } = await supabase
      .from('guards')
      .insert([{
        full_name: full_name.trim(),
        employee_code: employee_code.trim(),
        password_hash: password,
        is_active: true,
      }])
      .select('guard_id, full_name, employee_code, is_active, created_at')
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

// 3. PATCH update guard status or password
app.patch('/api/v1/guards/:id', async (c) => {
  try {
    const guardId = c.req.param('id');
    const body = await c.req.json();
    const { full_name, password, is_active } = updateGuardSchema.parse(body);
    const supabase = getSupabase(c.env);

    const updates: Record<string, any> = {};
    if (full_name !== undefined) updates.full_name = full_name.trim();
    if (password !== undefined) updates.password_hash = password;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return c.json({ success: false, message: 'No fields provided to update.' }, 400);
    }

    const { data: updatedGuard, error } = await supabase
      .from('guards')
      .update(updates)
      .eq('guard_id', guardId)
      .select('guard_id, full_name, employee_code, is_active, created_at')
      .single();

    if (error) throw error;
    return c.json({ success: true, guard: updatedGuard });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: error.errors[0]?.message || 'Invalid format' }, 400);
    }
    return c.json({ success: false, message: error.message || 'Failed to update guard' }, 500);
  }
});

// ==========================================
// SPRINT 5: TICKETING & INCIDENT COMMAND
// ==========================================

// 1. POST a New Incident (Created by Guard Mobile App)
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
      finalPhotoUrl = `https://pub-e772f9cb2c7c4e53801177d8059805a8.r2.dev/${fileName}`; 
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

// 2. GET all Incidents (Admin Web Dashboard Feed)
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

// 3. GET single Incident + Threaded Updates
app.get('/api/v1/incidents/:id', async (c) => {
  try {
    const incidentId = c.req.param('id');
    const supabase = getSupabase(c.env);
    
    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .select('*')
      .eq('client_incident_id', incidentId)
      .single();
      
    if (incidentError) throw incidentError;

    const { data: updates, error: updatesError } = await supabase
      .from('incident_updates')
      .select('*')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true });

    if (updatesError) throw updatesError;
    return c.json({ success: true, incident, updates });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to fetch incident details' }, 500);
  }
});

// 4. POST an Update/Comment to an Incident Thread
app.post('/api/v1/incidents/:id/updates', async (c) => {
  try {
    const incidentId = c.req.param('id');
    const body = await c.req.json();
    const { sender_type, sender_name, message, photo_base64 } = body;
    
    let finalPhotoUrl = null;
    if (photo_base64 && photo_base64.startsWith('data:image')) {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
      const fileName = `incident_updates/${incidentId}_${Date.now()}.jpg`;
      
      await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
      finalPhotoUrl = `https://pub-e772f9cb2c7c4e53801177d8059805a8.r2.dev/${fileName}`; 
    }

    const supabase = getSupabase(c.env);
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

// 5. PATCH to Mark Incident as RESOLVED
app.patch('/api/v1/incidents/:id/resolve', async (c) => {
  try {
    const incidentId = c.req.param('id');
    const supabase = getSupabase(c.env);
    
    const { data, error } = await supabase
      .from('incidents')
      .update({ status: 'RESOLVED' })
      .eq('client_incident_id', incidentId)
      .select()
      .single();
      
    if (error) throw error;
    return c.json({ success: true, incident: data });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to resolve incident' }, 500);
  }
});

// ==========================================
// ADMIN WEB DASHBOARD: API CONFIGURATIONS
// ==========================================

// 1. Fetch current API keys
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

// 2. Save updated API keys
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

// --- HELPER: META WHATSAPP API ALERT ---
async function sendWhatsAppAlert(env: Bindings, incidentId: string, priority: string, description: string) {
  const supabase = getSupabase(env);
  
  const { data: configs, error } = await supabase
    .from('admin_configurations')
    .select('key_name, key_value')
    .in('key_name', ['WHATSAPP_API_TOKEN', 'MANAGER_PHONE', 'WHATSAPP_PHONE_ID']);

  if (error || !configs) {
    console.error("Failed to load WhatsApp configurations", error);
    return false;
  }

  const configMap = configs.reduce((acc: any, curr) => ({ ...acc, [curr.key_name]: curr.key_value }), {});
  const token = configMap['WHATSAPP_API_TOKEN'];
  const phoneId = configMap['WHATSAPP_PHONE_ID']; 
  const managerPhone = configMap['MANAGER_PHONE']; 

  if (!token || !managerPhone || !phoneId) {
    console.error("WhatsApp API Token, Phone ID, or Manager Phone is not configured.");
    return false;
  }

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("WhatsApp API Failed:", errorText);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error("WhatsApp Fetch Error:", err);
    return false;
  }
}

// --- HELPER: GOOGLE GMAIL API ALERT ---
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

// --- EXPORT ---
export default {
  fetch: async (request: Request, env: Bindings, ctx: ExecutionContext) => {
    return app.fetch(request, env, ctx)
  },
  
  // SPRINT 5 SLA CRON TRIGGER
  scheduled: async (event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) => {
    console.log("SLA Cron Trigger fired at:", event.cron);
    
    const supabase = getSupabase(env);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60000).toISOString();
    
    const { data: incidents, error } = await supabase
      .from('incidents')
      .select('*')
      .in('priority', ['P1', 'P2'])
      .eq('status', 'OPEN')
      .lte('reported_at', tenMinutesAgo);

    if (error || !incidents || incidents.length === 0) {
      console.log("No pending SLA breaches to escalate.");
      return;
    }

    for (const incident of incidents) {
      console.log(`Escalating Incident: ${incident.client_incident_id}`);
      
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