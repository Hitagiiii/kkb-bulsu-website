import { supabase } from './supabase'

export interface Budget {
  id: string
  name: string
  event_id: string | null
  total_budget: number
  created_at: string
}

export interface Expense {
  id: string
  budget_id: string
  description: string
  category: string
  amount: number
  receipt_path: string | null
  spent_on: string
  added_by: string
  created_at: string
  voided_at: string | null
  void_reason: string | null
  voided_by: string | null
}

export interface BudgetSummary {
  budget_id: string
  name: string
  total_budget: number
  total_spent: number
  money_left: number
}

export const CATEGORIES = ['Food', 'Venue', 'Printing', 'Materials', 'Transportation', 'Prizes', 'Other']

const pesoFormat = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
export const peso = (n: number) => pesoFormat.format(n)

export function formatDate(iso: string): string {
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

/** Shrink a receipt photo before upload so the free storage lasts. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('The receipt must be an image file.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the image.'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Private receipts need short-lived signed links to be displayed. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data } = await supabase.storage.from('receipts').createSignedUrls(paths, 60 * 60 * 6)
  const out: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  }
  return out
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return fallback
}
