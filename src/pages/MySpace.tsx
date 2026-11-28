import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { buttonClass, cardClass, inputClass, subtleButtonClass } from '../components/ui'

type Tab = 'overview' | 'goals' | 'planner' | 'notes' | 'devotional'
type Row = { id: string; owner_id: string; title: string; details: string | null; due_on?: string | null; progress?: number; created_at: string }
type Person = { id: string; full_name: string }
const tabs: { id: Tab; label: string; description: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', description: 'Your personal dashboard', icon: '⌂' },
  { id: 'goals', label: 'My Goals', description: 'Set intentions and track progress', icon: '◎' },
  { id: 'planner', label: 'My Planner', description: 'Personal dates and reminders', icon: '▦' },
  { id: 'notes', label: 'My Notes', description: 'Thoughts, ideas and reminders', icon: '▤' },
  { id: 'devotional', label: 'My Devotional', description: 'Personal faith reflections', icon: '♡' },
]
const today = () => new Date().toLocaleDateString('en-CA')
const prettyDate = (value?: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'

export default function MySpace() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [tab, setTab] = useState<Tab>('overview')
  const [goals, setGoals] = useState<Row[]>([])
  const [planner, setPlanner] = useState<Row[]>([])
  const [notes, setNotes] = useState<Row[]>([])
  const [devotionals, setDevotionals] = useState<Row[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [date, setDate] = useState('')
  const [progress, setProgress] = useState(0)
  const [editing, setEditing] = useState<{ table: Tab; id: string } | null>(null)

  const load = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    const [g, p, n, d] = await Promise.all([
      supabase.from('personal_goals').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_planner').select('*').order('due_on', { ascending: true }),
      supabase.from('personal_notes').select('*').order('created_at', { ascending: false }),
      supabase.from('personal_devotionals').select('*').order('created_at', { ascending: false }),
    ])
    const failed = [g, p, n, d].find((r) => r.error)
    if (failed?.error) setError(failed.error.message)
    else {
      setGoals((g.data ?? []) as Row[]); setPlanner((p.data ?? []) as Row[])
      setNotes((n.data ?? []) as Row[]); setDevotionals((d.data ?? []) as Row[]); setError(null)
    }
    if (isAdmin) {
      const { data, error: peopleError } = await supabase.from('profiles').select('id, full_name').eq('approved', true).order('full_name')
      if (peopleError) setError(peopleError.message)
      else setPeople((data ?? []) as Person[])
    }
    setLoading(false)
  }, [profile?.id, isAdmin])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase.channel(`my-space-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_goals' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_planner' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_notes' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_devotionals' }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [profile?.id, load])

  const records = tab === 'goals' ? goals : tab === 'planner' ? planner : tab === 'notes' ? notes : devotionals
  const table = tab === 'goals' ? 'personal_goals' : tab === 'planner' ? 'personal_planner' : tab === 'notes' ? 'personal_notes' : 'personal_devotionals'
  const titleText = tabs.find((item) => item.id === tab)?.label ?? 'My Space'
  const name = profile?.full_name?.split(' ')[0] || 'there'
  const visible = useMemo(() => records.filter((r) => !isAdmin || filter === 'all' || r.owner_id === filter), [records, isAdmin, filter])
  const upcoming = planner.filter((p) => p.due_on && p.due_on >= today()).slice(0, 3)

  function openCreate() { setEditing(null); setTitle(''); setDetails(''); setDate(''); setProgress(0); setShowForm(true) }
  function openEdit(row: Row) { setEditing({ table: tab, id: row.id }); setTitle(row.title); setDetails(row.details ?? ''); setDate(row.due_on ?? ''); setProgress(row.progress ?? 0); setShowForm(true) }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile?.id || !title.trim() || isAdmin) return
    setSaving(true)
    const payload = { title: title.trim(), details: details.trim() || null, ...(tab === 'goals' ? { progress } : {}), ...(tab === 'planner' ? { due_on: date || null } : {}) }
    const result = editing ? await supabase.from(table).update(payload).eq('id', editing.id) : await supabase.from(table).insert({ ...payload, owner_id: profile.id })
    setSaving(false)
    if (result.error) setError(result.error.message)
    else { setShowForm(false); await load() }
  }
  async function remove(row: Row) {
    if (!window.confirm(`Delete “${row.title}”?`)) return
    const result = await supabase.from(table).delete().eq('id', row.id)
    if (result.error) setError(result.error.message); else await load()
  }

  return (
    <div className="w-full space-y-8">
      <PageHeader
        eyebrow="Your personal corner"
        title="My Space"
        subtitle={isAdmin ? 'A trusted overview of members’ personal spaces.' : `Welcome back, ${name}. A space for your plans, growth and everyday moments.`}
      />

      {error && (
        <p role="alert" className="rounded-md border border-brand-700 bg-soft px-4 py-3 text-sm text-brand-700">
          {error}
        </p>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-ink">Admin overview</p>
            <p className="mt-1 text-xs text-muted">You can view members’ personal content. Members remain responsible for managing their own entries.</p>
          </div>
          <select
            aria-label="Filter by member"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="min-h-11 rounded-md border border-line bg-white px-3 text-sm text-ink"
          >
            <option value="all">All members</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name || 'Unnamed member'}</option>
            ))}
          </select>
        </div>
      )}

      <nav aria-label="Personal space" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setTab(item.id); setShowForm(false) }}
            aria-current={tab === item.id ? 'page' : undefined}
            className={'min-h-16 rounded-md border px-3 py-3 text-left transition-colors ' + (tab === item.id ? 'border-brand-700 bg-soft text-brand-900' : 'border-line bg-white text-ink hover:border-brand-300')}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-lg text-brand-700" aria-hidden="true">{item.icon}</span>
              {item.label}
            </span>
            <span className="mt-1 block text-xs text-muted">{item.description}</span>
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <div className="space-y-8">
          {!isAdmin && (
            <section aria-labelledby="today-heading">
              <div className="flex items-center gap-2.5 border-b border-line pb-2.5">
                <span aria-hidden="true" className="h-[18px] w-[3px] bg-brand-700" />
                <h2 id="today-heading" className="text-[20px] font-medium leading-tight text-ink">Today</h2>
              </div>
              {upcoming.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {upcoming.map((p) => (
                    <li key={p.id} className="border-l-2 border-brand-700 pl-3">
                      <p className="text-sm font-semibold text-ink">{p.title}</p>
                      <p className="text-xs text-muted">{prettyDate(p.due_on)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted">No upcoming personal plans for today.</p>
              )}
              <button type="button" onClick={() => setTab('planner')} className="mt-3 text-sm font-semibold text-brand-700 hover:underline">
                Open planner
              </button>
            </section>
          )}

          {!isAdmin && (
            <section aria-labelledby="progress-heading">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="h-[18px] w-[3px] bg-brand-700" />
                  <h2 id="progress-heading" className="text-[20px] font-medium leading-tight text-ink">Your progress</h2>
                </div>
                <button type="button" onClick={() => setTab('goals')} className="py-1 text-xs font-semibold text-brand-700 hover:underline">View goals</button>
              </div>
              {goals.length > 0 ? (
                <div className="mt-4 space-y-4">
                  {goals.slice(0, 3).map((g) => (
                    <div key={g.id}>
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-medium text-ink">{g.title}</span>
                        <span className="text-muted">{g.progress ?? 0}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand">
                        <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.min(100, g.progress ?? 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">Your goals will appear here once you add one.</p>
              )}
            </section>
          )}

          {!isAdmin && (
            <section aria-labelledby="quick-heading">
              <div className="flex items-center gap-2.5 border-b border-line pb-2.5">
                <span aria-hidden="true" className="h-[18px] w-[3px] bg-brand-700" />
                <h2 id="quick-heading" className="text-[20px] font-medium leading-tight text-ink">Quick access</h2>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link to="/my-space/tasks" className="flex items-center justify-between rounded-md border border-line bg-white px-4 py-3 text-sm text-ink transition-colors hover:bg-soft">
                  <span>My to-do list</span>
                  <span aria-hidden="true" className="text-muted">→</span>
                </Link>
                <button type="button" onClick={() => setTab('goals')} className="flex items-center justify-between rounded-md border border-line bg-white px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-soft">
                  <span>My goals</span>
                  <span aria-hidden="true" className="text-muted">→</span>
                </button>
                <button type="button" onClick={() => setTab('planner')} className="flex items-center justify-between rounded-md border border-line bg-white px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-soft">
                  <span>My planner</span>
                  <span aria-hidden="true" className="text-muted">→</span>
                </button>
                <button type="button" onClick={() => setTab('notes')} className="flex items-center justify-between rounded-md border border-line bg-white px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-soft">
                  <span>My notes</span>
                  <span aria-hidden="true" className="text-muted">→</span>
                </button>
                <button type="button" onClick={() => setTab('devotional')} className="flex items-center justify-between rounded-md border border-line bg-white px-4 py-3 text-left text-sm text-ink transition-colors hover:bg-soft">
                  <span>My devotional</span>
                  <span aria-hidden="true" className="text-muted">→</span>
                </button>
                <Link to="/attendance" className="flex items-center justify-between rounded-md border border-line bg-white px-4 py-3 text-sm text-ink transition-colors hover:bg-soft">
                  <span>My attendance</span>
                  <span aria-hidden="true" className="text-muted">→</span>
                </Link>
              </div>
            </section>
          )}

          {!isAdmin && (
            <section aria-labelledby="activity-heading">
              <div className="flex items-center gap-2.5 border-b border-line pb-2.5">
                <span aria-hidden="true" className="h-[18px] w-[3px] bg-brand-700" />
                <h2 id="activity-heading" className="text-[20px] font-medium leading-tight text-ink">Your KKB activity</h2>
              </div>
              <p className="mt-3 text-sm text-muted">Keep your personal plans separate from official organization records.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/merch" className={subtleButtonClass}>My merch orders</Link>
                <Link to="/account" className={subtleButtonClass}>My profile</Link>
                <Link to="/verse-of-the-day" className={subtleButtonClass}>Verse of the Day</Link>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="h-[18px] w-[3px] bg-brand-700" />
              <div>
                <h2 className="text-[20px] font-medium leading-tight text-ink">{titleText}</h2>
                <p className="text-sm text-muted">{isAdmin ? 'View-only access across members’ entries.' : tabs.find(t => t.id === tab)?.description}</p>
              </div>
            </div>
            {!isAdmin && (
              <button type="button" onClick={openCreate} className={buttonClass + ' w-auto'}>
                + Add {tab === 'devotional' ? 'reflection' : tab === 'planner' ? 'plan' : tab === 'goals' ? 'goal' : 'note'}
              </button>
            )}
          </div>

          {showForm && !isAdmin && (
            <form onSubmit={(e) => void save(e)} className={`${cardClass} grid gap-3 p-4 sm:grid-cols-2 sm:p-5`}>
              <div className="sm:col-span-2">
                <label htmlFor="space-title" className="text-sm font-semibold text-ink">{tab === 'devotional' ? 'Reflection title' : tab === 'planner' ? 'Plan or reminder' : tab === 'goals' ? 'Goal title' : 'Note title'}</label>
                <input id="space-title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Give it a clear title" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="space-details" className="text-sm font-semibold text-ink">{tab === 'devotional' ? 'Your reflection' : 'Details'} <span className="font-normal text-muted">(optional)</span></label>
                <textarea id="space-details" rows={4} maxLength={5000} value={details} onChange={(e) => setDetails(e.target.value)} className={inputClass} placeholder={tab === 'devotional' ? 'What stood out to you? What would you like to remember?' : 'Add details…'} />
              </div>
              {tab === 'planner' && (
                <div>
                  <label htmlFor="space-date" className="text-sm font-semibold text-ink">Date</label>
                  <input id="space-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                </div>
              )}
              {tab === 'goals' && (
                <div>
                  <label htmlFor="space-progress" className="text-sm font-semibold text-ink">Progress: {progress}%</label>
                  <input id="space-progress" type="range" min="0" max="100" step="5" value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="mt-3 w-full accent-brand-700" />
                </div>
              )}
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className={subtleButtonClass}>Cancel</button>
                <button type="submit" disabled={saving || !title.trim()} className={buttonClass + ' w-auto'}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save'}</button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-sm text-muted">Loading your space…</p>
          ) : visible.length ? (
            <ul className="divide-y divide-line">
              {visible.map((row) => (
                <li key={row.id} className="py-4 first:pt-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-base font-semibold text-ink">{row.title}</h3>
                      {row.details && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted">{row.details}</p>}
                      {tab === 'goals' && (
                        <div className="mt-3 max-w-md">
                          <div className="flex justify-between text-xs text-muted">
                            <span>Progress</span>
                            <span>{row.progress ?? 0}%</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-sand">
                            <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.min(100, row.progress ?? 0)}%` }} />
                          </div>
                        </div>
                      )}
                      {tab === 'planner' && <p className="mt-2 text-xs font-medium text-brand-700">{prettyDate(row.due_on)}</p>}
                      {isAdmin && <p className="mt-2 text-xs text-muted">{people.find(p => p.id === row.owner_id)?.full_name ?? 'Member'}</p>}
                    </div>
                    {!isAdmin && (
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => openEdit(row)} className="min-h-10 px-2 text-xs font-semibold text-brand-700 hover:underline">Edit</button>
                        <button type="button" onClick={() => void remove(row)} className="min-h-10 px-2 text-xs font-semibold text-muted hover:text-error hover:underline">Delete</button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-10 text-center">
              <span className="text-3xl text-brand-700">{tabs.find(t => t.id === tab)?.icon}</span>
              <h3 className="mt-3 text-base font-semibold text-ink">Nothing here yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{isAdmin ? 'There are no entries in this view.' : 'Start with one small entry. You can update it anytime.'}</p>
              {!isAdmin && (
                <button type="button" onClick={openCreate} className="mt-4 min-h-11 px-3 text-sm font-semibold text-brand-700 hover:underline">
                  Add one now
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Link to="/my-space/tasks" className={subtleButtonClass}>Open My To-Do List</Link>
        <Link to="/attendance" className={subtleButtonClass}>View attendance</Link>
        <Link to="/account" className={subtleButtonClass}>Account settings</Link>
      </div>
    </div>
  )
}
