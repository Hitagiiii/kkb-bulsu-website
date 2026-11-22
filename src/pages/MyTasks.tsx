import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { buttonClass, cardClass, inputClass, subtleButtonClass } from '../components/ui'

type PersonalTask = {
  id: string
  owner_id: string
  title: string
  description: string | null
  due_on: string | null
  is_completed: boolean
  created_at: string
  completed_at: string | null
}

type ProfileName = { id: string; full_name: string }

const today = () => new Date().toLocaleDateString('en-CA')
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function MyTasks() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [profiles, setProfiles] = useState<ProfileName[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [showCompleted, setShowCompleted] = useState(true)
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDueOn, setEditDueOn] = useState('')

  const load = useCallback(async () => {
    if (!profile?.id) return
    const query = supabase.from('personal_todos').select('*').order('created_at', { ascending: false })
    const { data, error: loadError } = await query
    if (loadError) setError(loadError.message)
    else {
      setTasks((data ?? []) as PersonalTask[])
      setError(null)
    }
    if (isAdmin) {
      const { data: people, error: peopleError } = await supabase.from('profiles').select('id, full_name').eq('approved', true).order('full_name')
      if (peopleError) setError(peopleError.message)
      else setProfiles((people ?? []) as ProfileName[])
    }
    setLoading(false)
  }, [profile?.id, isAdmin])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase.channel(`personal-todos-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_todos' }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [profile?.id, load])

  const visibleTasks = useMemo(() => tasks.filter((task) =>
    (isAdmin ? ownerFilter === 'all' || task.owner_id === ownerFilter : task.owner_id === profile?.id) &&
    (showCompleted || !task.is_completed),
  ), [tasks, isAdmin, ownerFilter, profile?.id, showCompleted])
  const openCount = visibleTasks.filter((task) => !task.is_completed).length
  const doneCount = visibleTasks.filter((task) => task.is_completed).length
  const totalCount = openCount + doneCount
  const progress = totalCount ? Math.round((doneCount / totalCount) * 100) : 0
  const names = useMemo(() => Object.fromEntries(profiles.map((person) => [person.id, person.full_name || 'Unnamed member'])), [profiles])

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile?.id || !title.trim()) return
    setSaving(true)
    const { error: insertError } = await supabase.from('personal_todos').insert({
      owner_id: profile.id,
      title: title.trim(),
      description: description.trim() || null,
      due_on: dueOn || null,
    })
    setSaving(false)
    if (insertError) return setError(insertError.message)
    setTitle(''); setDescription(''); setDueOn(''); setShowForm(false)
    await load()
  }

  async function toggleTask(task: PersonalTask) {
    const next = !task.is_completed
    const { error: updateError } = await supabase.from('personal_todos').update({ is_completed: next, completed_at: next ? new Date().toISOString() : null }).eq('id', task.id)
    if (updateError) setError(updateError.message)
    else await load()
  }

  function beginEdit(task: PersonalTask) {
    setEditing(task.id); setEditTitle(task.title); setEditDescription(task.description ?? ''); setEditDueOn(task.due_on ?? '')
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, task: PersonalTask) {
    event.preventDefault()
    const { error: updateError } = await supabase.from('personal_todos').update({ title: editTitle.trim(), description: editDescription.trim() || null, due_on: editDueOn || null }).eq('id', task.id)
    if (updateError) setError(updateError.message)
    else { setEditing(null); await load() }
  }

  async function deleteTask(task: PersonalTask) {
    if (!window.confirm(`Delete “${task.title}”?`)) return
    const { error: deleteError } = await supabase.from('personal_todos').delete().eq('id', task.id)
    if (deleteError) setError(deleteError.message)
    else await load()
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        eyebrow={isAdmin ? 'Personal workspace · Admin view' : 'Personal workspace'}
        title={isAdmin ? 'Personal to-do lists' : 'My To-Do List'}
        subtitle={isAdmin ? 'Review members’ personal tasks. Changes remain private to each task owner.' : 'A little space for your own plans, reminders and everyday priorities.'}
        action={!isAdmin ? <button type="button" onClick={() => setShowForm((value) => !value)} className={buttonClass + ' min-h-11 w-auto'}>{showForm ? 'Close' : '+ New task'}</button> : undefined}
      />

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {!isAdmin && (
        <section className={`${cardClass} p-4 sm:p-5`} aria-label="Task progress">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-semibold text-ink">Your progress</p><p className="mt-1 text-xs text-muted">Every small step counts.</p></div>
            <p className="text-sm font-semibold tabular-nums text-brand-700">{doneCount} of {totalCount} completed</p>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Task completion">
            <div className="h-full rounded-full bg-brand-700 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted"><span>{openCount} remaining</span><span>{progress}% complete</span></div>
        </section>
      )}

      {showForm && !isAdmin && (
        <form onSubmit={(event) => void addTask(event)} className={`${cardClass} space-y-3 p-4 sm:p-5`}>
          <div><label htmlFor="todo-title" className="text-sm font-semibold text-ink">Task title</label><input id="todo-title" required maxLength={160} autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you need to get done?" className={inputClass} /></div>
          <div><label htmlFor="todo-description" className="text-sm font-semibold text-ink">Description <span className="font-normal text-muted">(optional)</span></label><textarea id="todo-description" rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a few details or a reminder…" className={inputClass} /></div>
          <div className="max-w-xs"><label htmlFor="todo-due" className="text-sm font-semibold text-ink">Due date <span className="font-normal text-muted">(optional)</span></label><input id="todo-due" type="date" min={today()} value={dueOn} onChange={(event) => setDueOn(event.target.value)} className={inputClass} /></div>
          <div className="flex flex-wrap justify-end gap-2 pt-1"><button type="button" onClick={() => setShowForm(false)} className={subtleButtonClass}>Cancel</button><button type="submit" disabled={saving || !title.trim()} className={buttonClass + ' w-auto'}>{saving ? 'Saving…' : 'Add task'}</button></div>
        </form>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white p-4">
          <div><p className="text-sm font-semibold text-ink">Member task overview</p><p className="mt-1 text-xs text-muted">Admin access is view-only. Members manage their own tasks.</p></div>
          <select aria-label="Filter tasks by member" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="min-h-11 rounded-md border border-line bg-white px-3 text-sm text-ink"><option value="all">All members</option>{profiles.map((person) => <option key={person.id} value={person.id}>{person.full_name || 'Unnamed member'}</option>)}</select>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-ink">{isAdmin ? 'Tasks' : 'Your tasks'}</h2><p className="mt-1 text-sm text-muted">{isAdmin ? `${visibleTasks.length} task${visibleTasks.length === 1 ? '' : 's'} in this view` : 'Each task has its own card. Check it off when you’re done.'}</p></div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} className="h-4 w-4 accent-brand-700" /> Show completed</label>
      </div>

      {loading ? <div className={`${cardClass} p-8 text-center text-sm text-muted`}>Loading your tasks…</div> : visibleTasks.length === 0 ? (
        <div className={`${cardClass} flex flex-col items-center px-5 py-12 text-center`}><span className="flex h-12 w-12 items-center justify-center rounded-full bg-soft text-2xl text-brand-700" aria-hidden="true">✓</span><h3 className="mt-4 text-base font-semibold text-ink">{showCompleted ? 'A fresh start' : 'Nothing left to do'}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-muted">{isAdmin ? 'No personal tasks match this filter.' : 'Add your first task and keep your plans in one place.'}</p>{!isAdmin && <button type="button" onClick={() => setShowForm(true)} className="mt-4 min-h-11 px-3 text-sm font-semibold text-brand-700 hover:underline">Create your first task</button>}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleTasks.map((task) => {
            const overdue = !task.is_completed && !!task.due_on && task.due_on < today()
            const ownerName = names[task.owner_id] ?? (task.owner_id === profile?.id ? profile.full_name : 'Member')
            return <article key={task.id} className={`${cardClass} flex min-w-0 flex-col p-4 transition-colors hover:border-brand-200 sm:p-5`}>
              {editing === task.id && !isAdmin ? (
                <form onSubmit={(event) => void saveEdit(event, task)} className="flex flex-1 flex-col gap-3">
                  <div><label className="text-xs font-semibold text-muted" htmlFor={`edit-title-${task.id}`}>Task title</label><input id={`edit-title-${task.id}`} required maxLength={160} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className={inputClass} /></div>
                  <div><label className="text-xs font-semibold text-muted" htmlFor={`edit-desc-${task.id}`}>Description</label><textarea id={`edit-desc-${task.id}`} rows={3} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className={inputClass} /></div>
                  <div><label className="text-xs font-semibold text-muted" htmlFor={`edit-date-${task.id}`}>Due date</label><input id={`edit-date-${task.id}`} type="date" value={editDueOn} onChange={(event) => setEditDueOn(event.target.value)} className={inputClass} /></div>
                  <div className="mt-auto flex justify-end gap-2 pt-2"><button type="button" onClick={() => setEditing(null)} className={subtleButtonClass}>Cancel</button><button type="submit" disabled={!editTitle.trim()} className={buttonClass + ' w-auto'}>Save</button></div>
                </form>
              ) : <>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={task.is_completed} disabled={isAdmin} onChange={() => void toggleTask(task)} aria-label={`${task.is_completed ? 'Reopen' : 'Complete'} ${task.title}`} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-brand-700 disabled:cursor-default" />
                  <div className="min-w-0 flex-1"><h3 className={'break-words text-base font-semibold leading-6 ' + (task.is_completed ? 'text-muted line-through' : 'text-ink')}>{task.title}</h3><span className={'mt-2 inline-flex rounded-sm px-2 py-1 text-[11px] font-semibold ' + (task.is_completed ? 'bg-emerald-50 text-emerald-800' : overdue ? 'bg-red-50 text-red-700' : 'bg-sand text-muted')}>{task.is_completed ? 'Completed' : overdue ? 'Overdue' : 'In progress'}</span></div>
                </div>
                {task.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">{task.description}</p>}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 mt-4 text-xs text-muted">
                  <span>{task.due_on ? `${overdue ? 'Overdue · ' : 'Due · '}${dateLabel(task.due_on)}` : 'No due date'}</span>
                  {isAdmin && <span className="font-medium text-ink">{ownerName}</span>}
                </div>
                {!isAdmin && <div className="mt-2 flex justify-end gap-3"><button type="button" onClick={() => beginEdit(task)} className="min-h-10 px-2 text-xs font-semibold text-brand-700 hover:underline">Edit</button><button type="button" onClick={() => void deleteTask(task)} className="min-h-10 px-2 text-xs font-semibold text-muted hover:text-red-700 hover:underline">Delete</button></div>}
              </>}
            </article>
          })}
        </div>
      )}
    </div>
  )
}
