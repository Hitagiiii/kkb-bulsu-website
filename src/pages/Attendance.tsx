import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { formatDateTime } from '../lib/announcements'
import { formatDay, PARTICIPATION_TARGET } from '../lib/events'
import { Link } from 'react-router-dom'
import Chip from '../components/Chip'
import { eyebrowClass, subtleButtonClass } from '../components/ui'
import PageHeader from '../components/PageHeader'

interface Mine {
  event_id: string
  checked_in_at: string
  method: string
  events: { title: string; starts_at: string } | null
}
interface Person {
  id: string
  full_name: string
}
interface PastEvent {
  id: string
  title: string
  starts_at: string
}
interface Report {
  people: Person[]
  attendance: { event_id: string; user_id: string }[]
  events: PastEvent[]
}

export default function Attendance() {
  const { profile } = useAuth()
  const isOfficer = hasRole(profile?.role, 'officer')
  const [mine, setMine] = useState<Mine[]>([])
  const [pastEvents, setPastEvents] = useState<PastEvent[]>([])
  const [nextEvent, setNextEvent] = useState<PastEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase
        .from('event_attendance')
        .select('event_id, checked_in_at, method, events(title, starts_at)')
        .eq('user_id', profile.id)
        .order('checked_in_at', { ascending: false }),
      supabase.from('events').select('id, title, starts_at').lt('starts_at', new Date().toISOString()).order('starts_at', { ascending: false }).limit(200),
      supabase.from('events').select('id, title, starts_at').gte('starts_at', new Date().toISOString()).order('starts_at').limit(1),
    ]).then(([a, e, n]) => {
      if (a.error) setError(a.error.message)
      else setMine((a.data ?? []) as unknown as Mine[])
      setPastEvents((e.data ?? []) as PastEvent[])
      setNextEvent(((n.data ?? []) as PastEvent[])[0] ?? null)
      setLoading(false)
    })
  }, [profile])

  useEffect(() => {
    if (!isOfficer) return
    Promise.all([
      supabase.from('profiles').select('id, full_name').eq('approved', true).order('full_name'),
      supabase.from('event_attendance').select('event_id, user_id').limit(5000),
      supabase
        .from('events')
        .select('id, title, starts_at')
        .lt('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: false })
        .limit(500),
    ]).then(([p, a, e]) => {
      if (p.error || a.error || e.error) return setError((p.error ?? a.error ?? e.error)!.message)
      setReport({
        people: (p.data ?? []) as Person[],
        attendance: (a.data ?? []) as Report['attendance'],
        events: (e.data ?? []) as PastEvent[],
      })
    })
  }, [isOfficer])

  const rows = useMemo(() => {
    if (!report) return null
    const past = new Set(report.events.map((e) => e.id))
    const perPerson = new Map<string, number>()
    const perEvent = new Map<string, number>()
    for (const a of report.attendance) {
      if (!past.has(a.event_id)) continue
      perPerson.set(a.user_id, (perPerson.get(a.user_id) ?? 0) + 1)
      perEvent.set(a.event_id, (perEvent.get(a.event_id) ?? 0) + 1)
    }
    return { perPerson, perEvent, total: report.events.length }
  }, [report])

  const presentIds = new Set(mine.map((m) => m.event_id))
  const pastCount = pastEvents.length
  const attendedPast = pastEvents.filter((e) => presentIds.has(e.id)).length
  const rate = pastCount > 0 ? attendedPast / pastCount : 0
  const history = pastEvents.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    present: presentIds.has(e.id),
    checkedIn: mine.find((m) => m.event_id === e.id)?.checked_in_at ?? null,
  }))
  const shownHistory = history.filter((h) => h.title.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="w-full print:max-w-3xl">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Your participation"
          title="Every time you show up."
          subtitle="Your attendance record for AY 2026–2027. Scan the QR code at an event to check in."
          action={isOfficer && report ? (
            <button onClick={() => window.print()} className={subtleButtonClass + ' min-h-11'}>Print report</button>
          ) : undefined}
        />
      </div>

      {error && (
        <p role="alert" className="mt-6 border-l-4 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">
          {error}
        </p>
      )}
      {loading && <p className="mt-8 text-sm text-muted">Loading…</p>}

      {!loading && (
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start print:hidden" aria-label="My attendance">
          <div>
            <div className="rounded-md border border-line bg-white p-5">
              <p className="text-5xl font-medium tabular-nums text-ink">{Math.round(rate * 100)}%</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {attendedPast} of {pastCount} events attended
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rate * 100)} aria-label="Attendance rate">
                <div className="h-full bg-brand-700" style={{ width: `${Math.round(rate * 100)}%` }} />
              </div>
              <p className="mt-3 text-sm text-muted">
                {pastCount === 0
                  ? 'No past events yet. Your record starts at the next one.'
                  : rate >= PARTICIPATION_TARGET
                    ? `You meet the ${PARTICIPATION_TARGET * 100}% participation guideline for active membership.`
                    : `Active membership needs ${PARTICIPATION_TARGET * 100}% participation. Your next event counts.`}
              </p>
            </div>

            <h2 className="mt-8 text-xl font-medium">Event history</h2>
            {history.length > 0 && (
              <div className="mt-3">
                <input aria-label="Search my attendance" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by event" className="min-h-11 w-full rounded-md border border-line bg-white px-3 py-2 text-base sm:max-w-sm sm:text-sm" />
              </div>
            )}
            {history.length === 0 ? (
              <p className="mt-3 rounded-md border border-line bg-white px-4 py-6 text-sm text-muted">No events have happened yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                {shownHistory.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold break-words">{h.title}</p>
                      <p className="text-xs text-muted">
                        {formatDay(h.startsAt)}
                        {h.present && h.checkedIn ? ` · Checked in ${formatDateTime(h.checkedIn)}` : ' · No check-in recorded'}
                      </p>
                    </div>
                    <Chip tone={h.present ? 'green' : 'red'}>{h.present ? 'Present' : 'Absent'}</Chip>
                  </li>
                ))}
              </ul>
            )}
            {history.length > 0 && shownHistory.length === 0 && <p className="py-3 text-sm text-muted">No matching events.</p>}
          </div>

          <aside className="space-y-4">
            {nextEvent && (
              <div className="rounded-md border border-line bg-white p-4">
                <p className={eyebrowClass}>Your next chance to show up</p>
                <p className="mt-2 text-lg font-medium break-words">{nextEvent.title}</p>
                <p className="mt-1 text-xs text-muted">{formatDay(nextEvent.starts_at)}</p>
                <Link to="/events" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">View event &amp; RSVP →</Link>
              </div>
            )}
            <div className="rounded-md border border-line bg-white p-4">
              <p className="text-sm font-semibold">Think a record is missing?</p>
              <p className="mt-1 text-xs text-muted">Contact the attendance officer within 7 school days.</p>
            </div>
          </aside>
        </section>
      )}

      {isOfficer && report && rows && (
        <div id="attendance-report">
          <header className="hidden print:block">
            <p className="text-sm">KKB BULSU</p>
            <h1 className="text-2xl font-bold">Attendance Report</h1>
            <p className="text-sm">Printed on {new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })}</p>
          </header>

          <section className="mt-12 print:mt-6" aria-label="Attendance per member">
            <h2 className="text-xl font-medium">Per member ({rows.total} past events)</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-2 pr-4 font-semibold">Member</th>
                    <th className="py-2 pr-4 font-semibold">Attended</th>
                    <th className="py-2 font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.people.map((p) => {
                    const n = rows.perPerson.get(p.id) ?? 0
                    return (
                      <tr key={p.id} className="border-b border-line break-inside-avoid">
                        <td className="py-2 pr-4 break-words">{p.full_name || 'Unnamed'}</td>
                        <td className="py-2 pr-4 tabular-nums">{n} / {rows.total}</td>
                        <td className="py-2 tabular-nums">{rows.total ? Math.round((n / rows.total) * 100) : 0}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10" aria-label="Attendance per event">
            <h2 className="text-xl font-medium">Per event</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-2 pr-4 font-semibold">Event</th>
                    <th className="py-2 pr-4 font-semibold">Date</th>
                    <th className="py-2 font-semibold">Present</th>
                  </tr>
                </thead>
                <tbody>
                  {report.events.map((e) => (
                    <tr key={e.id} className="border-b border-line break-inside-avoid">
                      <td className="py-2 pr-4 break-words">{e.title}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDay(e.starts_at)}</td>
                      <td className="py-2 tabular-nums">{rows.perEvent.get(e.id) ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

