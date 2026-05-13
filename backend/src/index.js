import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import cors from 'cors'
import express from 'express'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { Pool } from 'pg'
import { z } from 'zod'

const app = express()
const port = Number(process.env.PORT || 4000)

const jwtSecret = process.env.JWT_SECRET || 'change-this-secret-in-production'
const databaseUrl = process.env.DATABASE_URL
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseBucket = process.env.SUPABASE_BUCKET || 'appointment-photos'

if (!databaseUrl) {
  throw new Error('Falta DATABASE_URL en variables de entorno')
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en variables de entorno')
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
})

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

app.use(cors({ origin: true }))
app.use(express.json())

const statusValues = ['Pendiente', 'Confirmada', 'Completada', 'Cancelada']

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(6),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(6),
})

const appointmentSchema = z.object({
  client: z.string().trim().min(2),
  phone: z.string().trim().optional().default(''),
  service: z.string().trim().min(2),
  artist: z.string().trim().optional().default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().int().min(15).max(300),
  price: z.number().int().min(0).default(0),
  status: z.enum(statusValues).optional().default('Pendiente'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#c9879d'),
  notes: z.string().optional().default(''),
  beforePhoto: z.string().optional().default(''),
  afterPhoto: z.string().optional().default(''),
})

const statusSchema = z.object({
  status: z.enum(statusValues),
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 6 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.mimetype)
    cb(ok ? null : new Error('Formato de imagen no permitido'), ok)
  },
})

function getAuthToken(value) {
  if (!value) {
    return ''
  }

  const [scheme, token] = value.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return ''
  }

  return token
}

function requireAuth(req, res, next) {
  const token = getAuthToken(req.headers.authorization)
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  try {
    const payload = jwt.verify(token, jwtSecret)
    req.user = payload
    return next()
  } catch {
    return res.status(401).json({ error: 'Sesion invalida o expirada' })
  }
}

function buildToken(user) {
  return jwt.sign(
    {
      userId: Number(user.id),
      email: user.email,
      role: user.role,
      name: user.name,
    },
    jwtSecret,
    { expiresIn: '7d' },
  )
}

