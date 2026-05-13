import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { generateShareImage } from './shareCard'

type Page = 'agenda' | 'nueva'
type AppointmentStatus = 'Pendiente' | 'Confirmada' | 'Completada' | 'Cancelada'

type Appointment = {
  id: number
  client: string
  phone: string
  service: string
  artist: string
  date: string
  time: string
  duration: number
  price: number
  status: AppointmentStatus
  color: string
  notes: string
  beforePhotoUrl: string
  afterPhotoUrl: string
  createdAt: string
}

type TodayStats = {
  todayCount: number
  confirmedCount: number
  revenue: number
}

type AppointmentInput = {
  client: string
  phone: string
  service: string
  artist: string
  date: string
  time: string
  duration: number
  price: number
  status: AppointmentStatus
  color: string
  notes: string
  beforePhoto: File | null
  afterPhoto: File | null
}

type AuthUser = {
  userId?: number
  id?: number
  name: string
  email: string
  role: string
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const API_BASE = import.meta.env.VITE_API_URL || ''

const TIME_SLOTS: string[] = []
for (let h = 9; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 20) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

const getToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const getRoundedTime = () => {
  const now = new Date()
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15)
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

const formatDateLabel = (value: string) => {
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
}

const formatTime12 = (value: string) => {
  const [hourRaw, minuteRaw] = value.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw || '0')

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return value
  }

  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

const defaultForm = (): AppointmentInput => ({
  client: '',
  phone: '',
  service: '',
  artist: '',
  date: getToday(),
  time: getRoundedTime(),
  duration: 90,
  price: 0,
  status: 'Pendiente',
  color: '#c9879d',
  notes: '',
  beforePhoto: null,
  afterPhoto: null,
})

const buildUrl = (path: string) => `${API_BASE}${path}`
const authH = (tok: string) => ({ Authorization: `Bearer ${tok}` })

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="password-toggle-icon">
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="password-toggle-icon">
      <path d="M2 12s3.6-6 10-6c2.1 0 3.9.6 5.4 1.5" />
      <path d="M22 12s-3.6 6-10 6c-2.1 0-3.9-.6-5.4-1.5" />
      <path d="M4 4l16 16" />
      <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" />
    </svg>
  )
}

