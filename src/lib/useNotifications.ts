import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface AppNotification {
  id: string
  kind: string
  title: string
  body: string
  link: string | null
  created_at: string
  read_at: string | null
}

/** The signed-in member's notifications, newest first. New ones arrive live; a slow refresh covers dropped connections. */
export function useNotifications(userId: string | undefined) {
  const [items, setItems] = useState<AppNotification[]>([])

  const load = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select('id, kind, title, body, link, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setItems(data as AppNotification[])
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void load()
    const timer = window.setInterval(() => void load(), 120_000)
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as AppNotification
          setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, 30)))
          // a device alert, only if the member allowed them and is not looking at the page
          try {
            if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
              new Notification(n.title, { body: n.body, tag: n.id })
            }
          } catch {
            // some browsers only allow alerts from a service worker
          }
        },
      )
      .subscribe()
    return () => {
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [userId, load])

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      const now = new Date().toISOString()
      setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)))
      await supabase.from('notifications').update({ read_at: now }).in('id', ids)
    },
    [],
  )

  const unread = items.filter((n) => !n.read_at).length
  return { items, unread, markRead, reload: load }
}
