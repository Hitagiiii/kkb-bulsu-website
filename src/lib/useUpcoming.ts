import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DAY_MS, formatEventTime } from './announcements'

export interface UpcomingItem {
  id: string
  title: string
  at: string // ISO start time
  source: 'announcement' | 'event'
  to: string // where the banner link goes
}

const DISMISSED_KEY = 'kkb.dismissed.events'
const NOTIFIED_KEY = 'kkb.notified.events'

// An event that gets rescheduled counts as new, so its reminder shows again
const keyOf = (i: UpcomingItem) => `${i.source}:${i.id}@${i.at}`

function readSet(key: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(key) ?? '[]'))
  } catch {
    return new Set<string>()
  }
}

function writeSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set].slice(-200)))
  } catch {
    // storage can be blocked; reminders still work for this visit
  }
}

type Permission = NotificationPermission | 'unsupported'

/**
 * Events and announced events that start within the next 24 hours.
 * Refreshes every 5 minutes, when the tab regains focus, and when the data changes.
 */
export function useUpcoming() {
  const [items, setItems] = useState<UpcomingItem[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => readSet(DISMISSED_KEY))
  const [permission, setPermission] = useState<Permission>(() =>
    'Notification' in window ? Notification.permission : 'unsupported',
  )

  const load = useCallback(async () => {
    const now = Date.now()
    const from = new Date(now).toISOString()
    const to = new Date(now + DAY_MS).toISOString()
    const [a, e] = await Promise.all([
      supabase.from('announcements').select('id, title, event_at').gte('event_at', from).lte('event_at', to),
      supabase.from('events').select('id, title, starts_at').gte('starts_at', from).lte('starts_at', to),
    ])

    const events: UpcomingItem[] = ((e.data ?? []) as { id: string; title: string; starts_at: string }[]).map(
      (r) => ({ id: r.id, title: r.title, at: r.starts_at, source: 'event', to: '/events' }),
    )

    // If an announcement and an event start at the same moment, only show the event
    const eventTimes = new Set(events.map((x) => new Date(x.at).getTime()))
    const announced: UpcomingItem[] = ((a.data ?? []) as { id: string; title: string; event_at: string | null }[])
      .filter((r) => r.event_at && !eventTimes.has(new Date(r.event_at).getTime()))
      .map((r) => ({ id: r.id, title: r.title, at: r.event_at!, source: 'announcement', to: '/announcements' }))

    setItems(
      [...events, ...announced].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime()),
    )
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    const channel = supabase
      .channel('upcoming-reminders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => void load())
      .subscribe()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      void supabase.removeChannel(channel)
    }
  }, [load])

  // Device alert, once per event, when the person has allowed notifications
  useEffect(() => {
    if (permission !== 'granted') return
    const notified = readSet(NOTIFIED_KEY)
    let changed = false
    for (const item of items) {
      const key = keyOf(item)
      if (notified.has(key)) continue
      notified.add(key)
      changed = true
      try {
        new Notification(`Coming up: ${item.title}`, {
          body: `Starts ${formatEventTime(item.at)}`,
          tag: key,
        })
      } catch {
        // some phone browsers only allow notifications through a service worker
      }
    }
    if (changed) writeSet(NOTIFIED_KEY, notified)
  }, [items, permission])

  const upcoming = items.filter((i) => !dismissed.has(keyOf(i)))

  function dismiss(item: UpcomingItem) {
    const next = new Set(dismissed)
    next.add(keyOf(item))
    writeSet(DISMISSED_KEY, next)
    setDismissed(next)
  }

  async function enableAlerts() {
    if (!('Notification' in window)) return
    setPermission(await Notification.requestPermission())
  }

  return { upcoming, dismiss, permission, enableAlerts }
}
