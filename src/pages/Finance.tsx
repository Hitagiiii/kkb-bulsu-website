import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { errorMessage, peso, type BudgetSummary } from '../lib/finance'
import type { Folder } from '../lib/folders'
import { ChevronRightIcon, FolderIcon, PlusIcon } from '../components/Icons'
import ProgressRing from '../components/ProgressRing'
import StatCard from '../components/StatCard'
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'

type Row = BudgetSummary & { folder_id: string | null }
type Panel = null | 'budget' | 'folder'

export default function Finance() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canEdit = profile?.role === 'treasurer'

  const [rows, setRows] = useState<Row[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [missing, setMissing] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)

  const [name, setName] = useState('')
  const [total, setTotal] = useState('')
  const [folderId, setFolderId] = useState('')
  const [busy, setBusy] = useState(false)

  const [newFolder, setNewFolder] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [b, f, m] = await Promise.all([
      supabase.from('budget_summary').select('*').order('name'),
      supabase.from('budget_folders').select('id, name').order('name'),
      supabase.from('expenses').select('id', { count: 'exact', head: true }).is('receipt_path', null).is('voided_at', null),
    ])
    if (b.error || f.error) setError((b.error ?? f.error)!.message)
    else {
      setRows((b.data ?? []) as Row[])
      setFolders((f.data ?? []) as Folder[])
      setMissing(m.count ?? 0)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('finance-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets' }, () => void load())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  async function createBudget(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const value = Number(total)
    if (!name.trim()) return setError('Give the budget a name.')
    if (!(value >= 0)) return setError('Enter the total budget as a number.')

    setBusy(true)
    const { data, error } = await supabase
      .from('budgets')
      .insert({ name: name.trim(), total_budget: Math.round(value * 100) / 100, folder_id: folderId || null })
      .select('id')
      .single()
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not create the budget.'))
    navigate(`/finance/${data.id}`)
  }

  async function createFolder(e: FormEvent) {
    e.preventDefault()
    const n = newFolder.trim()
    if (!n) return
    const { error } = await supabase.from('budget_folders').insert({ name: n })
    if (error) return setError(errorMessage(error, 'Could not create the folder.'))
    setNewFolder('')
    setPanel(null)
    await load()
  }

  async function renameFolder(id: string) {
    const n = renameText.trim()
    if (!n) return
    const { error } = await supabase.from('budget_folders').update({ name: n }).eq('id', id)
    if (error) return setError(errorMessage(error, 'Could not rename the folder.'))
    setRenaming(null)
    await load()
  }

  async function deleteFolder(id: string) {
    const { error } = await supabase.from('budget_folders').delete().eq('id', id)
    setDeleting(null)
    if (error) return setError(errorMessage(error, 'Could not delete the folder.'))
    await load()
  }

  function renderBudgets(list: Row[]) {
    return (
      <ul className="mt-3 grid gap-4 sm:grid-cols-2">
        {list.map((r, i) => {
          const pct = r.total_budget > 0 ? Math.min(100, (r.total_spent / r.total_budget) * 100) : r.total_spent > 0 ? 100 : 0
          const over = r.money_left < 0
          return (
            <li key={r.budget_id} className="animate-fade-up motion-reduce:animate-none" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
              <Link
                to={`/finance/${r.budget_id}`}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-600/40 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none"
              >
                <ProgressRing pct={pct} over={over} />
                <span className="min-w-0 flex-1">
                  <span className="font-display block text-lg font-semibold break-words">{r.name}</span>
                  <span className={'font-display block text-2xl font-semibold tabular-nums ' + (over ? 'text-red-700' : 'text-brand-800')}>
                    {peso(Math.abs(r.money_left))}
                    <span className="ml-1.5 font-sans text-sm font-normal text-slate-500">{over ? 'over budget' : 'left'}</span>
                  </span>
                  <span className="block text-xs text-slate-500">
                    {peso(r.total_spent)} spent of {peso(r.total_budget)}
                  </span>
                </span>
                <ChevronRightIcon className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
              </Link>
            </li>
          )
        })}
      </ul>
    )
  }

  const unfiled = rows.filter((r) => !r.folder_id)
  const totalBudget = rows.reduce((s, r) => s + Math.round(r.total_budget * 100), 0) / 100
  const totalSpent = rows.reduce((s, r) => s + Math.round(r.total_spent * 100), 0) / 100
  const totalLeft = (Math.round(totalBudget * 100) - Math.round(totalSpent * 100)) / 100

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Finance</h1>
          <p className="mt-2 text-slate-600">Budgets, expenses and receipts, grouped into folders.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPanel(panel === 'folder' ? null : 'folder')} className={subtleButtonClass}>
              <FolderIcon size={16} className="mr-1.5" /> New folder
            </button>
            <button onClick={() => setPanel(panel === 'budget' ? null : 'budget')} className={buttonClass + ' sm:w-auto'}>
              <PlusIcon size={16} className="mr-1.5" /> New budget
            </button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {canEdit && panel === 'folder' && (
        <form onSubmit={createFolder} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <label htmlFor="f-name" className="text-sm font-medium">Folder name</label>
            <input id="f-name" value={newFolder} maxLength={80} onChange={(e) => setNewFolder(e.target.value)} placeholder="e.g. A.Y. 2026-2027" className={inputClass} />
          </div>
          <button type="submit" className={buttonClass + ' sm:w-auto'}>Create folder</button>
        </form>
      )}

      {canEdit && panel === 'budget' && (
        <form onSubmit={createBudget} className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_10rem_12rem_auto] sm:items-end">
          <div>
            <label htmlFor="b-name" className="text-sm font-medium">Budget name</label>
            <input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Foundation Day" className={inputClass} />
          </div>
          <div>
            <label htmlFor="b-total" className="text-sm font-medium">Total (PHP)</label>
            <input id="b-total" type="number" inputMode="decimal" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="b-folder" className="text-sm font-medium">Folder</label>
            <select id="b-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)} className={inputClass}>
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={busy} className={buttonClass + ' sm:w-auto'}>{busy ? 'Creating…' : 'Create budget'}</button>
        </form>
      )}

      {loading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Loading">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      )}

      {!loading && (
        <section aria-label="Overview" className="mt-8 grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="rounded-2xl bg-linear-to-br from-brand-900 via-brand-800 to-brand-700 p-5 text-white shadow-sm">
            <p className="text-sm text-white/70">{totalLeft < 0 ? 'Over budget by' : 'Money left across all budgets'}</p>
            <p className="font-display mt-1 text-4xl font-bold tracking-tight tabular-nums break-words">{peso(Math.abs(totalLeft))}</p>
            <p className="mt-2 text-sm text-white/70">{peso(totalSpent)} spent of {peso(totalBudget)}</p>
          </div>
          <StatCard label="Budgets" value={rows.length} hint={folders.length > 0 ? `${folders.length} ${folders.length === 1 ? 'folder' : 'folders'}` : 'No folders yet'} />
          <StatCard
            label="Missing receipts"
            value={missing}
            tone={missing > 0 ? 'warn' : 'good'}
            hint={missing > 0 ? 'Open a budget to attach them' : 'Everything has a receipt'}
          />
        </section>
      )}

      {!loading && rows.length === 0 && folders.length === 0 && (
        <p className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No budgets yet. Create the first one with "New budget".
        </p>
      )}

      <div className="mt-10 space-y-10">
        {folders.map((f) => {
          const list = rows.filter((r) => r.folder_id === f.id)
          const spent = list.reduce((s, r) => s + Math.round(r.total_spent * 100), 0) / 100
          const budget = list.reduce((s, r) => s + Math.round(r.total_budget * 100), 0) / 100
          return (
            <section key={f.id} aria-label={f.name}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <h2 className="font-display flex items-center gap-2 text-xl font-semibold">
                  <FolderIcon size={20} className="text-brand-700" /> {f.name}
                </h2>
                <p className="text-sm text-slate-500">
                  {list.length} {list.length === 1 ? 'budget' : 'budgets'} · {peso(spent)} of {peso(budget)}
                </p>
              </div>

              {canEdit && (
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {renaming === f.id ? (
                    <>
                      <input
                        aria-label="Folder name"
                        value={renameText}
                        maxLength={80}
                        onChange={(e) => setRenameText(e.target.value)}
                        className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-base sm:py-1 sm:text-sm"
                      />
                      <button onClick={() => void renameFolder(f.id)} className="py-1 font-semibold text-brand-700 hover:underline">Save</button>
                      <button onClick={() => setRenaming(null)} className="py-1 text-slate-600 hover:underline">Cancel</button>
                    </>
                  ) : deleting === f.id ? (
                    <>
                      <span className="text-slate-700">Delete this folder? Its budgets are kept and move to "No folder".</span>
                      <button onClick={() => void deleteFolder(f.id)} className="py-1 font-semibold text-red-700 hover:underline">Yes, delete</button>
                      <button onClick={() => setDeleting(null)} className="py-1 text-slate-600 hover:underline">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setRenaming(f.id)
                          setRenameText(f.name)
                        }}
                        className="py-1 font-medium text-brand-700 hover:underline"
                      >
                        Rename
                      </button>
                      <button onClick={() => setDeleting(f.id)} className="py-1 text-slate-600 hover:text-red-700 hover:underline">Delete folder</button>
                    </>
                  )}
                </div>
              )}

              {list.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                  Empty. Open a budget and choose this folder to move it here.
                </p>
              ) : (
                renderBudgets(list)
              )}
            </section>
          )
        })}

        {unfiled.length > 0 && (
          <section aria-label="Budgets without a folder">
            {folders.length > 0 && <h2 className="font-display text-xl font-semibold">No folder</h2>}
            {renderBudgets(unfiled)}
          </section>
        )}
      </div>
    </div>
  )
}
