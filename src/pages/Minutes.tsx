import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { errorMessage, formatDate } from '../lib/finance'
import { formatDateTime } from '../lib/announcements'
import { STATUS_LABEL, type MinutesRow, type Officer, type Task } from '../lib/work'
import Chip from '../components/Chip'
import Linkify from '../components/Linkify'
import { buttonClass, eyebrowClass, inputClass, subtleButtonClass } from '../components/ui'
import PageHeader from '../components/PageHeader'

export default function Minutes() {
  const { profile } = useAuth()
  const canWrite = hasRole(profile?.role, 'officer')
  const [rows, setRows] = useState<MinutesRow[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [officers, setOfficers] = useState<Officer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const m = await supabase.from('minutes').select('*').order('held_at', { ascending: false }).limit(100)
    if (m.error) {
      setError(m.error.message)
      setLoading(false)
      return
    }
    setRows((m.data ?? []) as MinutesRow[])
    if (canWrite) {
      const [t, o] = await Promise.all([
        supabase.from('tasks').select('*').not('minutes_id', 'is', null),
        supabase.from('profiles').select('id, full_name').eq('approved', true).in('role', ['officer', 'treasurer', 'admin']).order('full_name'),
      ])
      setTasks((t.data ?? []) as Task[])
      setOfficers((o.data ?? []) as Officer[])
    }
    setError(null)
    setLoading(false)
  }, [canWrite])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(r: MinutesRow) {
    const { error } = await supabase.from('minutes').delete().eq('id', r.id)
    setDeleting(null)
    if (error) return setError(errorMessage(error, 'Could not delete the minutes.'))
    setOpenId(null)
    await load()
  }

  const names = Object.fromEntries(officers.map((o) => [o.id, o.full_name || 'Unnamed']))
  const q = search.trim().toLowerCase()
  const shown = rows.filter((r) => !q || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q))

  return (
    <div className="w-full">
      <PageHeader
        eyebrow="Decisions, documented"
        title="On the same page."
        subtitle="Meeting notes, decisions and the people moving them forward."
        action={canWrite && !creating ? (
          <button onClick={() => setCreating(true)} className={subtleButtonClass + ' min-h-11'}>Write minutes</button>
        ) : undefined}
      />

      {error && <p role="alert" className="mt-6 border-l-2 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}

      {canWrite && creating && (
        <MinutesForm
          officers={officers}
          onDone={async () => {
            setCreating(false)
            await load()
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="mt-4">
        <input aria-label="Search meeting minutes" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search minutes" className="min-h-11 w-full rounded-md border border-line bg-white px-3 py-2 text-base sm:max-w-sm sm:text-sm" />
      </div>
      {loading && <p className="mt-6 text-sm text-muted">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="mt-8 rounded-md border border-dashed border-line px-4 py-6 text-sm text-muted">
          {canWrite ? 'No minutes yet. Write the first one above.' : 'No minutes have been shared with members yet.'}
        </p>
      )}

      {!loading && shown.length === 0 && rows.length > 0 && <p className="mt-5 border border-line bg-white px-4 py-6 text-sm text-muted">No minutes match.</p>}
      {!loading && shown.length > 0 && (
        <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,34rem)]">
          <section aria-label="Meeting list">
            <div className="border-y border-line bg-white">
              {shown.map((r) => {
                const open = openId === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setOpenId(r.id)}
                    aria-expanded={open}
                    className={'block min-h-11 w-full border-b border-line px-4 py-4 text-left last:border-b-0 hover:bg-paper ' + (open ? 'bg-paper' : '')}
                  >
                    <span className="block text-base font-semibold break-words text-ink">{r.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                      {formatDateTime(r.held_at)}
                      {canWrite && <Chip tone={r.visible_to_members ? 'green' : 'slate'}>{r.visible_to_members ? 'Shared with members' : 'Officers only'}</Chip>}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <aside className="border border-line bg-white p-4 sm:p-5 lg:sticky lg:top-6" aria-label="Selected meeting details">
            {(() => {
              const r = shown.find((item) => item.id === openId) ?? shown[0]
              const related = tasks.filter((t) => t.minutes_id === r.id)
              return (
                <>
                  <p className={eyebrowClass}>{r.visible_to_members ? 'Approved / shared' : 'Officer notes'} · {formatDate(r.held_at)}</p>
                  <h2 className="mt-1 text-xl font-medium break-words">{r.title}</h2>
                  <p className="mt-1 text-sm text-muted">{formatDateTime(r.held_at)}</p>
                  {r.attendees && (
                    <p className="mt-4 text-sm text-umber"><span className="font-medium text-ink">Present:</span> {r.attendees}</p>
                  )}
                  <div className="mt-4 border-t border-line pt-4">
                    <p className="break-words whitespace-pre-wrap leading-6"><Linkify text={r.body} /></p>
                    <p className="mt-4 text-xs text-muted">Recorded by {r.author_name || 'an officer'}</p>
                  </div>

                  {related.length > 0 && (
                    <div className="mt-5 border-t border-line pt-4">
                      <h3 className="text-sm font-semibold">Decisions &amp; action items</h3>
                      <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
                        {related.map((t) => (
                          <li key={t.id} className="py-3">
                            <p className="font-medium break-words text-ink">{t.title}</p>
                            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                              <span>{t.assigned_to ? names[t.assigned_to] ?? 'Unknown' : 'Unassigned'}</span>
                              {t.due_on && <span>Due {formatDate(t.due_on)}</span>}
                              <Chip tone={t.status === 'done' ? 'green' : 'slate'}>{STATUS_LABEL[t.status]}</Chip>
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {canWrite && (
                    <div className="mt-4">
                      {deleting === r.id ? (
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="text-ink">Delete these minutes for good?</span>
                          <button onClick={() => void remove(r)} className="min-h-11 font-semibold text-brand-700 hover:underline">Yes, delete</button>
                          <button onClick={() => setDeleting(null)} className="min-h-11 text-umber hover:underline">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setDeleting(r.id)} className="min-h-11 text-sm text-umber hover:text-brand-700 hover:underline">Delete</button>
                      )}
                    </div>
                  )}
                </>
              )
            })()}
          </aside>
        </div>
      )}
    </div>
  )
}

function MinutesForm({
  officers,
  onDone,
  onCancel,
}: {
  officers: Officer[]
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const nextId = useRef(2)
  const [title, setTitle] = useState('')
  const [heldAt, setHeldAt] = useState(() => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  })
  const [attendees, setAttendees] = useState('')
  const [body, setBody] = useState('')
  const [shared, setShared] = useState(false)
  const [items, setItems] = useState([{ id: 1, title: '', who: '', due: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Add a title, for example "General meeting, November".')
    if (!body.trim()) return setError('Write what was discussed and decided.')
    const held = new Date(heldAt)
    if (Number.isNaN(held.getTime())) return setError('The meeting date is not valid.')

    setBusy(true)
    setError(null)
    const { data, error } = await supabase
      .from('minutes')
      .insert({
        title: title.trim(),
        held_at: held.toISOString(),
        attendees: attendees.trim(),
        body: body.trim(),
        visible_to_members: shared,
      })
      .select('id')
      .single()
    if (error) {
      setBusy(false)
      return setError(errorMessage(error, 'Could not save the minutes.'))
    }

    const actions = items.filter((i) => i.title.trim())
    if (actions.length > 0) {
      const { error: taskError } = await supabase.from('tasks').insert(
        actions.map((i) => ({
          title: i.title.trim(),
          assigned_to: i.who || null,
          due_on: i.due || null,
          minutes_id: data.id,
        })),
      )
      if (taskError) {
        setBusy(false)
        return setError('The minutes were saved, but the action items were not: ' + errorMessage(taskError, 'unknown error') + ' Add them from the Tasks page.')
      }
    }
    setBusy(false)
    await onDone()
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-md border border-line bg-white p-4 sm:p-6">
      <h2 className="text-xl font-medium">New minutes</h2>
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="m-title" className="text-sm font-medium">Title</label>
          <input id="m-title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="m-date" className="text-sm font-medium">When was the meeting</label>
          <input id="m-date" type="datetime-local" value={heldAt} onChange={(e) => setHeldAt(e.target.value)} className={inputClass + ' sm:max-w-xs'} />
        </div>
        <div>
          <label htmlFor="m-att" className="text-sm font-medium">Who was present (optional)</label>
          <input id="m-att" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Names, separated by commas" className={inputClass} />
        </div>
        <div>
          <label htmlFor="m-body" className="text-sm font-medium">Discussion and decisions</label>
          <textarea id="m-body" rows={8} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)} className={inputClass + ' min-h-40'} />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Action items (optional)</legend>
          <ul className="mt-1 space-y-3">
            {items.map((i, n) => (
              <li key={i.id} className="grid gap-2 sm:grid-cols-[1fr_11rem_9rem_auto] sm:items-center">
                <input
                  aria-label={`Action item ${n + 1}`}
                  value={i.title}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, title: e.target.value } : x)))}
                  placeholder="What needs to be done"
                  className="min-w-0 rounded-md border border-line px-3 py-2.5 text-base sm:py-2 sm:text-sm"
                />
                <select
                  aria-label="Assigned to"
                  value={i.who}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, who: e.target.value } : x)))}
                  className="rounded-md border border-line bg-white px-2 py-2.5 text-base sm:py-2 sm:text-sm"
                >
                  <option value="">Unassigned</option>
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>{o.full_name || 'Unnamed'}</option>
                  ))}
                </select>
                <input
                  aria-label="Due date"
                  type="date"
                  value={i.due}
                  onChange={(e) => setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, due: e.target.value } : x)))}
                  className="rounded-md border border-line px-2 py-2.5 text-base sm:py-2 sm:text-sm"
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))}
                    aria-label={`Remove action item ${n + 1}`}
                    className="rounded-md px-2 py-2 text-left text-sm text-umber hover:bg-paper hover:text-brand-700"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, { id: nextId.current++, title: '', who: '', due: '' }])}
            className="min-h-11 mt-2 py-2 text-sm font-medium text-brand-700 hover:underline"
          >
            Add another action item
          </button>
        </fieldset>

        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share these minutes with all members (otherwise officers only)
        </label>
      </div>

      {error && <p role="alert" className="mt-4 border-l-2 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto sm:min-w-44">
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save minutes'}</button>
        </div>
        <button type="button" onClick={onCancel} className="py-2 text-sm text-umber hover:underline">Cancel</button>
      </div>
    </form>
  )
}

