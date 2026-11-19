import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL } from '../lib/types'
import { formatDateTime, formatEventTime, timeUntil, type Announcement } from '../lib/announcements'
import type { EventRow } from '../lib/events'
import { canSeeNav, NAV_ITEMS } from '../nav'
import Chip from '../components/Chip'
import DashboardExtras from '../components/DashboardExtras'

type Latest = Pick<Announcement, 'id' | 'title' | 'body' | 'pinned' | 'created_at' | 'event_at'>

export default function Dashboard() {
  const { profile } = useAuth()
  const [latest, setLatest] = useState<Latest[] | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [pollsWaiting, setPollsWaiting] = useState<number | null>(null)

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
    Promise.all([
      supabase.from('polls').select('id, closes_at'),
      supabase.from('poll_votes').select('poll_id'),
    ]).then(([p, v]) => {
      const voted = new Set(((v.data ?? []) as { poll_id: string }[]).map((r) => r.poll_id))
      const open = ((p.data ?? []) as { id: string; closes_at: string | null }[]).filter(
        (r) => !r.closes_at || new Date(r.closes_at).getTime() > Date.now(),
      )
      setPollsWaiting(open.filter((r) => !voted.has(r.id)).length)
    })
  }, [])

  const firstName = profile?.full_name.split(' ')[0] || 'there'
  const links = NAV_ITEMS.filter((i) => i.to !== '/' && canSeeNav(i, profile?.role))
  const next = events && events.length > 0 ? events[0] : null
  const laterEvents = events ? events.slice(1) : []

  /*
   * Mobile: one column, in DOM order (greeting, actions, events, feed, links).
   * md and up: feed in the main column, actions + events in a slim right rail.
   * Cells carry their own top margin so an empty cell leaves no gap.
   */
  return (
    <div className="max-w-5xl">
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-x-10">
        <header className="md:col-span-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Hello, {firstName}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Signed in as {profile ? ROLE_LABEL[profile.role].toLowerCase() : 'a member'}.
          </p>
        </header>

        <DashboardExtras pollsWaiting={pollsWaiting} className="mt-6 md:col-start-2 md:row-start-2" />

        <section aria-label="Upcoming events" className="mt-6 md:col-start-2 md:row-start-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-lg font-bold">Upcoming events</h2>
            <Link to="/events" className="py-1 text-sm font-medium text-brand-700 hover:underline">
              See all
            </Link>
          </div>
          {events === null && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
          {events && events.length === 0 && <p className="mt-2 text-sm text-slate-500">No upcoming events yet.</p>}
          {next && (
            <Link to="/events" className="mt-2 block rounded-md bg-card p-4 transition-colors hover:bg-secondary">
              <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">Next, starts {timeUntil(next.starts_at)}</p>
              <p className="font-display mt-1 text-lg font-bold break-words text-ink">{next.title}</p>
              <p className="mt-1 text-sm text-slate-700">{formatEventTime(next.starts_at)}</p>
              {next.location_name && <p className="text-sm break-words text-slate-500">{next.location_name}</p>}
            </Link>
          )}
          {laterEvents.length > 0 && (
            <ul className="mt-1 divide-y divide-hairline border-b border-hairline">
              {laterEvents.map((e) => (
                <li key={e.id}>
                  <Link to="/events" className="block px-1 py-2.5 transition-colors hover:bg-card">
                    <p className="text-sm font-medium break-words text-ink">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatEventTime(e.starts_at)}
                      {e.location_name && `, ${e.location_name}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Latest announcements" className="mt-6 md:col-start-1 md:row-span-3 md:row-start-2">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-lg font-bold">Latest announcements</h2>
            <Link to="/announcements" className="py-1 text-sm font-medium text-brand-700 hover:underline">
              See all
            </Link>
          </div>
          {latest === null && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
          {latest && latest.length === 0 && <p className="mt-2 text-sm text-slate-500">Nothing has been posted yet.</p>}
          {latest && latest.length > 0 && (
            <ul className="mt-2 space-y-3">
              {latest.map((a) => (
                <li key={a.id}>
                  <Link
                    to="/announcements"
                    className="block rounded-md border border-hairline bg-white p-4 transition-colors hover:bg-card"
                  >
                    {a.pinned && (
                      <span className="mb-2 inline-block">
                        <Chip tone="brand">Pinned</Chip>
                      </span>
                    )}
                    <p className="font-display text-base font-bold break-words text-ink">{a.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm break-words text-slate-600">{a.body}</p>
                    {a.event_at && (
                      <p className="mt-2 text-sm font-medium text-brand-700">Event: {formatEventTime(a.event_at)}</p>
                    )}
                    <p className="mt-2 text-xs text-slate-500">Posted {formatDateTime(a.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav aria-label="All sections" className="mt-8 md:col-start-1 md:row-start-5">
          <h2 className="font-display text-lg font-bold">All sections</h2>
          <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
            {links.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex flex-col gap-0.5 px-1 py-2.5 transition-colors hover:bg-card sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className="text-sm font-semibold text-ink">{item.label}</span>
                  <span className="text-xs text-slate-500 sm:text-right">{item.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
