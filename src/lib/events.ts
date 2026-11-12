export interface EventRow {
  id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  location_name: string | null
  latitude: number | null
  longitude: number | null
  meeting_link: string | null
  created_by: string
  created_at: string
}

export const HOUR_MS = 60 * 60 * 1000

/** "2026-11-20" in the viewer's local time, used to group events by day */
export function dayKey(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-CA')
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

export function formatRange(start: string, end: string | null): string {
  if (!end) return `${formatDay(start)}, ${formatTime(start)}`
  if (dayKey(start) === dayKey(end)) return `${formatDay(start)}, ${formatTime(start)} to ${formatTime(end)}`
  return `${formatDay(start)}, ${formatTime(start)} to ${formatDay(end)}, ${formatTime(end)}`
}

/** An event with no end time is treated as lasting 3 hours */
export function isOver(e: Pick<EventRow, 'starts_at' | 'ends_at'>, now: number): boolean {
  const endMs = e.ends_at ? new Date(e.ends_at).getTime() : new Date(e.starts_at).getTime() + 3 * HOUR_MS
  return endMs < now
}

export const googleDirections = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

export const googleDirectionsByName = (place: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`

export const wazeDirections = (lat: number, lng: number) =>
  `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`

/**
 * Cleans up a pasted meeting link.
 * Empty input is fine (no link). Anything that is not a web link is invalid.
 * Links are always made https.
 */
export function parseMeetingLink(raw: string): { value: string | null; valid: boolean } {
  const text = raw.trim()
  if (!text) return { value: null, valid: true }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { value: null, valid: false }
    if (!url.hostname.includes('.')) return { value: null, valid: false }
    url.protocol = 'https:'
    return { value: url.toString(), valid: true }
  } catch {
    return { value: null, valid: false }
  }
}

export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
