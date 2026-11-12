import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole, ROLE_LABEL } from '../lib/types'
import { formatDateTime, formatEventTime, type Announcement } from '../lib/announcements'
import type { EventRow } from '../lib/events'
import { NAV_ITEMS } from '../nav'

type Latest = Pick<Announcement, 'id' | 'title' | 'body' | 'pinned' | 'created_at' | 'event_at'>

export default function Dashboard() {
  const { profile } = useAuth()
  const [latest, setLatest] = useState<Latest[] | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)

  useEffect(() => {
    supabase
      .from('announcements')
      .select('id, title, body, pinned, created_at, event_at')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => setLatest((data ?? []) as Latest[]))
    supabase
      .from('events')
      .select('*')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(3)
      .then(({ data }) => setEvents((data ?? []) as EventRow[]))
  }, [])

  const firstName = profile?.full_name.split(' ')[0] || 'there'
  const links = NAV_ITEMS.filter(
    (i) => i.to !== '/' && (!i.minRole || hasRole(profile?.role, i.minRole)),
  )

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">Hello, {firstName}</h1>
      <p className="mt-2 text-slate-600">
        You're signed in as {profile ? ROLE_LABEL[profile.role].toLowerCase() : 'a member'}.
      </p>

      <section className="mt-10" aria-label="Latest announcements">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-semibold">Latest announcements</h2>
          <Link to="/announcements" className="py-1 text-sm font-medium text-brand-700 hover:underline">
            See all
          </Link>
        </div>
        {latest === null && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
        {latest && latest.length === 0 && <p className="mt-3 text-sm text-slate-500">Nothing has been posted yet.</p>}
        {latest && latest.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {latest.map((a) => (
              <li key={a.id}>
                <Link to="/announcements" className="block py-4 transition-colors hover:text-brand-700">
                  <p className="font-medium break-words">
                    {a.pinned && <span className="mr-2 text-xs font-semibold text-brand-700">Pinned</span>}
                    {a.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm break-words text-slate-600">{a.body}</p>
                  {a.event_at && (
                    <p className="mt-1 text-sm font-medium text-brand-800">Event: {formatEventTime(a.event_at)}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">Posted {formatDateTime(a.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-label="Upcoming events">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-semibold">Upcoming events</h2>
          <Link to="/events" className="py-1 text-sm font-medium text-brand-700 hover:underline">
            See all
          </Link>
        </div>
        {events === null && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
        {events && events.length === 0 && <p className="mt-3 text-sm text-slate-500">No upcoming events yet.</p>}
        {events && events.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {events.map((e) => (
              <li key={e.id}>
                <Link to="/events" className="block py-4 transition-colors hover:text-brand-700">
                  <p className="font-medium break-words">{e.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{formatEventTime(e.starts_at)}</p>
                  {e.location_name && <p className="text-sm break-words text-slate-500">{e.location_name}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ul className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
        {links.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="flex flex-col gap-1 py-4 transition-colors hover:text-brand-700 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <span className="font-display text-lg font-semibold">{item.label}</span>
              <span className="text-sm text-slate-500 sm:text-right">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