function LoginPage({ onLogin }: { onLogin: (token: string, user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [recoverEmail, setRecoverEmail] = useState('')
  const [recoverToken, setRecoverToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [recoverStep, setRecoverStep] = useState<'request' | 'reset'>('request')
  const [recoverMessage, setRecoverMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const resetFeedback = () => {
    setError('')
    setSuccess('')
  }

  const submitLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      setLoading(true)
      resetFeedback()
      const res = await fetch(buildUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      if (!res.ok) throw new Error('Correo o contrasena incorrectos')
      const data = (await res.json()) as { token: string; user: AuthUser }
      localStorage.setItem('agenda-token', data.token)
      onLogin(data.token, data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticacion')
    } finally {
      setLoading(false)
    }
  }

  const submitRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      setLoading(true)
      resetFeedback()
      const res = await fetch(buildUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'No se pudo crear la cuenta')
      }
      const data = (await res.json()) as { token: string; user: AuthUser }
      localStorage.setItem('agenda-token', data.token)
      onLogin(data.token, data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear cuenta')
    } finally {
      setLoading(false)
    }
  }

  const submitRecoverRequest = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      setLoading(true)
      resetFeedback()
      const res = await fetch(buildUrl('/api/auth/forgot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoverEmail.trim().toLowerCase() }),
      })
      if (!res.ok) throw new Error('No se pudo generar el codigo de recuperacion')
      const data = (await res.json()) as { message?: string; resetToken?: string }
      setRecoverStep('reset')
      setRecoverMessage(data.message || 'Revisa el codigo de recuperacion.')
      if (data.resetToken) {
        setRecoverToken(data.resetToken)
      }
      setSuccess('Codigo generado. Continúa con el restablecimiento.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al recuperar cuenta')
    } finally {
      setLoading(false)
    }
  }

  const submitRecoverReset = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    try {
      setLoading(true)
      resetFeedback()
      const res = await fetch(buildUrl('/api/auth/reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: recoverToken.trim(), password: newPassword }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'No se pudo restablecer la contrasena')
      }
      setSuccess('Contrasena actualizada. Ahora puedes iniciar sesion.')
      setMode('login')
      setEmail(recoverEmail.trim().toLowerCase())
      setPassword('')
      setRecoverToken('')
      setNewPassword('')
      setRecoverMessage('')
      setRecoverStep('request')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al restablecer contrasena')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next: 'login' | 'register' | 'recover') => {
    setMode(next)
    resetFeedback()
  }

  return (
    <div className="login-page">
      <div className="login-brand" aria-hidden="true">
        <img src="/logo.svg" alt="María Paulina" className="login-logo" />
      </div>
      <main className="auth-card">
        <div className="auth-tabs">
          <button type="button" className={`auth-tab${mode === 'login' ? ' auth-tab-active' : ''}`} onClick={() => switchMode('login')}>
            Entrar
          </button>
          <button type="button" className={`auth-tab${mode === 'register' ? ' auth-tab-active' : ''}`} onClick={() => switchMode('register')}>
            Crear cuenta
          </button>
          <button type="button" className={`auth-tab${mode === 'recover' ? ' auth-tab-active' : ''}`} onClick={() => switchMode('recover')}>
            Recuperar
          </button>
        </div>

        <p className="login-sub">
          {mode === 'login' ? 'Inicia sesion para continuar' : mode === 'register' ? 'Crea tu cuenta en segundos' : 'Recupera tu acceso'}
        </p>
        {error && <p className="error-banner">{error}</p>}
        {success && <p className="success-banner">{success}</p>}

        {mode === 'login' ? (
          <form onSubmit={submitLogin}>
            <label>
              Correo
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </label>
            <label>
              Contrasena
              <div className="password-field">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowLoginPassword(v => !v)}
                  aria-label={showLoginPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showLoginPassword ? <EyeOffIcon /> : <EyeIcon />}
                  <span className="sr-only">{showLoginPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}</span>
                </button>
              </div>
            </label>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        ) : null}

        {mode === 'register' ? (
          <form onSubmit={submitRegister}>
            <label>
              Nombre
              <input type="text" value={name} onChange={e => setName(e.target.value)} required minLength={2} />
            </label>
            <label>
              Correo
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </label>
            <label>
              Contrasena
              <div className="password-field">
                <input
                  type={showRegisterPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowRegisterPassword(v => !v)}
                  aria-label={showRegisterPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showRegisterPassword ? <EyeOffIcon /> : <EyeIcon />}
                  <span className="sr-only">{showRegisterPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}</span>
                </button>
              </div>
            </label>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creando...' : 'Crear cuenta'}
            </button>
          </form>
        ) : null}

        {mode === 'recover' ? (
          <>
            {recoverStep === 'request' ? (
              <form onSubmit={submitRecoverRequest}>
                <label>
                  Correo de la cuenta
                  <input
                    type="email"
                    value={recoverEmail}
                    onChange={e => setRecoverEmail(e.target.value)}
                    required
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Generando...' : 'Generar codigo'}
                </button>
              </form>
            ) : (
              <form onSubmit={submitRecoverReset}>
                {recoverMessage ? <p className="auth-note">{recoverMessage}</p> : null}
                <label>
                  Codigo de recuperacion
                  <input
                    type="text"
                    value={recoverToken}
                    onChange={e => setRecoverToken(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Nueva contrasena
                  <div className="password-field">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowResetPassword(v => !v)}
                      aria-label={showResetPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    >
                      {showResetPassword ? <EyeOffIcon /> : <EyeIcon />}
                      <span className="sr-only">{showResetPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}</span>
                    </button>
                  </div>
                </label>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Restableciendo...' : 'Restablecer contrasena'}
                </button>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    setRecoverStep('request')
                    setRecoverToken('')
                    setNewPassword('')
                  }}
                >
                  Generar otro codigo
                </button>
              </form>
            )}
          </>
        ) : null}
      </main>
    </div>
  )
}

