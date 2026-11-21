import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { errorMessage, peso } from '../lib/finance'
import { formatDateTime } from '../lib/announcements'
import type { EventRow } from '../lib/events'
import { downloadQrPoster } from '../lib/qrPoster'
import { inputClass, subtleButtonClass } from './ui'

type Rsvp = 'going' | 'not_going'

/** RSVP for everyone. QR code, attendance and budget link for officers. */
export default function EventExtras({ event, canEdit, over }: { event: EventRow; canEdit: boolean; over: boolean }) {
  const { profile } = useAuth()
  const [capacity, setCapacity] = useState<number | null>(null)
  const [going, setGoing] = useState(0)
  const [mine, setMine] = useState<Rsvp | null>(null)
  const [attended, setAttended] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    const [c, g, m, a] = await Promise.all([
      supabase.from('events').select('capacity').eq('id', event.id).maybeSingle(),
      supabase.rpc('get_event_going', { p_event: event.id }),
      supabase.from('event_rsvps').select('status').eq('event_id', event.id).eq('user_id', profile.id).maybeSingle(),
      supabase.from('event_attendance').select('id').eq('event_id', event.id).eq('user_id', profile.id).maybeSingle(),
    ])
    setCapacity((c.data as { capacity: number | null } | null)?.capacity ?? null)
    setGoing(Number(g.data ?? 0))
    setMine((m.data as { status: Rsvp } | null)?.status ?? null)
    setAttended(!!a.data)
  }, [event.id, profile])

  useEffect(() => {
    void load()
  }, [load])

  async function answer(status: Rsvp) {
    if (!profile) return
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('event_rsvps')
      .upsert({ event_id: event.id, user_id: profile.id, status }, { onConflict: 'event_id,user_id' })
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not save your answer.'))
    await load()
  }

  const full = capacity !== null && going >= capacity && mine !== 'going'

  return (
    <div className="mt-6 border-t border-line pt-5">
      {attended && (
        <p className="mb-4 border border-success-pale bg-success-pale px-3 py-3 text-sm font-medium text-success-deep">
          You are checked in for this event.
        </p>
      )}

      <p className="text-sm text-muted">
        {going} going{capacity !== null && ` of ${capacity} spots`}
      </p>

      {!over && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || full}
            aria-pressed={mine === 'going'}
            onClick={() => void answer('going')}
            className={
              'min-h-11 rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ' +
              (mine === 'going' ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:bg-paper')
            }
          >
            {full ? 'Event is full' : "I'm going"}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={mine === 'not_going'}
            onClick={() => void answer('not_going')}
            className={
              'min-h-11 rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ' +
              (mine === 'not_going' ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:bg-paper')
            }
          >
            Can't make it
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-brand-700">
          {error}
        </p>
      )}

      {canEdit && (
        <OfficerPanel event={event} going={going} capacity={capacity} showBudget={profile?.role === 'treasurer'} onChanged={load} />
      )}
    </div>
  )
}

/* ---------- officers: capacity, QR, attendance, budget ---------- */
interface Person {
  id: string
  full_name: string
}
interface AttendanceRow {
  id: string
  user_id: string
  method: string
  checked_in_at: string
}
interface BudgetLine {
  budget_id: string
  name: string
  total_budget: number
  total_spent: number
}

