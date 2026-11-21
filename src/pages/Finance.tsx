import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { errorMessage, peso, type BudgetSummary } from '../lib/finance'
import type { Folder } from '../lib/folders'
import { FolderIcon, PlusIcon } from '../components/Icons'
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'
import PageHeader from '../components/PageHeader'

type Row = BudgetSummary & { folder_id: string | null }
type Panel = null | 'budget' | 'folder'

function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const size = 44
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference

  return (
    <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center" aria-label={`${label}: ${Math.round(percent)}% spent`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-11 w-11 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-sand" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-brand-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-ink">{Math.round(percent)}%</span>
    </span>
  )
}

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
      <ul className="mt-4 divide-y divide-line border-y border-line bg-white">
        {list.map((r) => {
          const pct = r.total_budget > 0 ? Math.min(100, (r.total_spent / r.total_budget) * 100) : r.total_spent > 0 ? 100 : 0
          const over = r.money_left < 0
          const progressLabel = over ? 'Over' : 'Spent'
          return (
            <li key={r.budget_id}>
              <Link
                to={`/finance/${r.budget_id}`}
                className="grid min-h-[5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-4 transition-colors hover:bg-paper sm:grid-cols-[minmax(0,1fr)_12rem_10rem_5rem] sm:gap-x-6 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                  <p className="mt-0.5 text-xs text-muted sm:hidden">
                    {peso(r.total_spent)} spent of {peso(r.total_budget)}
                  </p>
                </div>

                <div className={'text-right text-sm font-semibold tabular-nums sm:order-2 ' + (over ? 'text-error' : 'text-ink')}>
                  {peso(Math.abs(r.money_left))}{' '}
                  <span className="font-normal text-muted">{over ? 'over' : 'left'}</span>
                </div>

                <div className="hidden text-right text-sm text-muted tabular-nums sm:block sm:order-3">
                  {peso(r.total_spent)} of {peso(r.total_budget)}
                </div>

                <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:order-4 sm:justify-end" aria-label={`${progressLabel} ${Math.round(pct)} percent`}>
                  <ProgressRing percent={pct} label={progressLabel} />
                  <span className="hidden text-[10px] font-medium uppercase tracking-wide text-muted sm:inline">{progressLabel}</span>
                </div>
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
    <div className="w-full">
      <PageHeader
        eyebrow="Financial transparency"
        title="Every peso, accounted for."
        subtitle="AY 2026–2027 · Budgets, expenses and receipts, grouped into folders."
        action={canEdit ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-white p-2">
            <button type="button" onClick={() => setPanel(panel === 'folder' ? null : 'folder')} className={subtleButtonClass + ' min-h-11'}>
              <FolderIcon size={16} className="mr-2" /> New folder
            </button>
            <button type="button" onClick={() => setPanel(panel === 'budget' ? null : 'budget')} className={buttonClass + ' min-h-11 sm:w-auto'}>
              <PlusIcon size={16} className="mr-2" /> New budget
            </button>
          </div>
        ) : undefined}
      />

      {error && <p role="alert" className="mt-4 border-l-4 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}

      {canEdit && panel === 'folder' && (
        <form onSubmit={createFolder} className="mt-5 grid gap-4 rounded-md border border-line bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-5">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <label htmlFor="f-name" className="text-sm font-medium">Folder name</label>
            <input id="f-name" value={newFolder} maxLength={80} onChange={(e) => setNewFolder(e.target.value)} placeholder="e.g. A.Y. 2026-2027" className={inputClass} />
          </div>
          <button type="submit" className={buttonClass + ' sm:w-auto'}>Create folder</button>
        </form>
      )}

      {canEdit && panel === 'budget' && (
        <form onSubmit={createBudget} className="mt-5 grid gap-4 rounded-md border border-line bg-white p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(9rem,.7fr)_minmax(11rem,.9fr)_auto] sm:items-end sm:p-5">
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

      {loading && <div className="mt-6 border border-line bg-white px-4 py-6 text-sm text-muted" aria-label="Loading">Loading finance…</div>}

      {!loading && (
        <>
        <dl aria-label="Overview" className="mt-6 grid gap-3 sm:grid-cols-[1.25fr_1fr_1fr]">
          <div className="rounded-md border border-brand-100 border-t-4 border-t-brand-700 bg-white p-5 sm:p-6">
            <dt className="text-[11px] font-bold tracking-[0.14em] text-brand-700 uppercase">{totalLeft < 0 ? 'Over budget by' : 'Money left'}</dt>
            <dd className="mt-2 break-words text-3xl font-semibold tracking-tight tabular-nums text-brand-900 sm:text-4xl">{peso(Math.abs(totalLeft))}</dd>
            <p className="mt-2 text-sm text-muted">{peso(totalSpent)} spent from {peso(totalBudget)} allocated</p>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-brand-50"><div className="h-full rounded-full bg-brand-700" style={{ width: `${totalBudget > 0 ? Math.max(0, Math.min(100, totalSpent / totalBudget * 100)) : 0}%` }} /></div>
          </div>
          <div className="rounded-md border border-line border-t-4 border-t-brand-100 bg-white p-5 sm:p-6">
            <dt className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Approved budget</dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink sm:text-3xl">{peso(totalBudget)}</dd>
            <p className="mt-2 text-sm text-muted">Across {rows.length} {rows.length === 1 ? 'budget' : 'budgets'}</p>
          </div>
          <div className="rounded-md border border-line border-t-4 border-t-brand-100 bg-white p-5 sm:p-6">
            <dt className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Total spent</dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink sm:text-3xl">{peso(totalSpent)}</dd>
            <p className="mt-2 text-sm text-muted">{missing > 0 ? `${missing} expenses still need receipts` : 'All recorded expenses have receipts'}</p>
          </div>
        </dl>
        {missing > 0 && (
          <p className="mt-3 border-l-4 border-accent-500 bg-accent-100 px-4 py-3 text-sm text-accent-700">
            {missing} {missing === 1 ? 'expense is' : 'expenses are'} missing a receipt. Open the relevant budget to review them.
          </p>
        )}
        </>
      )}

      {!loading && rows.length === 0 && folders.length === 0 && (
        <p className="mt-5 rounded-md border border-dashed border-line bg-white px-4 py-8 text-center text-sm text-muted">
          No budgets yet. Create the first one with "New budget".
        </p>
      )}

      <div className="mt-9 space-y-9">
        {folders.map((f) => {
          const list = rows.filter((r) => r.folder_id === f.id)
          const spent = list.reduce((s, r) => s + Math.round(r.total_spent * 100), 0) / 100
          const budget = list.reduce((s, r) => s + Math.round(r.total_budget * 100), 0) / 100
          return (
            <section key={f.id} aria-label={f.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-brand-700 pb-3">
                <h2 className="flex items-center gap-2 text-xl font-medium">
                  <FolderIcon size={17} className="text-brand-700" /> {f.name}
                </h2>
                <p className="text-xs text-muted tabular-nums">
                  {list.length} {list.length === 1 ? 'budget' : 'budgets'} · {peso(spent)} of {peso(budget)}
                </p>
              </div>

              {canEdit && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs">
                  {renaming === f.id ? (
                    <>
                      <input
                        aria-label="Folder name"
                        value={renameText}
                        maxLength={80}
                        onChange={(e) => setRenameText(e.target.value)}
                        className="min-w-0 min-h-11 border border-ash px-2 text-base sm:min-h-8 sm:text-sm"
                      />
                      <button onClick={() => void renameFolder(f.id)} className="min-h-11 px-1 font-semibold text-brand-700 hover:underline sm:min-h-8">Save</button>
                      <button onClick={() => setRenaming(null)} className="min-h-11 px-1 text-umber hover:underline sm:min-h-8">Cancel</button>
                    </>
                  ) : deleting === f.id ? (
                    <>
                      <span className="text-ink">Delete this folder? Its budgets are kept and move to "No folder".</span>
                      <button onClick={() => void deleteFolder(f.id)} className="min-h-11 px-1 font-semibold text-error hover:underline sm:min-h-8">Yes, delete</button>
                      <button onClick={() => setDeleting(null)} className="min-h-11 px-1 text-umber hover:underline sm:min-h-8">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setRenaming(f.id)
                          setRenameText(f.name)
                        }}
                        className="min-h-11 px-1 font-medium text-brand-700 hover:underline sm:min-h-8"
                      >
                        Rename
                      </button>
                      <button onClick={() => setDeleting(f.id)} className="min-h-11 px-1 text-umber hover:text-error hover:underline sm:min-h-8">Delete folder</button>
                    </>
                  )}
                </div>
              )}

              {list.length === 0 ? (
                <p className="mt-2 rounded-md border border-dashed border-line bg-white px-4 py-4 text-sm text-muted">
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
            {folders.length > 0 && (
              <div className="border-b border-line pb-2">
                <h2 className="font-display text-base font-bold">No folder</h2>
              </div>
            )}
            {renderBudgets(unfiled)}
          </section>
        )}
      </div>
    </div>
  )
}
