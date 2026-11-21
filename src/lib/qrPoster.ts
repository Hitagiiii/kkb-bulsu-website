import QRCode from 'qrcode'

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…'
    return kept
  }
  return lines
}

/** Makes a printable PNG poster (title, date, big QR code) and downloads it. */
export async function downloadQrPoster(link: string, title: string, when: string): Promise<void> {
  const qr = await QRCode.toDataURL(link, { width: 900, margin: 1, errorCorrectionLevel: 'M' })
  const img = new Image()
  img.src = qr
  await img.decode()

  const W = 1080
  const H = 1700
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not make the image.')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#8a1c2e'
  ctx.fillRect(0, 0, W, 28)
  ctx.textAlign = 'center'

  ctx.fillStyle = '#8a1c2e'
  ctx.font = '700 40px Inter, Arial, sans-serif'
  ctx.fillText('KKB BULSU', W / 2, 110)

  ctx.fillStyle = '#25191b'
  ctx.font = '700 64px Inter, Arial, sans-serif'
  const lines = wrapLines(ctx, title, W - 160, 3)
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 210 + i * 78))

  ctx.fillStyle = '#6b5e5a'
  ctx.font = '400 36px Inter, Arial, sans-serif'
  ctx.fillText(when, W / 2, 210 + lines.length * 78 + 20)

  ctx.drawImage(img, 90, 640, 900, 900)

  ctx.fillStyle = '#8a1c2e'
  ctx.font = '700 52px Inter, Arial, sans-serif'
  ctx.fillText('Scan to check in', W / 2, 1610)
  ctx.fillStyle = '#6b5e5a'
  ctx.font = '400 30px Inter, Arial, sans-serif'
  ctx.fillText('Use your phone camera. Sign in if asked.', W / 2, 1655)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not make the image.')
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}-checkin-qr.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
