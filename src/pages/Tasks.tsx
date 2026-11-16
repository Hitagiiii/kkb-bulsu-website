import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { errorMessage, formatDate, todayISO } from '../lib/finance'
import { STATUS_LABEL, type Officer, type Task, type TaskStatus, type MinutesRow } from '../lib/work'
import Chip from '../components/Chip'
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'

export default function Tasks() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [officers, setOfficers] = useState<Officer[]>([])
  const [minutes, setMinutes] = useState<Pick<MinutesRow, 'id' | 'title'>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [onlyMine, setOnlyMine] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [t, o, m] = await Promise.all([
      supabase.from('tasks').select('*').order('due_on', { ascending: true, nullsFirst: false }).limit(500),
      supabase.from('profiles').select('id, full_name').eq('approved', true).in('role', ['officer', 'treasurer', 'admin']).order('full_name'),
      supabase.from('minutes').select('id, title').order('held_at', { ascending: false }).limit(50),
    ])
    const err = t.error ?? o.error ?? m.error
    if (err) setError(err.message)
    else {
      setTasks((t.data ?? []) as Task[])
      setOfficers((o.data ?? []) as Officer[])
      setMinutes((m.data ?? []) as Pick<MinutesRow, 'id' | 'title'>[])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const names = useMemo(() => Object.fromEntries(officers.map((o) => [o.id, o.full_name || 'Unnamed'])), [officers])
  const minutesById = useMemo(() => Object.fromEntries(minutes.map((m) => [m.id, m.title])), [minutes])
  const today = todayISO()

  const mineFilter = (t: Task) => !onlyMine || t.assigned_to === profile?.id
  const open = tasks.filter((t) => t.status !== 'done' && mineFilter(t))
  const done = tasks.filter((t) => t.status === 'done' && mineFilter(t)).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))

  async function setStatus(t: Task, status: TaskStatus) {
    const { error } = await supabase.from('tasks').update({ status }).eq('id', t.id)
    if (error) return setError(errorMessage(error, 'Could not update the task.'))
    await load()
  }

  async function remove(t: Task) {
    const { error } = await supabase.from('tasks').delete().eq('id', t.id)
    setDeleting(null)
    if (error) return setError(errorMessage(error, 'Could not delete the task. Only the person who made it, or an admin, can.'))
    await load()
  }

  function renderTask(t: Task) {
    const overdue = t.status !== 'done' && !!t.due_on && t.due_on < today
    return (
      <li key={t.id} className="py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className={'font-medium break-words ' + (t.status === 'done' ? 'text-slate-500 line-through' : '')}>{t.title}</p>
          <Chip tone={t.status === 'done' ? 'green' : t.status === 'doing' ? 'brand' : 'slate'}>{STATUS_LABEL[t.status]}</Chip>
        </div>
        {t.description && <p className="mt-1 text-sm break-words whitespace-pre-wrap text-slate-600">{t.description}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          <span>{t.assigned_to ? names[t.assigned_to] ?? 'Unknown' : 'Unassigned'}</span>
          {t.due_on && (
            <span className={overdue ? 'font-semibold text-red-700' : ''}>
              {overdue ? 'Overdue: ' : 'Due '}
              {formatDate(t.due_on)}
            </span>
          )}
          {t.minutes_id && minutesById[t.minutes_id] && <span>From: {minutesById[t.minutes_id]}</span>}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {t.status === 'todo' && (
            <button onClick={() => void setStatus(t, 'doing')} className="py-1 font-medium text-brand-700 hover:underline">Start</button>
          )}
          {t.status !== 'done' && (
            <button onClick={() => void setStatus(t, 'done')} className="py-1 font-semibold text-brand-700 hover:underline">Mark done</button>
          )}
          {t.status === 'doing' && (
            <button onClick={() => void setStatus(t, 'todo')} className="py-1 text-slate-600 hover:underline">Back to to-do</button>
          )}
          {t.status === 'done' && (
            <button onClick={() => void setStatus(t, 'todo')} className="py-1 text-slate-600 hover:underline">Reopen</button>
          )}
          {deleting === t.id ? (
            <>
              <span className="text-slate-700">Delete this task?</span>
              <button onClick={() => void remove(t)} className="py-1 font-semibold text-red-700 hover:underline">Yes, delete</button>
              <button onClick={() => setDeleting(null)} className="py-1 text-slate-600 hover:underline">Cancel</button>
            </>
          ) : (
            <button onClick={() => setDeleting(t.id)} className="py-1 text-slate-600 hover:text-red-700 hover:underline">Delete</button>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Tasks</h1>
          <p className="mt-2 text-slate-600">Who is doing what, and by when.</p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className={subtleButtonClass}>Add a task</button>
        )}
      </div>

      {error && <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {creating && (
        <TaskForm
          officers={officers}
          minutes={minutes}
          defaultAssignee={profile?.id ?? ''}
          onDone={async () => {
            setCreating(false)
            await load()
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <label className="mt-8 flex items-center gap-2 py-1 text-sm text-slate-700">
        <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
        Show only my tasks
      </label>

      {loading && <p className="mt-6 text-sm text-slate-500">Loading tasks…</p>}

      {!loading && (
        <>
          <section className="mt-6" aria-label="Open tasks">
            <h2 className="font-display text-xl font-semibold">Open ({open.length})</h2>
            {open.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">Nothing open. Nice.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">{open.map(renderTask)}</ul>
            )}
          </section>

          {done.length > 0 && (
            <section className="mt-8" aria-label="Finished tasks">
              <button onClick={() => setShowDone((s) => !s)} aria-expanded={showDone} className="font-display py-1 text-lg font-semibold">
                Done ({done.length}) {showDone ? '(hide)' : '(show)'}
              </button>
              {showDone && <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">{done.map(renderTask)}</ul>}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function TaskForm({
  officers,
  minutes,
  defaultAssignee,
  onDone,
  onCancel,
}: {
  officers: Officer[]
  minutes: Pick<MinutesRow, 'id' | 'title'>[]
  defaultAssignee: string
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState(defaultAssignee)
  const [due, setDue] = useState('')
  const [minutesId, setMinutesId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Describe the task.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      description: description.trim() || null,
      assigned_to: assignee || null,
      due_on: due || null,
      minutes_id: minutesId || null,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not add the task.'))
    await onDone()
  }

  return (
    <form onSubmit={submit} className="mt-8 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">New task</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="t-title" className="text-sm font-medium">Task</label>
          <input id="t-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Prepare the tarpaulin" className={inputClass} />
        </div>
        <div>
          <label htmlFor="t-who" className="text-sm font-medium">Assigned to</label>
          <select id="t-who" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputClass}>
            <option value="">Unassigned</option>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>{o.full_name || 'Unnamed'}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="t-due" className="text-sm font-medium">Due date (optional)</label>
          <input id="t-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
        </div>
        {minutes.length > 0 && (
          <div className="sm:col-span-2">
            <label htmlFor="t-min" className="text-sm font-medium">From meeting (optional)</label>
            <select id="t-min" value={minutesId} onChange={(e) => setMinutesId(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {minutes.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="t-desc" className="text-sm font-medium">Details (optional)</label>
          <textarea id="t-desc" rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto sm:min-w-40">
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Add task'}</button>
        </div>
        <button type="button" onClick={onCancel} className="py-2 text-sm text-slate-600 hover:underline">Cancel</button>
      </div>
    </form>
  )
}