function AgendaPage({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [date, setDate] = useState(getToday())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [stats, setStats] = useState<TodayStats>({ todayCount: 0, confirmedCount: 0, revenue: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [uploadBefore, setUploadBefore] = useState<File | null>(null)
  const [uploadAfter, setUploadAfter] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editDraft, setEditDraft] = useState<{
    client: string
    phone: string
    service: string
    artist: string
    date: string
    time: string
    duration: number
    price: number
    status: AppointmentStatus
    color: string
    notes: string
  } | null>(null)
  const [sharing, setSharing] = useState(false)
  const [sharePanel, setSharePanel] = useState<{
    appointmentId: number
    fileName: string
    blob: Blob
    title: string
  } | null>(null)
  const [isCompactMobile, setIsCompactMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  )

  const revenueLabel = useMemo(
    () =>
      new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0,
      }).format(stats.revenue),
    [stats.revenue],
  )

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  useEffect(() => {
    const onResize = () => setIsCompactMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  async function load() {
    try {
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ date })
      const [aRes, sRes] = await Promise.all([
        fetch(buildUrl(`/api/appointments?${params.toString()}`), { headers: authH(token) }),
        fetch(buildUrl('/api/stats/today'), { headers: authH(token) }),
      ])
      if (!aRes.ok || !sRes.ok) throw new Error('No se pudieron cargar los datos')
      setAppointments((await aRes.json()) as Appointment[])
      setStats((await sRes.json()) as TodayStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  const uploadPhotos = async (id: number) => {
    if (!uploadBefore && !uploadAfter) return
    try {
      setUploading(true)
      const fd = new FormData()
      if (uploadBefore) fd.set('beforePhoto', uploadBefore)
      if (uploadAfter) fd.set('afterPhoto', uploadAfter)
      const res = await fetch(buildUrl(`/api/appointments/${id}/photos`), {
        method: 'PATCH',
        headers: authH(token),
        body: fd,
      })
      if (!res.ok) throw new Error('No se pudieron subir las fotos')
      setUploadBefore(null)
      setUploadAfter(null)
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir fotos')
    } finally {
      setUploading(false)
    }
  }

  const markDone = async (id: number) => {
    await fetch(buildUrl(`/api/appointments/${id}/status`), {
      method: 'PATCH',
      headers: { ...authH(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Completada' }),
    })
    void load()
  }

  const startEdit = (apt: Appointment) => {
    setEditingId(apt.id)
    setEditDraft({
      client: apt.client,
      phone: apt.phone,
      service: apt.service,
      artist: apt.artist,
      date: apt.date,
      time: apt.time,
      duration: apt.duration,
      price: apt.price,
      status: apt.status,
      color: apt.color,
      notes: apt.notes,
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft(null)
  }

  const saveEdit = async (id: number) => {
    if (!editDraft) return
    try {
      setSavingEdit(true)
      const res = await fetch(buildUrl(`/api/appointments/${id}`), {
        method: 'PATCH',
        headers: { ...authH(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      })
      if (!res.ok) throw new Error('No se pudo actualizar la cita')
      cancelEdit()
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la cita')
    } finally {
      setSavingEdit(false)
    }
  }

  const remove = async (id: number) => {
    await fetch(buildUrl(`/api/appointments/${id}`), { method: 'DELETE', headers: authH(token) })
    void load()
  }

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  const openShareLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const shareImageNative = async (blob: Blob, fileName: string, title: string) => {
    if (!navigator.share) return false
    const file = new File([blob], fileName, { type: 'image/png' })
    if (!navigator.canShare?.({ files: [file] })) return false
    await navigator.share({
      files: [file],
      title,
    })
    return true
  }

  const copyImageToClipboard = async (blob: Blob) => {
    if (!('ClipboardItem' in window) || !navigator.clipboard?.write) return false
    const item = new ClipboardItem({ 'image/png': blob })
    await navigator.clipboard.write([item])
    return true
  }

  const shareApt = async (apt: Appointment) => {
    setSharing(true)
    try {
      const blob = await generateShareImage(apt)
      const file = new File([blob], `cita-${apt.client.replace(/\s+/g, '-')}.png`, { type: 'image/png' })

      const shared = await shareImageNative(blob, file.name, `Cita · ${apt.client}`)
      if (shared) return

      setSharePanel({ appointmentId: apt.id, fileName: file.name, blob, title: `Cita · ${apt.client}` })
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Error al compartir:', err)
      }
    } finally {
      setSharing(false)
    }
  }

  const toMinutes = (value: string) => {
    const [hh, mm] = value.split(':').map(Number)
    return hh * 60 + mm
  }

  const slotPlan = useMemo(() => {
    const map = new Map<string, { appointment: Appointment; isStart: boolean }>()
    const sorted = [...appointments].sort((a, b) => toMinutes(a.time) - toMinutes(b.time))

    for (const appointment of sorted) {
      const start = toMinutes(appointment.time)
      const end = start + Math.max(appointment.duration || 30, 30)
      let started = false

      for (const slot of TIME_SLOTS) {
        const slotMin = toMinutes(slot)
        if (slotMin < start || slotMin >= end) {
          continue
        }

        // Keep first appointment if two overlap at the same time block.
        if (map.has(slot)) {
          continue
        }

        map.set(slot, { appointment, isStart: !started })
        started = true
      }
    }

    return map
  }, [appointments])

  const resolvePhoto = (v: string) => (v.startsWith('http') ? v : `${API_BASE}${v}`)

  const shiftDate = (delta: number) => {
    const d = new Date(date + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setDate(d.toISOString().slice(0, 10))
  }

  const renderAppointmentDetail = (apt: Appointment) => (
    <div className="detail-box">
      {editingId === apt.id && editDraft ? (
        <div className="edit-grid" onClick={e => e.stopPropagation()}>
          <label>
            Cliente
            <input
              type="text"
              value={editDraft.client}
              onChange={e => setEditDraft(c => (c ? { ...c, client: e.target.value } : c))}
            />
          </label>
          <label>
            Telefono
            <input
              type="tel"
              value={editDraft.phone}
              onChange={e => setEditDraft(c => (c ? { ...c, phone: e.target.value } : c))}
            />
          </label>
          <label>
            Servicio
            <input
              type="text"
              value={editDraft.service}
              onChange={e => setEditDraft(c => (c ? { ...c, service: e.target.value } : c))}
            />
          </label>
          <label>
            Artista
            <input
              type="text"
              value={editDraft.artist}
              onChange={e => setEditDraft(c => (c ? { ...c, artist: e.target.value } : c))}
            />
          </label>
          <label>
            Fecha
            <input
              type="date"
              value={editDraft.date}
              onChange={e => setEditDraft(c => (c ? { ...c, date: e.target.value } : c))}
            />
          </label>
          <label>
            Hora
            <input
              type="time"
              value={editDraft.time}
              onChange={e => setEditDraft(c => (c ? { ...c, time: e.target.value } : c))}
            />
          </label>
          <label>
            Duracion (min)
            <input
              type="number"
              min={15}
              max={300}
              step={15}
              value={editDraft.duration}
              onChange={e => setEditDraft(c => (c ? { ...c, duration: Number(e.target.value) } : c))}
            />
          </label>
          <label>
            Precio
            <input
              type="number"
              min={0}
              value={editDraft.price}
              onChange={e => setEditDraft(c => (c ? { ...c, price: Number(e.target.value) } : c))}
            />
          </label>
          <label>
            Estado
            <select
              value={editDraft.status}
              onChange={e => setEditDraft(c => (c ? { ...c, status: e.target.value as AppointmentStatus } : c))}
            >
              <option value="Pendiente">Pendiente</option>
              <option value="Confirmada">Confirmada</option>
              <option value="Completada">Completada</option>
              <option value="Cancelada">Cancelada</option>
            </select>
          </label>
          <label className="edit-grid-full">
            Notas
            <textarea
              rows={3}
              value={editDraft.notes}
              onChange={e => setEditDraft(c => (c ? { ...c, notes: e.target.value } : c))}
            />
          </label>
          <div className="detail-actions">
            <button
              type="button"
              className="btn-share"
              disabled={savingEdit}
              onClick={e => {
                e.stopPropagation()
                void saveEdit(apt.id)
              }}
            >
              {savingEdit ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              className="btn-delete"
              onClick={e => {
                e.stopPropagation()
                cancelEdit()
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p>
            <strong>Cliente:</strong> {apt.client}
            {apt.phone ? ` · ${apt.phone}` : ''}
          </p>
          <p>
            <strong>Servicio:</strong> {apt.service} · {apt.duration} min
          </p>
          {apt.artist && (
            <p>
              <strong>Artista:</strong> {apt.artist}
            </p>
          )}
          {apt.notes && (
            <p>
              <strong>Notas:</strong> {apt.notes}
            </p>
          )}
        </>
      )}
      {editingId !== apt.id ? (
      <>
      <div className="photo-grid">
        {apt.beforePhotoUrl ? (
          <a
            href={resolvePhoto(apt.beforePhotoUrl)}
            target="_blank"
            rel="noreferrer"
            className="photo-thumb"
          >
            <img src={resolvePhoto(apt.beforePhotoUrl)} alt="Antes" />
            <span>Antes</span>
          </a>
        ) : (
          <label className="photo-upload-slot" onClick={e => e.stopPropagation()}>
            <input
              type="file"
              accept="image/*"
              onChange={e => setUploadBefore(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            {uploadBefore ? (
              <img src={URL.createObjectURL(uploadBefore)} alt="Vista previa" />
            ) : (
              <span className="photo-placeholder">＋ Antes</span>
            )}
          </label>
        )}
        {apt.afterPhotoUrl ? (
          <a
            href={resolvePhoto(apt.afterPhotoUrl)}
            target="_blank"
            rel="noreferrer"
            className="photo-thumb"
          >
            <img src={resolvePhoto(apt.afterPhotoUrl)} alt="Despues" />
            <span>Despues</span>
          </a>
        ) : (
          <label className="photo-upload-slot" onClick={e => e.stopPropagation()}>
            <input
              type="file"
              accept="image/*"
              onChange={e => setUploadAfter(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            {uploadAfter ? (
              <img src={URL.createObjectURL(uploadAfter)} alt="Vista previa" />
            ) : (
              <span className="photo-placeholder">＋ Despues</span>
            )}
          </label>
        )}
      </div>
      {(uploadBefore || uploadAfter) && (
        <button
          type="button"
          className="btn-upload"
          disabled={uploading}
          onClick={e => {
            e.stopPropagation()
            void uploadPhotos(apt.id)
          }}
        >
          {uploading ? 'Subiendo...' : '↑ Guardar fotos'}
        </button>
      )}
      <div className="detail-actions">
        <button
          type="button"
          className="btn-share-option"
          onClick={e => {
            e.stopPropagation()
            startEdit(apt)
          }}
        >
          Editar
        </button>
        <button
          type="button"
          className="btn-share"
          disabled={sharing}
          onClick={e => {
            e.stopPropagation()
            void shareApt(apt)
          }}
        >
          {sharing ? '…' : '↑ Compartir'}
        </button>
        <button
          type="button"
          className="btn-done"
          onClick={e => {
            e.stopPropagation()
            void markDone(apt.id)
          }}
        >
          ✓ Completar
        </button>
        <button
          type="button"
          className="btn-delete"
          onClick={e => {
            e.stopPropagation()
            void remove(apt.id)
          }}
        >
          Eliminar
        </button>
      </div>
      {sharePanel?.appointmentId === apt.id ? (
        <div className="share-options" onClick={e => e.stopPropagation()}>
          <strong className="share-options-title">Opciones para compartir imagen</strong>
          <div className="share-options-grid">
            <button
              type="button"
              className="btn-share-option"
              onClick={() => {
                void (async () => {
                  const ok = await shareImageNative(sharePanel.blob, sharePanel.fileName, sharePanel.title)
                  if (!ok) downloadBlob(sharePanel.blob, sharePanel.fileName)
                })()
              }}
            >
              Compartir imagen (apps)
            </button>
            <button
              type="button"
              className="btn-share-option"
              onClick={() => {
                void (async () => {
                  await copyImageToClipboard(sharePanel.blob)
                })()
              }}
            >
              Copiar imagen
            </button>
            <button
              type="button"
              className="btn-share-option"
              onClick={() => {
                const url = URL.createObjectURL(sharePanel.blob)
                openShareLink(url)
                setTimeout(() => URL.revokeObjectURL(url), 10000)
              }}
            >
              Abrir imagen
            </button>
            <button
              type="button"
              className="btn-share-option"
              onClick={() => {
                downloadBlob(sharePanel.blob, sharePanel.fileName)
              }}
            >
              Descargar imagen
            </button>
          </div>
          <button
            type="button"
            className="btn-share-close"
            onClick={() => setSharePanel(null)}
          >
            Cerrar
          </button>
        </div>
      ) : null}
      </>
      ) : null}
    </div>
  )

  return (
    <div className="page-content">
      <header className="agenda-header">
        <div className="header-brand">
          <img src="/logo.svg" alt="MP" className="header-logo" />
          <div className="header-brand-text">
            <span className="header-name">María Paulina</span>
            <span className="header-tagline">Lashista · Lifting de Pestañas</span>
          </div>
        </div>
        <button type="button" className="btn-logout" onClick={onLogout} aria-label="Cerrar sesion">
          ↩
        </button>
      </header>

      <div className="stats-strip">
        <div className="stat-chip">
          <span>Citas hoy</span>
          <strong>{stats.todayCount}</strong>
        </div>
        <div className="stat-chip">
          <span>Confirmadas</span>
          <strong>{stats.confirmedCount}</strong>
        </div>
        <div className="stat-chip">
          <span>Ingresos</span>
          <strong>{revenueLabel}</strong>
        </div>
      </div>

      <div className="date-row">
        <button type="button" className="date-nav" onClick={() => shiftDate(-1)}>‹</button>
        <label className="date-label">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="date-input-hidden"
          />
          <span>{formatDateLabel(date)}</span>
        </label>
        <button type="button" className="date-nav" onClick={() => shiftDate(1)}>›</button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {!isCompactMobile ? (
      <div className="schedule-wrap">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th className="th-time">Horario</th>
              <th>Procedimiento</th>
              <th>Valor</th>
              <th className="th-icon">💳</th>
              <th className="th-icon">💵</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="td-empty">Cargando...</td>
              </tr>
            ) : (
              TIME_SLOTS.map(slot => {
                const slotInfo = slotPlan.get(slot)
                const apt = slotInfo?.appointment
                const isStart = slotInfo?.isStart ?? false
                const isExp = apt != null && expanded === apt.id
                return [
                  <tr
                    key={slot}
                    className={apt ? `tr-booked${isStart ? '' : ' tr-continued'}` : 'tr-free'}
                    onClick={() => {
                        if (!apt) return
                        setExpanded(isExp ? null : apt.id)
                        if (isExp) {
                          cancelEdit()
                        }
                        setUploadBefore(null)
                        setUploadAfter(null)
                      }}
                  >
                    <td className="td-client">{apt ? (isStart ? apt.client : '↳') : ''}</td>
                    <td className="td-time">{formatTime12(slot)}</td>
                    <td className={`td-service${apt && !isStart ? ' td-continued' : ''}`}>
                      {apt ? (isStart ? apt.service : `Continua (${apt.duration} min)`) : ''}
                    </td>
                    <td className="td-price">{apt?.price && isStart ? `$${apt.price}` : ''}</td>
                    <td className="td-dot">
                      <span
                        className="status-dot"
                        style={{
                          background:
                            apt?.status === 'Completada'
                              ? '#c9879d'
                              : apt?.status === 'Cancelada'
                              ? '#d4a0a0'
                              : '#e9c4cf',
                        }}
                      />
                    </td>
                    <td className="td-dot">
                      <span
                        className="status-dot"
                        style={{
                          background: apt?.price && apt.price > 0 ? '#c9879d' : '#e9c4cf',
                        }}
                      />
                    </td>
                  </tr>,
                  isExp && apt && isStart ? (
                    <tr key={`${slot}-detail`} className="tr-detail">
                      <td colSpan={6}>
                        {renderAppointmentDetail(apt)}
                      </td>
                    </tr>
                  ) : null,
                ]
              })
            )}
          </tbody>
        </table>
      </div>
      ) : null}

      {isCompactMobile ? (
      <div className="schedule-mobile">
        {loading ? (
          <p className="td-empty">Cargando...</p>
        ) : (
          TIME_SLOTS.map(slot => {
            const slotInfo = slotPlan.get(slot)
            const apt = slotInfo?.appointment
            const isStart = slotInfo?.isStart ?? false
            const isExp = apt != null && expanded === apt.id

            return (
              <article
                key={`mobile-${slot}`}
                className={`slot-card${apt ? ' slot-card-booked' : ''}${apt && !isStart ? ' slot-card-continued' : ''}`}
                onClick={() => {
                  if (!apt || !isStart) return
                  setExpanded(isExp ? null : apt.id)
                  if (isExp) {
                    cancelEdit()
                  }
                  setUploadBefore(null)
                  setUploadAfter(null)
                }}
              >
                <div className="slot-card-head">
                  <strong className="slot-time">{formatTime12(slot)}</strong>
                  {apt && isStart ? <span className="slot-price">${apt.price || 0}</span> : null}
                </div>

                {!apt ? <p className="slot-free">Disponible</p> : null}

                {apt && isStart ? (
                  <>
                    <p className="slot-main">{apt.client}</p>
                    <p className="slot-sub">{apt.service} · {apt.duration} min</p>
                    <div className="slot-dots" aria-hidden="true">
                      <span className="status-dot" style={{ background: apt.status === 'Completada' ? '#c9879d' : '#e9c4cf' }} />
                      <span className="status-dot" style={{ background: apt.price && apt.price > 0 ? '#c9879d' : '#e9c4cf' }} />
                    </div>
                    {isExp ? renderAppointmentDetail(apt) : null}
                  </>
                ) : null}

                {apt && !isStart ? <p className="slot-sub">Continua · {apt.client}</p> : null}
              </article>
            )
          })
        )}
      </div>
      ) : null}
    </div>
  )
}

function NewAppointmentPage({ token, onSaved }: { token: string; onSaved: () => void }) {
  const [form, setForm] = useState<AppointmentInput>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const set = <K extends keyof AppointmentInput>(key: K, value: AppointmentInput[K]) =>
    setForm(c => ({ ...c, [key]: value }))

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.service.trim()) {
      setError('Escribe el procedimiento')
      return
    }
    try {
      setSaving(true)
      setError('')
      setSuccess(false)

      const fd = new FormData()
      fd.set('client', form.client)
      fd.set('phone', form.phone)
      fd.set('service', form.service.trim())
      fd.set('artist', form.artist)
      fd.set('date', form.date)
      fd.set('time', form.time)
      fd.set('duration', String(form.duration))
      fd.set('price', String(form.price || 0))
      fd.set('status', form.status)
      fd.set('color', form.color)
      fd.set('notes', form.notes)

      const res = await fetch(buildUrl('/api/appointments'), {
        method: 'POST',
        headers: authH(token),
        body: fd,
      })
      if (!res.ok) throw new Error('No se pudo guardar la cita')

      setForm(defaultForm())
      setSuccess(true)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-content">
      <header className="form-header">
        <h1 className="agenda-title">Nueva Cita</h1>
      </header>

      {error && <p className="error-banner">{error}</p>}
      {success && <p className="success-banner">Cita guardada correctamente</p>}

      <form className="new-form" onSubmit={submit}>
        <div className="form-section">
          <h2 className="section-title">Cliente</h2>
          <label>
            Nombre *
            <input
              type="text"
              required
              value={form.client}
              onChange={e => set('client', e.target.value)}
              placeholder="Sofia Luna"
            />
          </label>
          <label>
            Telefono
            <input
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="555 123 4567"
            />
          </label>
        </div>

        <div className="form-section">
          <h2 className="section-title">Servicio</h2>
          <label>
            Procedimiento *
            <input
              type="text"
              required
              value={form.service}
              onChange={e => set('service', e.target.value)}
              placeholder="Ej: Hibridas, Volumen wispy, Lifting"
            />
          </label>
          <div className="field-row-2">
            <label>
              Duracion (min)
              <input
                type="number"
                min={15}
                max={300}
                step={15}
                value={form.duration}
                onChange={e => set('duration', Number(e.target.value))}
              />
            </label>
            <label>
              Precio
              <input
                type="number"
                min={0}
                step={1}
                value={form.price}
                onChange={e => set('price', Number(e.target.value))}
                placeholder="850"
              />
            </label>
          </div>
        </div>

        <div className="form-section">
          <h2 className="section-title">Fecha y hora</h2>
          <div className="field-row-2">
            <label>
              Fecha *
              <input
                type="date"
                required
                value={form.date}
                onChange={e => set('date', e.target.value)}
              />
            </label>
            <label>
              Hora *
              <input
                type="time"
                required
                value={form.time}
                onChange={e => set('time', e.target.value)}
              />
            </label>
          </div>

        </div>

        <div className="form-section">
          <h2 className="section-title">Notas</h2>
          <label>
            Notas
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Alergias, preferencias de estilo..."
            />
          </label>
        </div>

        <button type="submit" className="btn-primary btn-full" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cita'}
        </button>
      </form>
    </div>
  )
}

function InstallPrompt({ inApp }: { inApp: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (typeof navigator !== 'undefined' && 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))

  const ua = navigator.userAgent.toLowerCase()
  const isIos = /iphone|ipad|ipod/.test(ua)
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua)
  const showIosHint = !isStandalone && isIos && isSafari && !deferredPrompt

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => {
      setDeferredPrompt(null)
      setDismissed(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  if (isStandalone || dismissed || (!deferredPrompt && !showIosHint)) {
    return null
  }

  const className = inApp ? 'install-banner install-banner-in-app' : 'install-banner'

  return (
    <aside className={className} role="status" aria-live="polite">
      <div className="install-banner-text">
        <strong>Instala esta app</strong>
        <p>
          {showIosHint
            ? 'En iPhone: toca Compartir y luego Agregar a pantalla de inicio.'
            : 'Instala la app para abrirla rapido desde tu pantalla principal.'}
        </p>
      </div>
      <div className="install-banner-actions">
        {deferredPrompt ? (
          <button
            type="button"
            className="install-btn"
            onClick={() => {
              void (async () => {
                await deferredPrompt.prompt()
                await deferredPrompt.userChoice
                setDeferredPrompt(null)
              })()
            }}
          >
            Instalar
          </button>
        ) : null}
        <button type="button" className="install-close" onClick={() => setDismissed(true)}>
          Ahora no
        </button>
      </div>
    </aside>
  )
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('agenda-token') || '')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [page, setPage] = useState<Page>('agenda')

  useEffect(() => {
    if (!token) return
    fetch(buildUrl('/api/auth/me'), { headers: authH(token) })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { user: AuthUser }) => setUser(d.user))
      .catch(() => {
        localStorage.removeItem('agenda-token')
        setToken('')
      })
  }, [token])

  const handleLogin = (t: string, u: AuthUser) => {
    setToken(t)
    setUser(u)
    setPage('agenda')
  }

  const handleLogout = () => {
    localStorage.removeItem('agenda-token')
    setToken('')
    setUser(null)
  }

  if (!token || !user) {
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <InstallPrompt inApp={false} />
      </>
    )
  }

  return (
    <>
      <div className="shell">
        <div className="shell-body">
          {page === 'agenda' ? (
            <AgendaPage token={token} onLogout={handleLogout} />
          ) : (
            <NewAppointmentPage token={token} onSaved={() => setPage('agenda')} />
          )}
        </div>

        <nav className="bottom-nav">
          <button
            type="button"
            className={`nav-btn${page === 'agenda' ? ' nav-btn-active' : ''}`}
            onClick={() => setPage('agenda')}
          >
            <span className="nav-icon">📅</span>
            <span>Agenda</span>
          </button>
          <button
            type="button"
            className={`nav-btn${page === 'nueva' ? ' nav-btn-active' : ''}`}
            onClick={() => setPage('nueva')}
          >
            <span className="nav-icon">✚</span>
            <span>Nueva cita</span>
          </button>
        </nav>
      </div>
      <InstallPrompt inApp={true} />
    </>
  )
}

export default App
