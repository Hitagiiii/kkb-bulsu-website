import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { errorMessage, peso, type Budget } from '../lib/finance'
import { formatEventTime } from '../lib/announcements'
import type { EventRow } from '../lib/events'

type EventOption = Pick<EventRow, 'id' | 'title' | 'starts_at'>

/** Links a budget to an event and shows the headcount next to the money. */
export default function BudgetEventLink({ budget, spent, canEdit, onChanged }: { budget: Budget; spent: number; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [events, setEvents] = useState<EventOption[]>([])
  const [going, setGoing] = useState<number | null>(null)
  const [attended, setAttended] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const eventId = budget.event_id

  const load = useCallback(async () => {
    const { data } = await supabase.from('events').select('id, title, starts_at').order('starts_at', { ascending: false }).limit(100)
    setEvents((data ?? []) as EventOption[])
    if (!eventId) {
      setGoing(null)
      setAttended(null)
      return
    }
    const [g, a] = await Promise.all([
      supabase.rpc('get_event_going', { p_event: eventId }),
      supabase.from('event_attendance').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    ])
    setGoing(Number(g.data ?? 0))
    setAttended(a.count ?? 0)
  }, [eventId])

  useEffect(() => { void load() }, [load])

  async function link(id: string) {
    setError(null)
    const { error } = await supabase.from('budgets').update({ event_id: id || null }).eq('id', budget.id)
    if (error) return setError(errorMessage(error, 'Could not link the event.'))
    await onChanged()
  }

  const linked = events.find((e) => e.id === eventId) ?? null
  if (!canEdit && !linked) return null

  return (
    <section aria-label="Linked event" className="rounded-md border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700">Event context</p><h2 className="mt-1 text-base font-semibold">Linked event</h2><p className="mt-1 text-xs text-muted">Connect this budget to an event to compare planned and actual attendance costs.</p></div>
        {linked && <Link to="/events" className="min-h-11 py-2 text-sm font-semibold text-brand-700 hover:underline">Open event</Link>}
      </div>

      {linked ? (
        <div className="mt-2 text-sm">
          <p><Link to="/events" className="font-medium text-brand-700 hover:underline">{linked.title}</Link> <span className="text-muted">({formatEventTime(linked.starts_at)})</span></p>
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            <div className="bg-paper p-3 sm:p-4"><dt className="text-xs text-muted">Going</dt><dd className="text-xl font-medium tabular-nums">{going ?? '…'}</dd></div>
            <div className="bg-paper p-3 sm:p-4"><dt className="text-xs text-muted">Checked in</dt><dd className="text-xl font-medium tabular-nums">{attended ?? '…'}</dd></div>
            <div className="bg-paper p-3 sm:p-4"><dt className="text-xs text-muted">Budget per going</dt><dd className="text-xl font-medium tabular-nums">{going ? peso(budget.total_budget / going) : '-'}</dd></div>
            <div className="bg-paper p-3 sm:p-4"><dt className="text-xs text-muted">Spent per attendee</dt><dd className="text-xl font-medium tabular-nums">{attended ? peso(spent / attended) : '-'}</dd></div>
          </dl>
        </div>
      ) : <p className="mt-2 text-sm text-muted">This budget is not tied to an event yet.</p>}

      {canEdit && (
        <div className="mt-4 border-t border-line pt-4">
          <label htmlFor="link-event" className="text-sm font-medium">Event</label>
          <select id="link-event" value={eventId ?? ''} onChange={(e) => void link(e.target.value)} className="mt-2 block min-h-11 w-full rounded-md border border-line bg-paper px-3 py-2.5 text-base sm:text-sm">
            <option value="">No linked event</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title} ({new Date(e.starts_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })})</option>)}
          </select>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-brand-700">{error}</p>}
    </section>
  )
}
