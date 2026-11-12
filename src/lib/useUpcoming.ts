import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DAY_MS, formatEventTime, type Announcement } from './announcements'

export type UpcomingItem = Pick<Announcement, 'id' | 'title' | 'event_at'>

const DISMISSED_KEY = 'kkb.dismissed.events'
const NOTIFIED_KEY = 'kkb.notified.events'

// An event that gets rescheduled counts as new, so its reminder shows again
const keyOf = (i: UpcomingItem) => `${i.id}@${i.event_at}`

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
 * Announcements whose event starts within the next 24 hours.
 * Refreshes every 5 minutes, when the tab regains focus, and when announcements change.
 */
export function useUpcoming() {
  const [items, setItems] = useState<UpcomingItem[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => readSet(DISMISSED_KEY))
  const [permission, setPermission] = useState<Permission>(() =>
    'Notification' in window ? Notification.permission : 'unsupported',
  )

  const load = useCallback(async () => {
    const now = Date.now()
    const { data } = await supabase
      .from('announcements')
      .select('id, title, event_at')
      .gte('event_at', new Date(now).toISOString())
      .lte('event_at', new Date(now + DAY_MS).toISOString())
      .order('event_at')
    setItems((data ?? []) as UpcomingItem[])
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5 * 60 * 1000)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    const channel = supabase
      .channel('upcoming-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => void load())
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
          body: item.event_at ? `Starts ${formatEventTime(item.event_at)}` : undefined,
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
