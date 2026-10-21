import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sign } from 'hono/jwt'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  JWT_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/*', cors())

const loginSchema = z.object({
  employee_code: z.string().min(1),
  password: z.string().min(6),
  device_id: z.string().optional()
})

app.post('/api/v1/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const { employee_code, password, device_id } = loginSchema.parse(body)

    // FIX 1: Explicitly bind Cloudflare's native fetch to the Supabase client
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

    if (error || !guard) {
      return c.json({
        error_code: 'INVALID_CREDENTIALS',
        message: 'Invalid Employee Code or Password.'
      }, 401)
    }

    if (!guard.is_active) {
      return c.json({
        error_code: 'ACCOUNT_DISABLED',
        message: 'This account has been deactivated.'
      }, 403)
    }

    if (guard.password_hash !== password) {
      return c.json({
        error_code: 'INVALID_CREDENTIALS',
        message: 'Invalid Employee Code or Password.'
      }, 401)
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
      return c.json({
        error_code: 'BAD_REQUEST',
        message: 'Missing or invalid fields in request.'
      }, 400)
    }
    
    return c.json({
      error_code: 'SERVER_ERROR',
      message: 'An internal server error occurred.'
    }, 500)
  }
})

// FIX 2: Explicitly wrap the Cloudflare ES Module fetch handler to guarantee a Promise return
export default {
  fetch: async (request: Request, env: Bindings, ctx: ExecutionContext) => {
    return app.fetch(request, env, ctx)
  }
}