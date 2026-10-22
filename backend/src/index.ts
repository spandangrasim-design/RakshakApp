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
  R2_BUCKET: R2Bucket // ADDED: Sprint 4 Cloudflare R2 Storage
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
  client_scan_id: z.string(), // ADDED: Sprint 4 Idempotency UUID
  checkpoint_id: z.string(),
  qr_lat: z.string(),
  qr_lng: z.string(),
  signature: z.string(),
  guard_lat: z.number(),
  guard_lng: z.number(),
  uptime_seconds: z.number().optional(), 
  photo_url: z.string().optional()
})

// --- ROUTES ---

// 1. Auth Login Route
app.post('/api/v1/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const { employee_code, password, device_id } = loginSchema.parse(body)

    const supabase = createClient(
      c.env.SUPABASE_URL,
      c.env.SUPABASE_SERVICE_ROLE_KEY,
      { 
        auth: { persistSession: false },
        global: { fetch: (...args) => fetch(...args) } 
      }
    )

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
    const access_token = await sign(payload, c.env.JWT_SECRET)

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

// Helper to initialize Supabase admin client
const getSupabase = (env: Bindings) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { fetch: (...args) => fetch(...args) }
  });

// 4. ROUNDS & CHECKPOINTS CRUD API

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
      .select('*');

    if (cpError) {
      return c.json({ success: false, message: cpError.message }, 500);
    }

    const roundsWithCheckpoints = (rounds || []).map((round) => ({
      ...round,
      checkpoints: (checkpoints || []).filter((cp) => cp.round_id === round.id)
    }));

    return c.json({ success: true, rounds: roundsWithCheckpoints });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Server error' }, 500);
  }
});

// 4B. POST Create or Update Round with Checkpoints
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
});

app.post('/api/v1/rounds', async (c) => {
  try {
    const body = await c.req.json();
    const { id, name, checkpoints } = roundSaveSchema.parse(body);
    const supabase = getSupabase(c.env);

    let activeRoundId = id;

    if (activeRoundId) {
      // Update existing round name
      const { error: updateError } = await supabase
        .from('rounds')
        .update({ name })
        .eq('id', activeRoundId);

      if (updateError) return c.json({ success: false, message: updateError.message }, 500);

      // Delete old checkpoints to replace with current set
      await supabase.from('checkpoints').delete().eq('round_id', activeRoundId);
    } else {
      // Insert new round
      const { data: newRound, error: insertError } = await supabase
        .from('rounds')
        .insert([{ name }])
        .select()
        .single();

      if (insertError) return c.json({ success: false, message: insertError.message }, 500);
      activeRoundId = newRound.id;
    }

    // Insert checkpoints for this round
    if (checkpoints.length > 0) {
      const rows = checkpoints.map((cp) => ({
        id: cp.id,
        round_id: activeRoundId,
        name: cp.name,
        lat: cp.lat,
        lng: cp.lng
      }));

      const { error: cpInsertError } = await supabase.from('checkpoints').insert(rows);
      if (cpInsertError) return c.json({ success: false, message: cpInsertError.message }, 500);
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
      payload = await verify(token, c.env.JWT_SECRET);
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

    const supabase = createClient(
      c.env.SUPABASE_URL,
      c.env.SUPABASE_SERVICE_ROLE_KEY,
      { 
        auth: { persistSession: false },
        global: { fetch: (...args) => fetch(...args) } 
      }
    );

    const { data, error } = await supabase.rpc('log_patrol_scan', {
      p_client_scan_id: client_scan_id, // ADDED
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

// 3. NEW Sprint 4: Auto-Sync Engine (Bulk Offline Upload)
app.post('/api/v1/patrols/sync', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ success: false, message: 'Unauthorized' }, 401);
    
    const token = authHeader.split(' ')[1];
    const payload = await verify(token, c.env.JWT_SECRET);
    const guard_id = payload.sub as string;

    const body = await c.req.json();
    const scans = body.scans; // Array of offline scans from SQLite
    const results = [];

    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

    for (const scan of scans) {
      // 3A. Verify Signature
      const dataToSign = `${scan.checkpoint_id}|${scan.qr_lat}|${scan.qr_lng}`;
      const expectedSignature = CryptoJS.HmacSHA256(dataToSign, c.env.QR_SECRET).toString(CryptoJS.enc.Hex);
      
      if (scan.signature !== expectedSignature) {
        results.push({ client_scan_id: scan.client_scan_id, status: 'failed', reason: 'Invalid Signature' });
        continue;
      }

      // 3B. Upload Photo to Cloudflare R2
      let photoUrl = 'https://pub-e772f9cb2c7c4e53801177d8059805a8.r2.dev';
      if (scan.photo_url && scan.photo_url.startsWith('data:image')) {
        const base64Data = scan.photo_url.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(base64Data), char => char.charCodeAt(0));
        const fileName = `scans/${scan.client_scan_id}.jpg`;
        
        await c.env.R2_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        // NOTE: Replace with your actual public R2 dev URL before going to production
        photoUrl = `https://pub-e772f9cb2c7c4e53801177d8059805a8.r2.dev/${fileName}`; 
      }

      // 3C. Idempotent DB Insert
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

// --- EXPORT ---
export default {
  fetch: async (request: Request, env: Bindings, ctx: ExecutionContext) => {
    return app.fetch(request, env, ctx)
  }
}