export interface Announcement {
  id: string
  title: string
  body: string
  pinned: boolean
  created_by: string
  author_name: string
  created_at: string
  updated_at: string | null
  event_at: string | null
  image_paths: string[]
}

export const DAY_MS = 24 * 60 * 60 * 1000

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "in 25 minutes", "in 3 hours", "in 2 days" */
export function timeUntil(iso: string, now: number = Date.now()): string {
  const mins = Math.round((new Date(iso).getTime() - now) / 60000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `in ${days} day${days === 1 ? '' : 's'}`
}

export type EventState = 'past' | 'soon' | 'later'

/** 'soon' = starts within the next 24 hours */
export function eventState(iso: string, now: number = Date.now()): EventState {
  const diff = new Date(iso).getTime() - now
  if (diff < 0) return 'past'
  return diff <= DAY_MS ? 'soon' : 'later'
}

/** ISO string to the value a <input type="datetime-local"> expects (local time) */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