function createResetToken() {
  return crypto.randomBytes(24).toString('hex')
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function getToday() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function photoPathToUrl(photoPath) {
  if (!photoPath) {
    return ''
  }

  const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(photoPath)
  return data?.publicUrl || ''
}

function mapAppointment(row) {
  return {
    id: Number(row.id),
    client: row.client,
    phone: row.phone,
    service: row.service,
    artist: row.artist,
    date: row.date,
    time: row.time,
    duration: Number(row.duration),
    price: Number(row.price),
    status: row.status,
    color: row.color,
    notes: row.notes,
    beforePhotoUrl: photoPathToUrl(row.before_photo),
    afterPhotoUrl: photoPathToUrl(row.after_photo),
    createdAt: row.created_at,
  }
}

function extFromMime(mimeType) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

async function uploadPhotoToStorage(file, prefix) {
  const extension = extFromMime(file.mimetype)
  const filename = `${prefix}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`

  const { error } = await supabase.storage.from(supabaseBucket).upload(filename, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  })

  if (error) {
    throw new Error(`No se pudo subir foto: ${error.message}`)
  }

  return filename
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      client TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      service TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      date DATE NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      price INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#c9879d',
      notes TEXT NOT NULL DEFAULT '',
      before_photo TEXT NOT NULL DEFAULT '',
      after_photo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client)
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id)
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id)
  `)
}

async function cleanupLegacyData() {
  await pool.query(`
    DELETE FROM appointments
    WHERE user_id IS NULL
  `)
}

app.get('/api/health', async (_req, res) => {
  const dbHealth = await pool.query('SELECT 1 AS ok')
  res.json({ ok: true, db: dbHealth.rows[0]?.ok === 1 })
})

app.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos de registro invalidos' })
  }

  try {
    const data = parsed.data
    const email = data.email.toLowerCase()

    const existing = await pool.query(
      `
        SELECT id
        FROM users
        WHERE email = $1
      `,
      [email],
    )

    if (existing.rowCount) {
      return res.status(409).json({ error: 'El correo ya existe' })
    }

    const passwordHash = bcrypt.hashSync(data.password, 10)
    const result = await pool.query(
      `
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, 'owner')
        RETURNING id, name, email, role
      `,
      [data.name, email, passwordHash],
    )

    const user = result.rows[0]

    return res.status(201).json({
      token: buildToken(user),
      user: {
        id: Number(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: 'No se pudo registrar usuario' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Credenciales invalidas' })
  }

  try {
    const data = parsed.data
    const result = await pool.query(
      `
        SELECT id, name, email, password_hash, role
        FROM users
        WHERE email = $1
      `,
      [data.email.toLowerCase()],
    )

    if (!result.rowCount) {
      return res.status(401).json({ error: 'Correo o contrasena incorrectos' })
    }

    const user = result.rows[0]
    const isValidPassword = bcrypt.compareSync(data.password, user.password_hash)
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Correo o contrasena incorrectos' })
    }

    return res.json({
      token: buildToken(user),
      user: {
        id: Number(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch {
    return res.status(500).json({ error: 'No se pudo iniciar sesion' })
  }
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

app.post('/api/auth/forgot', async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Correo invalido' })
  }

  try {
    const email = parsed.data.email.toLowerCase()
    const userResult = await pool.query(
      `
        SELECT id
        FROM users
        WHERE email = $1
      `,
      [email],
    )

    if (!userResult.rowCount) {
      return res.json({
        message: 'Si el correo existe, se genero un codigo de recuperacion.',
      })
    }

    const userId = Number(userResult.rows[0].id)
    const resetToken = createResetToken()
    const tokenHash = hashResetToken(resetToken)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    await pool.query(
      `
        INSERT INTO password_resets (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `,
      [userId, tokenHash, expiresAt.toISOString()],
    )

    return res.json({
      message: 'Codigo de recuperacion generado. Expira en 30 minutos.',
      resetToken,
    })
  } catch {
    return res.status(500).json({ error: 'No se pudo iniciar recuperacion' })
  }
})

app.post('/api/auth/reset', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos invalidos para restablecer contrasena' })
  }

  try {
    const tokenHash = hashResetToken(parsed.data.token)
    const found = await pool.query(
      `
        SELECT id, user_id
        FROM password_resets
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `,
      [tokenHash],
    )

    if (!found.rowCount) {
      return res.status(400).json({ error: 'Codigo invalido o expirado' })
    }

    const resetId = Number(found.rows[0].id)
    const userId = Number(found.rows[0].user_id)
    const passwordHash = bcrypt.hashSync(parsed.data.password, 10)

    await pool.query(
      `
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
      `,
      [passwordHash, userId],
    )

    await pool.query(
      `
        UPDATE password_resets
        SET used_at = NOW()
        WHERE id = $1
      `,
      [resetId],
    )

    await pool.query(
      `
        DELETE FROM password_resets
        WHERE user_id = $1
          AND id <> $2
      `,
      [userId, resetId],
    )

    return res.json({ message: 'Contrasena actualizada correctamente' })
  } catch {
    return res.status(500).json({ error: 'No se pudo restablecer contrasena' })
  }
})

app.get('/api/appointments', requireAuth, async (req, res) => {
  const filters = []
  const params = []
  let index = 1
  const userId = Number(req.user?.userId)

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' })
  }

  filters.push(`user_id = $${index}`)
  params.push(userId)
  index += 1

  const date = typeof req.query.date === 'string' ? req.query.date : ''
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

  if (date) {
    filters.push(`date = $${index}`)
    params.push(date)
    index += 1
  }

  if (search) {
    filters.push(`LOWER(client) LIKE $${index}`)
    params.push(`%${search.toLowerCase()}%`)
    index += 1
  }

  let query = `
    SELECT id, client, phone, service, artist, date::text AS date, time, duration, price, status, color, notes, before_photo, after_photo, created_at
    FROM appointments
  `

  if (filters.length) {
    query += ` WHERE ${filters.join(' AND ')}`
  }

  query += ' ORDER BY date ASC, time ASC'

  try {
    const rows = await pool.query(query, params)
    return res.json(rows.rows.map(mapAppointment))
  } catch {
    return res.status(500).json({ error: 'No fue posible leer los datos del servidor' })
  }
})

app.post(
  '/api/appointments',
  requireAuth,
  upload.fields([
    { name: 'beforePhoto', maxCount: 1 },
    { name: 'afterPhoto', maxCount: 1 },
  ]),
  async (req, res) => {
    const userId = Number(req.user?.userId)
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: 'Sesion invalida o expirada' })
    }

    const payloadRaw = {
      client: req.body.client,
      phone: req.body.phone,
      service: req.body.service,
      artist: req.body.artist,
      date: req.body.date,
      time: req.body.time,
      duration: Number(req.body.duration),
      price: Number(req.body.price || 0),
      status: req.body.status,
      color: req.body.color,
      notes: req.body.notes,
      beforePhoto: '',
      afterPhoto: '',
    }

    const parsed = appointmentSchema.safeParse(payloadRaw)
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Datos invalidos para la cita',
        details: parsed.error.flatten(),
      })
    }

    try {
      const beforePhotoFile = req.files?.beforePhoto?.[0]
      const afterPhotoFile = req.files?.afterPhoto?.[0]

      const beforePhoto = beforePhotoFile
        ? await uploadPhotoToStorage(beforePhotoFile, 'before')
        : ''
      const afterPhoto = afterPhotoFile
        ? await uploadPhotoToStorage(afterPhotoFile, 'after')
        : ''

      const payload = { ...parsed.data, beforePhoto, afterPhoto }

      const created = await pool.query(
        `
          INSERT INTO appointments (user_id, client, phone, service, artist, date, time, duration, price, status, color, notes, before_photo, after_photo)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id, client, phone, service, artist, date::text AS date, time, duration, price, status, color, notes, before_photo, after_photo, created_at
        `,
        [
          userId,
          payload.client,
          payload.phone,
          payload.service,
          payload.artist,
          payload.date,
          payload.time,
          payload.duration,
          payload.price,
          payload.status,
          payload.color,
          payload.notes,
          payload.beforePhoto,
          payload.afterPhoto,
        ],
      )

      return res.status(201).json(mapAppointment(created.rows[0]))
    } catch (error) {
      return res.status(500).json({ error: 'No se pudo guardar la cita' })
    }
  },
)

app.patch(
  '/api/appointments/:id/photos',
  requireAuth,
  upload.fields([
    { name: 'beforePhoto', maxCount: 1 },
    { name: 'afterPhoto', maxCount: 1 },
  ]),
  async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Id invalido' })
    }

    const userId = Number(req.user?.userId)
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: 'Sesion invalida o expirada' })
    }

    try {
      const beforePhotoFile = req.files?.beforePhoto?.[0]
      const afterPhotoFile = req.files?.afterPhoto?.[0]
      if (!beforePhotoFile && !afterPhotoFile) {
        return res.status(400).json({ error: 'No se recibieron fotos' })
      }

      let beforePhotoPath = null
      let afterPhotoPath = null

      if (beforePhotoFile) {
        beforePhotoPath = await uploadPhotoToStorage(beforePhotoFile, 'before')
      }
      if (afterPhotoFile) {
        afterPhotoPath = await uploadPhotoToStorage(afterPhotoFile, 'after')
      }

      const updated = await pool.query(
        `
          UPDATE appointments
          SET before_photo = COALESCE($1, before_photo),
              after_photo = COALESCE($2, after_photo)
          WHERE id = $3
            AND user_id = $4
          RETURNING id, client, phone, service, artist, date::text AS date, time, duration, price, status, color, notes, before_photo, after_photo, created_at
        `,
        [beforePhotoPath, afterPhotoPath, id, userId],
      )

      if (!updated.rowCount) {
        return res.status(404).json({ error: 'Cita no encontrada' })
      }

      return res.json(mapAppointment(updated.rows[0]))
    } catch {
      return res.status(500).json({ error: 'No se pudieron actualizar las fotos' })
    }
  },
)

app.patch('/api/appointments/:id/status', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Id invalido' })
  }

  const userId = Number(req.user?.userId)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' })
  }

  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Estado invalido',
      details: parsed.error.flatten(),
    })
  }

  try {
    const updated = await pool.query(
      `
        UPDATE appointments
        SET status = $1
        WHERE id = $2
          AND user_id = $3
        RETURNING id, client, phone, service, artist, date::text AS date, time, duration, price, status, color, notes, before_photo, after_photo, created_at
      `,
      [parsed.data.status, id, userId],
    )

    if (!updated.rowCount) {
      return res.status(404).json({ error: 'Cita no encontrada' })
    }

    return res.json(mapAppointment(updated.rows[0]))
  } catch {
    return res.status(500).json({ error: 'No se pudo actualizar la cita' })
  }
})

app.delete('/api/appointments/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Id invalido' })
  }

  const userId = Number(req.user?.userId)
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' })
  }

  try {
    const deleted = await pool.query(
      `
        DELETE FROM appointments
        WHERE id = $1
          AND user_id = $2
        RETURNING before_photo, after_photo
      `,
      [id, userId],
    )

    if (!deleted.rowCount) {
      return res.status(404).json({ error: 'Cita no encontrada' })
    }

    const beforePhoto = deleted.rows[0].before_photo
    const afterPhoto = deleted.rows[0].after_photo
    const toDelete = [beforePhoto, afterPhoto].filter(Boolean)
    if (toDelete.length) {
      await supabase.storage.from(supabaseBucket).remove(toDelete)
    }

    return res.status(204).send()
  } catch {
    return res.status(500).json({ error: 'No se pudo eliminar la cita' })
  }
})

app.get('/api/stats/today', requireAuth, async (req, res) => {
  const today = getToday()
  const userId = Number(req.user?.userId)

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' })
  }

  try {
    const row = await pool.query(
      `
        SELECT
          COUNT(*) AS "todayCount",
          SUM(CASE WHEN status IN ('Confirmada', 'Completada') THEN 1 ELSE 0 END) AS "confirmedCount",
          COALESCE(SUM(price), 0) AS revenue
        FROM appointments
        WHERE date = $1
          AND user_id = $2
      `,
      [today, userId],
    )

    const data = row.rows[0] || {}

    return res.json({
      todayCount: Number(data.todayCount || 0),
      confirmedCount: Number(data.confirmedCount || 0),
      revenue: Number(data.revenue || 0),
    })
  } catch {
    return res.status(500).json({ error: 'No se pudieron calcular estadisticas' })
  }
})

async function startServer() {
  await initDatabase()
  await cleanupLegacyData()

  app.listen(port, () => {
    console.log(`Agenda API running on http://localhost:${port}`)
  })
}

startServer().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error)
  process.exit(1)
})