function OfficerPanel({
  event,
  going,
  capacity,
  showBudget,
  onChanged,
}: {
  event: EventRow
  going: number
  capacity: number | null
  showBudget: boolean
  onChanged: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [rsvps, setRsvps] = useState<{ user_id: string; status: Rsvp }[]>([])
  const [budgets, setBudgets] = useState<BudgetLine[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [qr, setQr] = useState('')
  const [capText, setCapText] = useState(capacity === null ? '' : String(capacity))
  const [pick, setPick] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const link = token ? `${window.location.origin}/attend/${token}` : ''

  const load = useCallback(async () => {
    const [t, a, r, p, b] = await Promise.all([
      supabase.from('event_tokens').select('token').eq('event_id', event.id).maybeSingle(),
      supabase.from('event_attendance').select('id, user_id, method, checked_in_at').eq('event_id', event.id).order('checked_in_at'),
      supabase.from('event_rsvps').select('user_id, status').eq('event_id', event.id),
      supabase.from('profiles').select('id, full_name').eq('approved', true).order('full_name'),
      supabase.from('budget_summary').select('budget_id, name, total_budget, total_spent').eq('event_id', event.id),
    ])
    setToken((t.data as { token: string } | null)?.token ?? null)
    setAttendance((a.data ?? []) as AttendanceRow[])
    setRsvps((r.data ?? []) as { user_id: string; status: Rsvp }[])
    setPeople((p.data ?? []) as Person[])
    setBudgets((b.data ?? []) as BudgetLine[])
  }, [event.id])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  useEffect(() => {
    if (!link) return
    let cancelled = false
    QRCode.toDataURL(link, { width: 280, margin: 1 }).then((url) => {
      if (!cancelled) setQr(url)
    })
    return () => {
      cancelled = true
    }
  }, [link])

  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.full_name || 'Unnamed'])), [people])
  const attendedIds = new Set(attendance.map((a) => a.user_id))
  const goingRows = rsvps.filter((r) => r.status === 'going')
  const goingNames = goingRows.map((r) => names[r.user_id] ?? 'Unknown')
  const notYetIn = goingRows.filter((r) => !attendedIds.has(r.user_id)).length

  async function saveCapacity() {
    const n = capText.trim() === '' ? null : Math.floor(Number(capText))
    if (n !== null && !(n > 0)) return setNote('Enter a number greater than zero, or leave it empty for no limit.')
    const { error } = await supabase.from('events').update({ capacity: n }).eq('id', event.id)
    if (error) return setNote(errorMessage(error, 'Could not save the limit.'))
    setNote('Saved.')
    await onChanged()
  }

  async function resetCode() {
    const { error } = await supabase.rpc('reset_event_token', { p_event: event.id })
    if (error) return setNote(errorMessage(error, 'Could not make a new code.'))
    setNote('New QR code made. The old one no longer works.')
    await load()
  }

  async function addManual() {
    if (!pick) return
    const { error } = await supabase.from('event_attendance').insert({ event_id: event.id, user_id: pick, method: 'manual' })
    if (error) return setNote(errorMessage(error, 'Could not add this person.'))
    setPick('')
    setNote(null)
    await load()
  }

  async function removeRow(id: string) {
    const { error } = await supabase.from('event_attendance').delete().eq('id', id)
    if (error) return setNote(errorMessage(error, 'Could not remove this person.'))
    await load()
  }

  async function downloadQr() {
    try {
      await downloadQrPoster(link, event.title, formatDateTime(event.starts_at))
    } catch {
      setNote('Could not make the QR image. Try again.')
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setNote('Could not copy. Select the link and copy it by hand.')
    }
  }

  return (
    <div className="mt-6 border border-line bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="font-display min-h-11 py-2 text-lg font-semibold"
      >
        Attendance and headcount {open ? '(hide)' : '(show)'}
      </button>

      {open && (
        <div className="mt-4 space-y-6">
          {note && <p className="text-sm text-ink">{note}</p>}

          <section aria-label="QR check-in">
            <h3 className="text-sm font-semibold">QR check-in</h3>
            <p className="mt-1 text-xs text-muted">
              Show this at the entrance. Members scan it with their phone camera and sign in if asked. It works from 2
              hours before the event until 2 hours after it ends.
            </p>
            {qr ? (
              <img src={qr} alt="QR code for event check-in" className="mt-3 h-56 w-56 border border-line bg-white" />
            ) : (
              <p className="mt-3 text-sm text-muted">Making the QR code…</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void downloadQr()} disabled={!link} className={subtleButtonClass + ' min-h-11'}>
                Download QR (PNG)
              </button>
              <button type="button" onClick={() => void copy()} className={subtleButtonClass + ' min-h-11'}>
                {copied ? 'Copied' : 'Copy check-in link'}
              </button>
              <button type="button" onClick={() => void resetCode()} className={subtleButtonClass + ' min-h-11'}>
                Make a new code
              </button>
            </div>
          </section>

          <section aria-label="Attendance">
            <h3 className="text-sm font-semibold">
              Checked in ({attendance.length}), going ({going}){notYetIn > 0 && `, ${notYetIn} going but not in yet`}
            </h3>
            {attendance.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No one has checked in yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line bg-white bg-white text-sm">
                {attendance.map((a) => (
                  <li key={a.id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 break-words">
                      {names[a.user_id] ?? 'Unknown'}
                      <span className="ml-2 text-xs text-muted">
                        {formatDateTime(a.checked_in_at)}
                        {a.method === 'manual' && ' (added by an officer)'}
                      </span>
                    </span>
                    <button type="button" onClick={() => void removeRow(a.id)} className="min-h-11 shrink-0 px-2 text-xs text-umber hover:text-brand-700 hover:underline">
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                aria-label="Add a member who could not scan"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-2.5 text-base sm:text-sm"
              >
                <option value="">Add someone who could not scan…</option>
                {people
                  .filter((p) => !attendedIds.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || 'Unnamed'}
                    </option>
                  ))}
              </select>
              <button type="button" disabled={!pick} onClick={() => void addManual()} className={subtleButtonClass + ' min-h-11'}>
                Add
              </button>
            </div>
          </section>

          <section aria-label="Who is going">
            <h3 className="text-sm font-semibold">RSVP list ({goingNames.length} going)</h3>
            {goingNames.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No one has said they are going yet.</p>
            ) : (
              <p className="mt-2 text-sm break-words text-ink">{goingNames.join(', ')}</p>
            )}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor={`cap-${event.id}`} className="text-xs text-muted">Limit (leave empty for no limit)</label>
                <input
                  id={`cap-${event.id}`}
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={capText}
                  onChange={(e) => setCapText(e.target.value)}
                  className={inputClass + ' w-32'}
                />
              </div>
              <button type="button" onClick={() => void saveCapacity()} className={subtleButtonClass + ' min-h-11'}>
                Save limit
              </button>
            </div>
          </section>

          {showBudget && (
          <section aria-label="Budget">
            <h3 className="text-sm font-semibold">Budget for this event</h3>
            {budgets.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No budget is linked. The treasurer can link one from the budget page.
              </p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {budgets.map((b) => (
                  <li key={b.budget_id} className="border border-line bg-white px-3 py-3">
                    <Link to={`/finance/${b.budget_id}`} className="font-medium text-brand-700 hover:underline">
                      {b.name}
                    </Link>
                    <p className="text-umber">
                      {peso(b.total_spent)} spent of {peso(b.total_budget)}
                      {going > 0 && `, about ${peso(b.total_budget / going)} per person going`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          )}
        </div>
      )}
    </div>
  )
}

