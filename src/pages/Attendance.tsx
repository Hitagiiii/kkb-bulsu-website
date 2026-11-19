import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { formatDateTime } from '../lib/announcements'
import { formatDay } from '../lib/events'
import { subtleButtonClass } from '../components/ui'

interface Mine {
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
  const [pastCount, setPastCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase
        .from('event_attendance')
        .select('checked_in_at, method, events(title, starts_at)')
        .eq('user_id', profile.id)
        .order('checked_in_at', { ascending: false }),
      supabase.from('events').select('id', { count: 'exact', head: true }).lt('starts_at', new Date().toISOString()),
    ]).then(([a, e]) => {
      if (a.error) setError(a.error.message)
      else setMine((a.data ?? []) as unknown as Mine[])
      setPastCount(e.count ?? 0)
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

  const attendedPast = mine.filter((m) => m.events && new Date(m.events.starts_at).getTime() < Date.now()).length
  const shownMine = mine.filter((m) => (m.events?.title ?? 'Event removed').toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="max-w-4xl print:max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Attendance</h1>
          <p className="mt-1 text-sm text-slate-600">Scan the QR code at an event to check in.</p>
        </div>
        {isOfficer && report && (
          <button onClick={() => window.print()} className={subtleButtonClass + ' min-h-11'}>
            Print report
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {loading && <p className="mt-8 text-sm text-slate-500">Loading…</p>}

      {!loading && (
        <section className="mt-8 print:hidden" aria-label="My attendance">
          <h2 className="font-display text-xl font-semibold">My attendance</h2>
          <p className="mt-1 text-sm text-slate-600">
            {attendedPast} of {pastCount} past events attended.
          </p>
          {mine.length > 0 && (
            <div className="mt-3">
              <input aria-label="Search my attendance" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by event" className="min-h-11 w-full rounded-none border border-slate-300 bg-white px-3 py-2 text-base sm:max-w-sm sm:text-sm" />
            </div>
          )}
          {mine.length === 0 ? (
            <p className="mt-3 border-y border-slate-200 py-4 text-sm text-slate-500">
              No check-ins yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
              {shownMine.map((m, i) => (
                <li key={i} className="py-3">
                  <p className="font-medium break-words">{m.events?.title ?? 'Event removed'}</p>
                  <p className="text-sm text-slate-500">
                    {m.events && formatDay(m.events.starts_at)}, checked in {formatDateTime(m.checked_in_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {mine.length > 0 && shownMine.length === 0 && <p className="py-3 text-sm text-slate-500">No matching events.</p>}
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
            <h2 className="font-display text-xl font-semibold">Per member ({rows.total} past events)</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="py-2 pr-4 font-semibold">Member</th>
                    <th className="py-2 pr-4 font-semibold">Attended</th>
                    <th className="py-2 font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.people.map((p) => {
                    const n = rows.perPerson.get(p.id) ?? 0
                    return (
                      <tr key={p.id} className="border-b border-slate-200 break-inside-avoid">
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
            <h2 className="font-display text-xl font-semibold">Per event</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="py-2 pr-4 font-semibold">Event</th>
                    <th className="py-2 pr-4 font-semibold">Date</th>
                    <th className="py-2 font-semibold">Present</th>
                  </tr>
                </thead>
                <tbody>
                  {report.events.map((e) => (
                    <tr key={e.id} className="border-b border-slate-200 break-inside-avoid">
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

