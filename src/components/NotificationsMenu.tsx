import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { timeAgo } from '../lib/announcements'
import type { AppNotification } from '../lib/useNotifications'

/** "Notifications" in the top bar: unread count, a panel with the latest, and device alerts. */
export default function NotificationsMenu({
  data,
  permission,
  enableAlerts,
  align = 'right',
}: {
  data: { items: AppNotification[]; unread: number; markRead: (ids: string[]) => Promise<void> }
  permission: NotificationPermission | 'unsupported'
  enableAlerts: () => Promise<void>
  align?: 'right' | 'left'
}) {
  const { items, unread, markRead } = data
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-1.5 py-1 text-xs text-muted hover:text-ink md:min-h-0"
      >
        Notifications
        {unread > 0 && (
          <span className="rounded-full bg-brand-700 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className={
            'absolute z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-line bg-white text-left shadow-none ring-1 ring-line ' +
            (align === 'right' ? 'right-0' : 'left-0')
          }
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {unread > 0 && (
              <button onClick={() => void markRead(items.filter((n) => !n.read_at).map((n) => n.id))} className="text-xs font-semibold text-brand-700 hover:underline">
                Mark all as read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Nothing yet. Payment updates and arrivals will show up here.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void markRead([n.id])
                      setOpen(false)
                      if (n.link) navigate(n.link)
                    }}
                    className={'block w-full px-4 py-3 text-left hover:bg-paper ' + (n.read_at ? '' : 'bg-soft/50')}
                  >
                    <span className="flex items-start gap-2">
                      {!n.read_at && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-700" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold break-words text-ink">{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-xs break-words text-muted">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-muted">{timeAgo(n.created_at)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {permission === 'default' && (
            <div className="border-t border-line px-4 py-3">
              <button onClick={() => void enableAlerts()} className="text-xs font-semibold text-brand-700 hover:underline">
                Also alert me on this device
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
