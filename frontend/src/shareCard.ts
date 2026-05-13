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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text.trim()
  while (t.length > 0 && ctx.measureText(`${t}...`).width > maxW) {
    t = t.slice(0, -1)
  }
  return `${t}...`
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines = 10,
): number {
  const words = text.trim().split(/\s+/)
  let line = ''
  let lines = 0
  let curY = y

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxW && line) {
      lines += 1
      if (lines === maxLines) {
        ctx.fillText(truncate(ctx, line, maxW), x, curY)
        return curY
      }
      ctx.fillText(line, x, curY)
      line = word
      curY += lineH
    } else {
      line = candidate
    }
  }

  if (line) {
    lines += 1
    if (lines > maxLines) {
      ctx.fillText(truncate(ctx, line, maxW), x, curY)
      return curY
    }
    ctx.fillText(line, x, curY)
  }

  return curY
}

export async function generateShareImage(apt: ShareApt): Promise<Blob> {
  await document.fonts.ready

  const W = 1080
  const H = 1350
  const DPR = 2
  const PINK = '#c9879d'
  const DARK = '#2b1f26'
  const SOFT = '#7f6c74'

  const canvas = document.createElement('canvas')
  canvas.width = W * DPR
  canvas.height = H * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#fff8fb')
  bg.addColorStop(1, '#f3ece8')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const orbA = ctx.createRadialGradient(190, 220, 0, 190, 220, 340)
  orbA.addColorStop(0, 'rgba(201, 135, 157, 0.25)')
  orbA.addColorStop(1, 'rgba(201, 135, 157, 0)')
  ctx.fillStyle = orbA
  ctx.fillRect(0, 0, W, H)

  const orbB = ctx.createRadialGradient(920, 1120, 0, 920, 1120, 360)
  orbB.addColorStop(0, 'rgba(92, 67, 82, 0.12)')
  orbB.addColorStop(1, 'rgba(92, 67, 82, 0)')
  ctx.fillStyle = orbB
  ctx.fillRect(0, 0, W, H)

  const cardX = 74
  const cardY = 56
  const cardW = W - cardX * 2
  const cardH = H - cardY * 2

  ctx.save()
  ctx.shadowColor = 'rgba(67, 38, 56, 0.16)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 14
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 34)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.restore()

  const headerH = 250
  const headerGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headerH)
  headerGrad.addColorStop(0, '#f6e3ea')
  headerGrad.addColorStop(1, '#f2d6df')
  drawRoundedRect(ctx, cardX, cardY, cardW, headerH, 34)
  ctx.fillStyle = headerGrad
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(cardX, cardY + headerH - 24, cardW, 24)

  ctx.save()
  ctx.font = '700 220px Georgia, serif'
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('MP', W / 2, cardY + 112)
  ctx.restore()

  ctx.font = '700 84px "Dancing Script", cursive'
  ctx.fillStyle = DARK
  ctx.textAlign = 'center'
  ctx.fillText('Maria Paulina', W / 2, cardY + 110)

  ctx.font = '600 18px "Montserrat", sans-serif'
  ctx.fillStyle = '#846a75'
  ctx.fillText('Agenda de cita', W / 2, cardY + 154)

  drawRoundedRect(ctx, W / 2 - 180, cardY + 176, 360, 44, 22)
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.fill()
  ctx.font = '700 16px "Montserrat", sans-serif'
  ctx.fillStyle = PINK
  ctx.textAlign = 'center'
  ctx.fillText('CONFIRMACION DE CITA', W / 2, cardY + 204)

  const left = cardX + 56
  const right = cardX + cardW - 56
  let y = cardY + headerH + 30

  const addRow = (label: string, value: string, wrap = false) => {
    ctx.font = '700 14px "Montserrat", sans-serif'
    ctx.fillStyle = '#b18e9d'
    ctx.textAlign = 'left'
    ctx.fillText(label, left, y)

    ctx.font = '600 33px "Montserrat", sans-serif'
    ctx.fillStyle = DARK
    if (wrap) {
      y = drawWrapped(ctx, value, left, y + 42, right - left, 38, 2) + 28
    } else {
      ctx.fillText(truncate(ctx, value, right - left), left, y + 42)
      y += 70
    }

    ctx.strokeStyle = '#eadde3'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
    y += 26
  }

  addRow('CLIENTE', apt.client, true)
  addRow('SERVICIO', `${apt.service} · ${apt.duration} min`, true)
  addRow('FECHA', fmtDate(apt.date), true)
  addRow('HORA', fmt12(apt.time))
  if (apt.phone.trim()) {
    addRow('CONTACTO', apt.phone.trim())
  }
  addRow('VALOR', `$${apt.price}`)

  if (apt.notes.trim()) {
    const notesH = 136
    drawRoundedRect(ctx, left, y, right - left, notesH, 20)
    ctx.fillStyle = '#f8f3f5'
    ctx.fill()

    ctx.font = '700 14px "Montserrat", sans-serif'
    ctx.fillStyle = '#b18e9d'
    ctx.fillText('NOTAS', left + 20, y + 30)

    ctx.font = '500 21px "Montserrat", sans-serif'
    ctx.fillStyle = SOFT
    drawWrapped(ctx, apt.notes.trim(), left + 20, y + 64, right - left - 40, 30, 3)
    y += notesH + 22
  }

  const polH = 220
  drawRoundedRect(ctx, left, y, right - left, polH, 22)
  ctx.fillStyle = '#f6ecf1'
  ctx.fill()

  ctx.font = '700 16px "Montserrat", sans-serif'
  ctx.fillStyle = PINK
  ctx.textAlign = 'left'
  ctx.fillText('IMPORTANTE', left + 20, y + 32)

  ctx.font = '500 18px "Montserrat", sans-serif'
  ctx.fillStyle = SOFT
  const policies = [
    'Tolerancia maxima de 10 min.',
    'Para reagendar o cancelar, avisar con 24 horas.',
    'Anticipo no reembolsable en cancelacion tardia.',
  ]

  let py = y + 70
  for (const line of policies) {
    ctx.fillStyle = PINK
    ctx.fillText('•', left + 22, py)
    ctx.fillStyle = SOFT
    ctx.fillText(line, left + 44, py)
    py += 42
  }

  const footerY = cardY + cardH - 36
  ctx.strokeStyle = '#eadde3'
  ctx.beginPath()
  ctx.moveTo(left, footerY - 42)
  ctx.lineTo(right, footerY - 42)
  ctx.stroke()

  ctx.font = '500 42px "Dancing Script", cursive'
  ctx.fillStyle = PINK
  ctx.textAlign = 'center'
  ctx.fillText('Maria Paulina', W / 2, footerY)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('No se pudo generar la imagen'))
      }
    }, 'image/png')
  })
}
