import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { errorMessage, peso, type BudgetSummary } from '../lib/finance'
import type { Folder } from '../lib/folders'
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'

type Row = BudgetSummary & { folder_id: string | null }

export default function Finance() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canEdit = profile?.role === 'treasurer'

  const [rows, setRows] = useState<Row[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [total, setTotal] = useState('')
  const [folderId, setFolderId] = useState('')
  const [busy, setBusy] = useState(false)

  const [newFolder, setNewFolder] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [b, f] = await Promise.all([
      supabase.from('budget_summary').select('*').order('name'),
      supabase.from('budget_folders').select('id, name').order('name'),
    ])
    if (b.error || f.error) setError((b.error ?? f.error)!.message)
    else {
      setRows((b.data ?? []) as Row[])
      setFolders((f.data ?? []) as Folder[])
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
      <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
        {list.map((r) => {
          const pct = r.total_budget > 0 ? Math.min(100, (r.total_spent / r.total_budget) * 100) : r.total_spent > 0 ? 100 : 0
          const over = r.money_left < 0
          return (
            <li key={r.budget_id}>
              <Link to={`/finance/${r.budget_id}`} className="block py-5 transition-colors hover:text-brand-700">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-display text-xl font-semibold">{r.name}</span>
                  <span className={'font-display text-xl font-semibold ' + (over ? 'text-red-700' : '')}>
                    {peso(r.money_left)} left
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                  <div
                    className={'h-full rounded-full ' + (over ? 'bg-red-600' : 'bg-brand-700')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {peso(r.total_spent)} spent of {peso(r.total_budget)}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
    )
  }

  const unfiled = rows.filter((r) => !r.folder_id)

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Finance</h1>
      <p className="mt-2 text-slate-600">
        One budget per event or activity. Group budgets into folders to keep different expenses apart.
      </p>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {canEdit && (
        <>
          <form onSubmit={createFolder} className="mt-8 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <label htmlFor="f-name" className="text-sm font-medium">New folder</label>
              <input
                id="f-name"
                value={newFolder}
                maxLength={80}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="e.g. A.Y. 2026-2027"
                className={inputClass}
              />
            </div>
            <button type="submit" className={subtleButtonClass}>Create folder</button>
          </form>

          <form onSubmit={createBudget} className="mt-6 grid gap-4 sm:grid-cols-[1fr_10rem_12rem_auto] sm:items-end">
            <div>
              <label htmlFor="b-name" className="text-sm font-medium">New budget</label>
              <input
                id="b-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Foundation Day"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="b-total" className="text-sm font-medium">Total (PHP)</label>
              <input
                id="b-total"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className={inputClass}
              />
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
            <button type="submit" disabled={busy} className={buttonClass + ' sm:w-auto'}>
              {busy ? 'Creating…' : 'Create budget'}
            </button>
          </form>
        </>
      )}

      {loading && <p className="mt-10 text-sm text-slate-500">Loading budgets…</p>}

      {!loading && rows.length === 0 && folders.length === 0 && (
        <p className="mt-10 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          No budgets yet. Create the first one above.
        </p>
      )}

      <div className="mt-10 space-y-8">
        {folders.map((f) => {
          const list = rows.filter((r) => r.folder_id === f.id)
          const spent = list.reduce((s, r) => s + Math.round(r.total_spent * 100), 0) / 100
          const budget = list.reduce((s, r) => s + Math.round(r.total_budget * 100), 0) / 100
          return (
            <details key={f.id} open className="group">
              <summary className="cursor-pointer list-none">
                <span className="font-display text-xl font-semibold">{f.name}</span>
                <span className="ml-3 text-sm text-slate-500">
                  {list.length} {list.length === 1 ? 'budget' : 'budgets'}, {peso(spent)} spent of {peso(budget)}
                </span>
              </summary>

              {canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
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
                <p className="mt-3 text-sm text-slate-500">Empty. Open a budget and choose this folder to move it here.</p>
              ) : (
                renderBudgets(list)
              )}
            </details>
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
