export type ShareApt = {
  client: string
  phone: string
  service: string
  date: string
  time: string
  duration: number
  price: number
  notes: string
}

function fmt12(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  const str = date.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 0 && ctx.measureText(t + '…').width > maxW) {
    t = t.slice(0, -1)
  }
  return t + '…'
}

export async function generateShareImage(apt: ShareApt): Promise<Blob> {
  await document.fonts.ready

  const W = 800
  const DPR = 2
  const PINK = '#c9879d'

  type Row = { label: string; value: string }

  const rows: Row[] = [
    { label: 'FECHA', value: fmtDate(apt.date) },
    { label: 'HORA', value: fmt12(apt.time) },
    { label: 'CLIENTE', value: apt.client + (apt.phone ? `  ·  ${apt.phone}` : '') },
    { label: 'SERVICIO', value: `${apt.service}  ·  ${apt.duration} min` },
    { label: 'VALOR', value: `$${apt.price}` },
  ]
  if (apt.notes) rows.push({ label: 'NOTAS', value: apt.notes })

  const HEADER_H = 220
  const ROW_H = 78
  const POLICIES_H = 270
  const FOOTER_H = 90
  const H = HEADER_H + rows.length * ROW_H + POLICIES_H + FOOTER_H

  const canvas = document.createElement('canvas')
  canvas.width = W * DPR
  canvas.height = H * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  // ── Background ──────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#fef9fb')
  bg.addColorStop(1, '#f5f1ee')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // ── MP watermark ─────────────────────────────────────────────
  ctx.save()
  ctx.font = '500px Georgia, serif'
  ctx.fillStyle = 'rgba(201,135,157,0.07)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('MP', W / 2, H / 2 - 20)
  ctx.restore()

  // ── Top pink bar ─────────────────────────────────────────────
  ctx.fillStyle = PINK
  ctx.fillRect(0, 0, W, 10)

  // ── "María Paulina" ──────────────────────────────────────────
  ctx.font = '700 74px "Dancing Script", cursive'
  ctx.fillStyle = '#1a1a1a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('María Paulina', W / 2, 102)

  // ── Tagline ──────────────────────────────────────────────────
  ctx.font = '300 14px "Montserrat", sans-serif'
  ctx.fillStyle = '#b0a0a8'
  ctx.fillText('LASHISTA ESPECIALISTA EN LIFTING DE PESTAÑAS', W / 2, 132)

  // ── Divider ──────────────────────────────────────────────────
  ctx.strokeStyle = PINK
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(60, 158)
  ctx.lineTo(W - 60, 158)
  ctx.stroke()

  // ── "DETALLES DE CITA" label ─────────────────────────────────
  ctx.font = '600 11px "Montserrat", sans-serif'
  ctx.fillStyle = PINK
  ctx.textAlign = 'center'
  ctx.fillText('DETALLES DE CITA', W / 2, 190)

  // ── Rows ─────────────────────────────────────────────────────
  const VALUE_MAX_W = 640

  rows.forEach((row, i) => {
    const y = HEADER_H + i * ROW_H

    // Alternate row tint
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fillRect(40, y + 2, W - 80, ROW_H - 4)
    }

    // Label
    ctx.font = '500 11px "Montserrat", sans-serif'
    ctx.fillStyle = '#c0afb7'
    ctx.textAlign = 'left'
    ctx.fillText(row.label, 64, y + 22)

    // Value
    ctx.font = '500 20px "Montserrat", sans-serif'
    ctx.fillStyle = '#2a2026'
    ctx.textAlign = 'left'
    const val = truncate(ctx, row.value, VALUE_MAX_W)
    ctx.fillText(val, 64, y + 52)
  })

  // ── Bottom divider ────────────────────────────────────────────
  const rowsEndY = HEADER_H + rows.length * ROW_H

  // ── Divider before policies ───────────────────────────────────
  ctx.strokeStyle = '#e0d0d8'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(40, rowsEndY + 16)
  ctx.lineTo(W - 40, rowsEndY + 16)
  ctx.stroke()

  // ── IMPORTANTE header ─────────────────────────────────────────
  let py = rowsEndY + 48
  ctx.font = '700 12px "Montserrat", sans-serif'
  ctx.fillStyle = PINK
  ctx.textAlign = 'center'
  ctx.fillText('IMPORTANTE', W / 2, py)

  // ── Policy helper ─────────────────────────────────────────────
  type Policy = { title: string; body: string }
  const policies: Policy[] = [
    {
      title: 'TIEMPO DE TOLERANCIA',
      body: 'Solo 10 min de tolerancia. Después tu cita se cancela automáticamente y se pierde el anticipo.',
    },
    {
      title: 'CANCELAR / REAGENDAR',
      body: 'Mínimo 24 hrs antes. Anticipo no rembolsable.',
    },
    {
      title: 'DEPÓSITO DE ANTICIPO',
      body: 'Da tu anticipo mín 24 hrs antes para no perder tu espacio. Si tu cita no se confirmó, no está agendada.',
    },
  ]

  const POLICY_INNER_W = W - 120

  function wrapText(text: string, maxW: number, lineH: number, startY: number): number {
    const words = text.split(' ')
    let line = ''
    let y = startY
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, W / 2, y)
        line = word
        y += lineH
      } else {
        line = test
      }
    }
    if (line) ctx.fillText(line, W / 2, y)
    return y
  }

  py += 18
  for (const policy of policies) {
    // Title
    ctx.font = '600 12px "Montserrat", sans-serif'
    ctx.fillStyle = '#2a2026'
    ctx.textAlign = 'center'
    py += 18
    ctx.fillText(policy.title, W / 2, py)
    // Body
    ctx.font = '300 12px "Montserrat", sans-serif'
    ctx.fillStyle = '#7a6a72'
    py += 18
    py = wrapText(policy.body, POLICY_INNER_W, 17, py)
    py += 6
  }

  // ── Bottom divider ────────────────────────────────────────────
  const botY = H - FOOTER_H + 16
  ctx.strokeStyle = '#e0d0d8'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(60, botY)
  ctx.lineTo(W - 60, botY)
  ctx.stroke()

  // ── Bottom signature ─────────────────────────────────────────
  ctx.font = '400 26px "Dancing Script", cursive'
  ctx.fillStyle = PINK
  ctx.textAlign = 'center'
  ctx.fillText('María Paulina', W / 2, botY + 48)

  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
}
