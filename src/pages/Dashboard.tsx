import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL } from '../lib/types'
import { formatDateTime, timeUntil, type Announcement } from '../lib/announcements'
import { formatRange, PARTICIPATION_TARGET, type EventRow } from '../lib/events'
import { signedUrlsFor } from '../lib/storage'
import { canSeeNav, NAV_ITEMS } from '../nav'
import Chip from '../components/Chip'
import DashboardExtras from '../components/DashboardExtras'
import { buttonClass, cardClass, eyebrowClass } from '../components/ui'

type Latest = Pick<Announcement, 'id' | 'title' | 'body' | 'pinned' | 'created_at' | 'event_at' | 'image_paths'>

const BUCKET = 'announcement-images'

export default function Dashboard() {
  const { profile, session } = useAuth()
  const [latest, setLatest] = useState<Latest[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [pollsWaiting, setPollsWaiting] = useState<number | null>(null)
  const [openPolls, setOpenPolls] = useState<{ id: string; question: string; closes_at: string | null }[] | null>(null)
  const [docs, setDocs] = useState<{ id: string; title: string; category: string; created_at: string }[] | null>(null)
  const [attendance, setAttendance] = useState<{ attended: number; past: number } | null>(null)

  useEffect(() => {
    supabase
      .from('announcements')
      .select('id, title, body, pinned, created_at, event_at, image_paths')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(4)
      .then(async ({ data }) => {
        const list = (data ?? []) as Latest[]
        setLatest(list)
        setUrls(await signedUrlsFor(BUCKET, list.flatMap((a) => a.image_paths ?? [])))
      })
    supabase
      .from('events')
      .select('*')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(6)
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
    supabase
      .from('polls')
      .select('id, question, closes_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        const rows = (data ?? []) as { id: string; question: string; closes_at: string | null }[]
        setOpenPolls(rows.filter((r) => !r.closes_at || new Date(r.closes_at).getTime() > Date.now()).slice(0, 4))
      })
    supabase
      .from('documents')
      .select('id, title, category, created_at')
      .order('created_at', { ascending: false })
      .limit(4)
      .then(({ data }) => setDocs((data ?? []) as { id: string; title: string; category: string; created_at: string }[]))
  }, [])

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('event_attendance').select('checked_in_at, events(starts_at)').eq('user_id', profile.id),
      supabase.from('events').select('id', { count: 'exact', head: true }).lt('starts_at', new Date().toISOString()),
    ]).then(([a, e]) => {
      const mine = (a.data ?? []) as unknown as { events: { starts_at: string } | null }[]
      const attended = mine.filter((m) => m.events && new Date(m.events.starts_at).getTime() < Date.now()).length
      setAttendance({ attended, past: e.count ?? 0 })
    })
  }, [profile])

  const emailName = session?.user.email?.split('@')[0]?.replace(/[^a-zA-Z]+/g, ' ').trim().split(' ')[0] ?? ''
  const firstName = profile?.full_name.split(' ')[0] || (emailName ? emailName[0].toUpperCase() + emailName.slice(1) : 'there')
  const links = NAV_ITEMS.filter((i) => i.to !== '/' && canSeeNav(i, profile?.role))
  const next = events && events.length > 0 ? events[0] : null
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const rate = attendance && attendance.past > 0 ? attendance.attended / attendance.past : null

  return (
    <div className="w-full">
      <header>
        <p className={eyebrowClass}>{today}</p>
        <h1 className="font-display mt-1 text-[28px] leading-tight font-medium tracking-tight sm:text-[40px]">
          Magandang araw, {firstName}.
        </h1>
        <p className="mt-2 text-sm text-muted">
          Here’s what’s moving in your KKB community. Signed in as {profile ? ROLE_LABEL[profile.role].toLowerCase() : 'a member'}.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* Main column */}
        <div className="space-y-10">
          <DashboardExtras pollsWaiting={pollsWaiting} />

          <section aria-label="Latest announcements">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-medium text-ink">Latest announcements</h2>
              <Link to="/announcements" className="py-1 text-sm font-semibold text-brand-700 hover:underline">
                See all
              </Link>
            </div>
            {latest === null && <p className="mt-3 text-sm text-muted">Loading…</p>}
            {latest && latest.length === 0 && <p className="mt-3 text-sm text-muted">Nothing has been posted yet.</p>}
            {latest && latest.length > 0 && (
              <ul className="mt-3 space-y-3">
                {latest.map((a, i) => {
                  const photo = (a.image_paths ?? []).map((p) => urls[p]).find(Boolean)
                  return (
                    <li key={a.id}>
                      <Link to="/announcements" className={cardClass + ' block overflow-hidden transition-colors hover:bg-paper sm:flex'}>
                        {photo && i === 0 && (
                          <img src={photo} alt="" className="aspect-[16/9] w-full object-cover sm:aspect-auto sm:w-56 sm:shrink-0" />
                        )}
                        <div className="min-w-0 p-4">
                          <div className="flex items-center gap-2">
                            <span className={eyebrowClass}>Community / {formatDateTime(a.created_at).split(',')[0]}</span>
                            {a.pinned && <Chip tone="brand">Pinned</Chip>}
                          </div>
                          <p className="mt-1 text-lg font-semibold break-words text-ink">{a.title}</p>
                          <p className="mt-1 line-clamp-2 text-sm break-words text-muted">{a.body}</p>
                          <p className="mt-3 text-sm font-semibold text-brand-700">Read the story →</p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <section aria-label="Coming up">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-medium text-ink">Coming up</h2>
                <Link to="/events" className="py-1 text-sm font-semibold text-brand-700 hover:underline">See all</Link>
              </div>
              {events === null && <p className="mt-3 text-sm text-muted">Loading…</p>}
              {events && events.length === 0 && <p className={cardClass + ' mt-3 px-4 py-6 text-sm text-muted'}>No upcoming events yet.</p>}
              {events && events.length > 0 && (
                <ul className={cardClass + ' mt-3 divide-y divide-line overflow-hidden'}>
                  {events.slice(0, 5).map((e) => {
                    const d = new Date(e.starts_at)
                    return (
                      <li key={e.id}>
                        <Link to="/events" className="flex items-stretch hover:bg-paper">
                          <span className="flex w-16 shrink-0 flex-col items-center justify-center bg-soft py-3">
                            <span className="text-[11px] font-semibold tracking-[0.08em] text-brand-700 uppercase">{d.toLocaleDateString('en-PH', { month: 'short' })}</span>
                            <span className="text-2xl leading-none font-medium text-ink">{d.getDate()}</span>
                          </span>
                          <span className="min-w-0 flex-1 px-4 py-3">
                            <span className="block text-sm font-semibold break-words text-ink">{e.title}</span>
                            <span className="block text-xs text-muted">{formatRange(e.starts_at, e.ends_at)}</span>
                            {e.location_name && <span className="block text-xs break-words text-muted">{e.location_name}</span>}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section aria-label="Open polls">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-medium text-ink">Open polls</h2>
                <Link to="/polls" className="py-1 text-sm font-semibold text-brand-700 hover:underline">See all</Link>
              </div>
              {openPolls === null && <p className="mt-3 text-sm text-muted">Loading…</p>}
              {openPolls && openPolls.length === 0 && <p className={cardClass + ' mt-3 px-4 py-6 text-sm text-muted'}>No polls are open right now.</p>}
              {openPolls && openPolls.length > 0 && (
                <ul className={cardClass + ' mt-3 divide-y divide-line overflow-hidden'}>
                  {openPolls.map((p) => (
                    <li key={p.id}>
                      <Link to="/polls" className="block px-4 py-3 hover:bg-paper">
                        <span className={eyebrowClass + ' block'}>Member poll</span>
                        <span className="mt-1 block text-sm font-semibold break-words text-ink">{p.question}</span>
                        <span className="block text-xs text-muted">
                          {p.closes_at ? `Voting closes ${formatDateTime(p.closes_at)}` : 'Open until an officer closes it'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section aria-label="Recent documents">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-medium text-ink">Recent documents</h2>
              <Link to="/documents" className="py-1 text-sm font-semibold text-brand-700 hover:underline">See all</Link>
            </div>
            {docs === null && <p className="mt-3 text-sm text-muted">Loading…</p>}
            {docs && docs.length === 0 && <p className={cardClass + ' mt-3 px-4 py-6 text-sm text-muted'}>No documents have been shared yet.</p>}
            {docs && docs.length > 0 && (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link to="/documents" className={cardClass + ' block p-4 hover:bg-paper'}>
                      <span className={eyebrowClass + ' block'}>{d.category}</span>
                      <span className="mt-1 block text-sm font-semibold break-words text-ink">{d.title}</span>
                      <span className="block text-xs text-muted">Added {formatDateTime(d.created_at).split(',')[0]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-6">
          <section aria-label="Next event" className={cardClass + ' p-4'}>
            <p className={eyebrowClass}>Next up{next ? ` / ${timeUntil(next.starts_at)}` : ''}</p>
            {events === null && <p className="mt-2 text-sm text-muted">Loading…</p>}
            {events && !next && <p className="mt-2 text-sm text-muted">No upcoming events yet.</p>}
            {next && (
              <>
                <p className="mt-2 text-xl leading-snug font-medium break-words text-ink">{next.title}</p>
                <p className="mt-3 text-xs text-muted">{formatRange(next.starts_at, next.ends_at)}</p>
                {next.location_name && <p className="text-xs break-words text-muted">{next.location_name}</p>}
                <Link to="/events" className={buttonClass + ' mt-4'}>
                  View event &amp; RSVP
                </Link>
              </>
            )}
          </section>

          <section aria-label="Membership" className={cardClass + ' p-4'}>
            <p className="text-lg font-medium text-ink">You belong here.</p>
            <p className="mt-1 text-xs text-muted">
              {profile ? ROLE_LABEL[profile.role] : 'Member'} · AY 2026–2027
            </p>
            {profile?.student_no && <p className="text-xs text-muted">Student no. {profile.student_no}</p>}
            {attendance && (
              <>
                <p className="mt-4 text-sm font-semibold text-ink">
                  {attendance.attended} of {attendance.past} events attended
                </p>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((rate ?? 0) * 100)}
                  aria-label="Attendance"
                >
                  <div className="h-full bg-brand-700" style={{ width: `${Math.round((rate ?? 0) * 100)}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {rate !== null && rate >= PARTICIPATION_TARGET
                    ? `You meet the ${PARTICIPATION_TARGET * 100}% participation guideline.`
                    : 'Your next event counts toward active status.'}
                </p>
              </>
            )}
            <Link to="/attendance" className="mt-3 inline-block py-1 text-sm font-semibold text-brand-700 hover:underline">
              View my attendance →
            </Link>
          </section>

          <nav aria-label="Quick links" className={cardClass + ' p-4'}>
            <p className="text-sm font-semibold text-ink">Quick links</p>
            <ul className="mt-2 divide-y divide-line">
              {links.slice(0, 6).map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="flex items-center justify-between py-2 text-sm text-ink hover:text-brand-700">
                    {item.label}
                    <span aria-hidden="true" className="text-muted">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  )
}
