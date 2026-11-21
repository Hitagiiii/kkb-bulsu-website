import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import {
  CATEGORIES,
  compressImage,
  errorMessage,
  formatDate,
  peso,
  signedUrls,
  todayISO,
  type Budget,
  type Expense,
} from '../lib/finance'
import BudgetEventLink from '../components/BudgetEventLink'
import BudgetFolderPicker from '../components/BudgetFolderPicker'
import Modal from '../components/Modal'
import PrintBill from '../components/PrintBill'
import { buttonClass, inputClass, noticeClass, subtleButtonClass } from '../components/ui'

const CAT_COLORS = ['bg-brand-900', 'bg-brand-800', 'bg-brand-700', 'bg-brand-600', 'bg-brand-100', 'bg-line', 'bg-ash']

export default function BudgetDetail() {
  const { budgetId } = useParams<{ budgetId: string }>()
  const { profile } = useAuth()
  const canEdit = hasRole(profile?.role, 'treasurer')

  const [budget, setBudget] = useState<Budget | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDetailId, setMobileDetailId] = useState<string | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [showVoided, setShowVoided] = useState(false)
  const [onlyMissing, setOnlyMissing] = useState(false)
  const urlCache = useRef<Record<string, string>>({})

  const closeDetail = useCallback(() => {
    setSelectedId(null)
    setMobileDetailId(null)
  }, [])

  const load = useCallback(async () => {
    if (!budgetId) return
    const [b, e, p] = await Promise.all([
      supabase.from('budgets').select('*').eq('id', budgetId).maybeSingle(),
      supabase.from('expenses').select('*').eq('budget_id', budgetId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name'),
    ])
    if (b.error || e.error) {
      setError((b.error ?? e.error)!.message)
      setLoading(false)
      return
    }
    setBudget((b.data as Budget | null) ?? null)
    const list = (e.data ?? []) as Expense[]
    setExpenses(list)
    if (p.data) {
      setNames(
        Object.fromEntries(
          (p.data as { id: string; full_name: string }[]).map((r) => [r.id, r.full_name || 'Unnamed']),
        ),
      )
    }
    const missing = list
      .map((x) => x.receipt_path)
      .filter((x): x is string => !!x && !urlCache.current[x])
    if (missing.length) Object.assign(urlCache.current, await signedUrls(missing))
    setUrls({ ...urlCache.current })
    setError(null)
    setLoading(false)
  }, [budgetId])

  useEffect(() => {
    if (!budgetId) return
    void load()
    const channel = supabase
      .channel(`budget-${budgetId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses', filter: `budget_id=eq.${budgetId}` },
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'budgets', filter: `id=eq.${budgetId}` },
        () => void load(),
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [budgetId, load])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const active = useMemo(() => expenses.filter((x) => !x.voided_at), [expenses])
  const missingCount = active.filter((x) => !x.receipt_path).length
  const filterMissing = onlyMissing && missingCount > 0
  const spentCents = active.reduce((sum, x) => sum + Math.round(x.amount * 100), 0)
  const totalCents = budget ? Math.round(budget.total_budget * 100) : 0
  const spent = spentCents / 100
  const left = (totalCents - spentCents) / 100
  const over = left < 0
  const pct = totalCents > 0 ? Math.min(100, (spentCents / totalCents) * 100) : spentCents > 0 ? 100 : 0

  let visible = showVoided ? expenses : active
  if (filterMissing) visible = visible.filter((x) => !x.receipt_path && !x.voided_at)
  const selected = expenses.find((x) => x.id === selectedId) ?? null
  const mobileSelected = expenses.find((x) => x.id === mobileDetailId) ?? null
  const hasVoided = expenses.length !== active.length

  const catMap = new Map<string, number>()
  for (const x of active) {
    const key = x.category || 'General'
    catMap.set(key, (catMap.get(key) ?? 0) + Math.round(x.amount * 100))
  }
  const categories = [...catMap.entries()].sort((a, b) => b[1] - a[1])

  function selectExpense(id: string) {
    setSelectedId(id)
    setMobileDetailId(id)
  }

  async function printBill() {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#print-bill img'))
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve()
              img.onerror = () => resolve()
            }),
      ),
    )
    window.print()
  }

  if (loading) return <p className="text-sm text-muted">Loading budget…</p>
  if (!budget) {
    return (
      <div>
        <p className="text-umber">{error ?? 'This budget does not exist, or you do not have access to it.'}</p>
        <Link to="/finance" className="mt-4 inline-block min-h-11 py-2 text-sm font-semibold text-brand-700 hover:underline">
          Back to Finance
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="w-full print:hidden">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link to="/finance" className="inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline">
            Finance
          </Link>
          <span className="px-2 text-umber" aria-hidden="true">/</span>
          <span className="text-umber">Budget</span>
        </nav>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-700 uppercase">Finance / Budget</p>
            <h1 className="font-display mt-1 text-[28px] leading-tight font-medium tracking-tight sm:text-[40px]">{budget.name}</h1>
            <p className="mt-1 text-xs text-muted">{live ? 'Updates live' : 'Reconnecting…'}</p>
          </div>
          <button type="button" onClick={() => void printBill()} className={subtleButtonClass + ' min-h-11'}>
            Print audit bill
          </button>
        </header>

        {error && (
          <p role="alert" className="mt-4 border border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">
            {error}
          </p>
        )}

        <section aria-label="Budget summary" className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-md border border-brand-100 border-t-4 border-t-brand-700 bg-white p-5 sm:p-6">
            <p className="text-xs font-semibold tracking-[0.12em] text-brand-700 uppercase">Money left</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-brand-900 sm:text-5xl">
              {peso(Math.abs(left))}
            </p>
            <p className="mt-2 text-sm text-muted">{over ? 'Over the approved budget' : `${Math.round(pct)}% of the budget used`}</p>
            <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-brand-50" aria-hidden="true">
              <div className={'h-full rounded-full ' + 'bg-brand-700'} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-xs text-muted">Available funds · {peso(Math.abs(left))}</p>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-line border-t-4 border-t-brand-100 bg-white p-4 sm:p-5">
              <dt className="text-xs font-medium text-muted">Total</dt>
              <dd className="mt-2 text-xl font-semibold tabular-nums text-ink sm:text-2xl">{peso(budget.total_budget)}</dd>
              {canEdit && <ChangeTotal budget={budget} onChanged={load} />}
            </div>
            <div className="rounded-md border border-line border-t-4 border-t-brand-100 bg-white p-4 sm:p-5">
              <dt className="text-xs font-medium text-muted">Spent</dt>
              <dd className="mt-2 text-xl font-semibold tabular-nums text-ink sm:text-2xl">{peso(spent)}</dd>
            </div>
            <div className="rounded-md border border-line border-t-4 border-t-brand-100 bg-white p-4 sm:p-5">
              <dt className="text-xs font-medium text-muted">Receipts missing</dt>
              <dd className={'mt-1 text-lg font-semibold tabular-nums sm:text-xl ' + (missingCount > 0 ? 'text-brand-700' : 'text-brand-900')}>
                {missingCount}
              </dd>
            </div>
          </dl>
        </section>

        {categories.length > 0 && spentCents > 0 && (
            <section aria-label="Spending by category" className="mt-5 rounded-md border border-line bg-white p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">Spending by category</h2>
                <span className="text-xs text-muted">{categories.length} categories</span>
              </div>
              <div className="mt-4 space-y-3">
                {categories.map(([cat, cents], i) => {
                  const share = (cents / spentCents) * 100
                  return (
                    <div key={cat} className="grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[minmax(8rem,14rem)_1fr_auto]">
                      <span className="min-w-0 truncate font-medium">{cat}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-brand-50" aria-hidden="true">
                        <div className={'h-full rounded-full ' + CAT_COLORS[Math.min(i, CAT_COLORS.length - 1)]} style={{ width: `${share}%` }} />
                      </div>
                      <span className="tabular-nums text-umber">{peso(cents / 100)}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

        <div className="mt-7 grid gap-5 xl:grid-cols-2">
          <BudgetFolderPicker budgetId={budget.id} />
          <BudgetEventLink budget={budget} spent={spent} canEdit={canEdit} onChanged={load} />
        </div>
        {canEdit && <AddExpenseForm budgetId={budget.id} onAdded={load} />}

        <section className="mt-9" aria-label="Expenses">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-brand-700 pb-3">
            <div>
              <h2 className="text-xl font-medium">Expenses</h2>
              <p className="mt-0.5 text-xs text-muted">{active.length} active {active.length === 1 ? 'entry' : 'entries'}</p>
            </div>
            {hasVoided && (
              <label className="flex min-h-11 items-center gap-2 py-2 text-sm text-umber">
                <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
                Show voided
              </label>
            )}
          </div>

          {missingCount > 0 && (
            <div className={noticeClass + ' mt-4 flex flex-wrap items-center justify-between gap-2'}>
              <span>{missingCount} {missingCount === 1 ? 'expense has' : 'expenses have'} no receipt yet.</span>
              <label className="flex min-h-11 items-center gap-2 py-2">
                <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
                Show only these
              </label>
            </div>
          )}

          {visible.length === 0 && (
            <p className="mt-4 border border-dashed border-ash bg-card px-4 py-6 text-sm text-muted">
              {canEdit ? 'No expenses yet. Add the first one above.' : 'No expenses recorded yet.'}
            </p>
          )}

          {visible.length > 0 && (
            <>
              <div className="mt-4 md:hidden">
                <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                  {visible.map((x) => <MobileExpenseRow key={x.id} expense={x} url={x.receipt_path ? urls[x.receipt_path] : undefined} onOpen={() => selectExpense(x.id)} />)}
                </ul>
              </div>

              <div className="mt-4 hidden md:block">
                <div className="overflow-x-auto rounded-md border border-line bg-white">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line bg-sand/70 text-left text-xs font-semibold uppercase tracking-wide text-umber">
                        <th className="w-14 px-2 py-2">Receipt</th>
                        <th className="px-3 py-2">Expense</th>
                        <th className="w-32 px-3 py-2">Category</th>
                        <th className="w-32 px-3 py-2">Date</th>
                        <th className="w-36 px-3 py-2 text-right">Amount</th>
                        <th className="w-28 px-3 py-2">Status</th>
                        <th className="w-28 px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((x) => {
                        const voided = !!x.voided_at
                        const thumb = x.receipt_path ? urls[x.receipt_path] : undefined
                        return (
                          <tr key={x.id} className={'border-b border-line last:border-b-0 ' + (voided ? 'opacity-60' : '')}>
                            <td className="px-2 py-2 align-middle">
                              <button type="button" onClick={() => selectExpense(x.id)} className="flex min-h-11 min-w-11 items-center justify-center" aria-label={`Open ${x.description}`}>
                                {thumb ? (
                                  <img src={thumb} alt="Receipt thumbnail" className="h-10 w-10 border border-line object-cover" />
                                ) : x.receipt_path ? (
                                  <span className="flex h-10 w-10 items-center justify-center border border-line bg-card text-[10px] text-muted">Loading</span>
                                ) : (
                                  <span className="flex h-10 w-10 items-center justify-center border border-dashed border-ash bg-card text-[10px] font-semibold text-umber">No receipt</span>
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <button type="button" onClick={() => selectExpense(x.id)} className="min-h-11 w-full py-2 text-left hover:text-brand-700">
                                <span className={'block font-medium break-words ' + (voided ? 'line-through' : '')}>{x.description}</span>
                                <span className="mt-0.5 block text-xs text-muted">Added by {names[x.added_by] ?? 'Unknown'}</span>
                              </button>
                            </td>
                            <td className="px-3 py-2 align-middle text-umber">{x.category}</td>
                            <td className="px-3 py-2 align-middle whitespace-nowrap text-umber">{formatDate(x.spent_on)}</td>
                            <td className={'px-3 py-2 text-right align-middle font-semibold tabular-nums ' + (voided ? 'line-through' : '')}>{peso(x.amount)}</td>
                            <td className="px-3 py-2 align-middle">
                              {voided ? <span className="text-xs font-semibold text-brand-700">Voided</span> : x.receipt_path ? <span className="text-xs text-umber">Receipt attached</span> : <span className="text-xs font-semibold text-brand-700">No receipt</span>}
                            </td>
                            <td className="px-3 py-2 text-right align-middle">
                              <button type="button" onClick={() => selectExpense(x.id)} className="min-h-11 px-2 text-xs font-semibold text-brand-700 hover:underline">Open</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>

        {canEdit && <ActivityLog budgetId={budget.id} names={names} />}
      </div>

      {isDesktop && selected && (
        <aside className="fixed inset-y-0 right-0 z-30 w-[min(28rem,40vw)] overflow-y-auto border-l border-line bg-white p-6 print:hidden" aria-label="Expense inspector">
          <ExpenseDetail
            expense={selected}
            url={selected.receipt_path ? urls[selected.receipt_path] : undefined}
            names={names}
            canEdit={canEdit}
            onChanged={load}
            onClose={closeDetail}
          />
        </aside>
      )}

      {!isDesktop && mobileSelected && (
        <Modal label="Expense details" onClose={closeDetail}>
          <ExpenseDetail
            expense={mobileSelected}
            url={mobileSelected.receipt_path ? urls[mobileSelected.receipt_path] : undefined}
            names={names}
            canEdit={canEdit}
            onChanged={load}
            onClose={closeDetail}
          />
        </Modal>
      )}

      <PrintBill budget={budget} expenses={expenses} urls={urls} names={names} spent={spent} left={left} />
    </>
  )
}

function MobileExpenseRow({ expense, url, onOpen }: { expense: Expense; url?: string; onOpen: () => void }) {
  const voided = !!expense.voided_at
  return (
    <li>
      <button type="button" onClick={onOpen} className={'flex min-h-16 w-full items-center gap-3 py-3 text-left ' + (voided ? 'opacity-60' : '')}>
        {url ? (
          <img src={url} alt="Receipt thumbnail" className="h-11 w-11 shrink-0 border border-line object-cover" />
        ) : expense.receipt_path ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-line bg-card text-[10px] text-muted">Loading</span>
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-dashed border-ash bg-card text-center text-[9px] leading-tight font-semibold text-umber">No receipt</span>
        )}
        <span className="min-w-0 flex-1">
          <span className={'block break-words text-sm font-medium ' + (voided ? 'line-through' : '')}>{expense.description}</span>
          <span className="mt-0.5 block text-xs text-muted">{expense.category} · {formatDate(expense.spent_on)}</span>
        </span>
        <span className={'shrink-0 text-sm font-semibold tabular-nums ' + (voided ? 'line-through' : '')}>{peso(expense.amount)}</span>
      </button>
    </li>
  )
}

/* ---------- change the total budget ---------- */
function ChangeTotal({ budget, onChanged }: { budget: Budget; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(String(budget.total_budget))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = Number(value)
    if (!(n >= 0)) return setError('Enter a number.')
    setBusy(true)
    const { error } = await supabase
      .from('budgets')
      .update({ total_budget: Math.round(n * 100) / 100 })
      .eq('id', budget.id)
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not change the budget.'))
    setError(null)
    setOpen(false)
    await onChanged()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(budget.total_budget))
          setOpen(true)
        }}
        className="mt-1 min-h-11 py-2 text-sm font-medium text-brand-700 hover:underline"
      >
        Change total
      </button>
    )
  }

  return (
    <form onSubmit={save} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        aria-label="New total budget"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-32 min-h-11 border border-line px-2 py-2 text-base sm:text-sm"
      />
      <button type="submit" disabled={busy} className={subtleButtonClass + ' min-h-11'}>Save</button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-11 py-2 text-sm text-muted hover:underline">Cancel</button>
      {error && <span role="alert" className="w-full text-xs text-brand-700">{error}</span>}
    </form>
  )
}

/* ---------- add an expense ---------- */
function AddExpenseForm({ budgetId, onAdded }: { budgetId: string; onAdded: () => Promise<void> }) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Food')
  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState(todayISO())
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const value = Number(amount)
    if (!description.trim()) return setError('Add a short description.')
    if (!(value > 0)) return setError('Enter an amount greater than zero.')

    setBusy(true)
    try {
      let receipt_path: string | null = null
      if (file) {
        const blob = await compressImage(file)
        const path = `${budgetId}/${crypto.randomUUID()}.jpg`
        const up = await supabase.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        receipt_path = path
      }
      const { error } = await supabase.from('expenses').insert({
        budget_id: budgetId,
        description: description.trim(),
        category: category.trim() || 'General',
        amount: Math.round(value * 100) / 100,
        spent_on: spentOn,
        receipt_path,
      })
      if (error) throw error

      setDescription('')
      setAmount('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await onAdded()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the expense.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 rounded-md border border-line bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700">Record keeping</p><h2 className="mt-1 text-xl font-semibold">Add an expense</h2></div><p className="text-xs text-muted">Attach a receipt to keep the ledger complete.</p></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="x-desc" className="text-sm font-medium">What was it for?</label>
          <input id="x-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Lunch for 30 members" className={inputClass} />
        </div>
        <div>
          <label htmlFor="x-amount" className="text-sm font-medium">Amount (PHP)</label>
          <input id="x-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="x-date" className="text-sm font-medium">Date spent</label>
          <input id="x-date" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="x-cat" className="text-sm font-medium">Category</label>
          <input id="x-cat" list="x-cats" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} />
          <datalist id="x-cats">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="x-file" className="text-sm font-medium">Receipt photo (optional)</label>
          <input id="x-file" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm file:mr-3 file:border-0 file:bg-white file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-paper" />
          <p className="mt-1 text-xs text-muted">You can also add the receipt later from the saved expense.</p>
        </div>
      </div>
      {error && <p role="alert" className="mt-4 border border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}
      <div className="mt-5 sm:max-w-48">
        <button type="submit" disabled={busy} className={buttonClass + ' min-h-11'}>{busy ? 'Saving…' : 'Add expense'}</button>
      </div>
    </form>
  )
}

/* ---------- attach a receipt to a saved expense ---------- */
function AttachReceipt({ expense, onChanged }: { expense: Expense; onChanged: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError('Choose a photo of the receipt first.')
    setBusy(true)
    setError(null)
    try {
      const blob = await compressImage(file)
      const path = `${expense.budget_id}/${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const { data, error } = await supabase.from('expenses').update({ receipt_path: path }).eq('id', expense.id).is('receipt_path', null).select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('A receipt was already attached to this expense.')
      setFile(null)
      await onChanged()
    } catch (err) {
      setError(errorMessage(err, 'Could not attach the receipt.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="border border-dashed border-ash bg-card p-4">
      <label htmlFor="attach-file" className="text-sm font-medium text-ink">This expense has no receipt yet</label>
      <input id="attach-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm file:mr-3 file:border-0 file:bg-white file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-paper" />
      {error && <p role="alert" className="mt-2 text-sm text-brand-700">{error}</p>}
      <div className="mt-3 sm:max-w-48"><button type="submit" disabled={busy || !file} className={buttonClass + ' min-h-11'}>{busy ? 'Attaching…' : 'Attach receipt'}</button></div>
      <p className="mt-2 text-xs text-ink">Once attached, a receipt can't be replaced. If it's the wrong photo, void the expense and add it again.</p>
    </form>
  )
}

/* ---------- one expense: receipt, details, void ---------- */
function ExpenseDetail({ expense, url, names, canEdit, onChanged, onClose }: { expense: Expense; url: string | undefined; names: Record<string, string>; canEdit: boolean; onChanged: () => Promise<void>; onClose: () => void }) {
  const { profile } = useAuth()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const voided = !!expense.voided_at

  async function voidExpense(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return setError('Say why this expense is being voided.')
    setBusy(true)
    const { error } = await supabase.from('expenses').update({ voided_at: new Date().toISOString(), void_reason: reason.trim(), voided_by: profile?.id }).eq('id', expense.id)
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not void the expense.'))
    setReason('')
    setError(null)
    await onChanged()
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="text-2xl font-medium tabular-nums">{peso(expense.amount)}</p>
          <p className="mt-1 break-words">{expense.description}</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-11 shrink-0 px-2 text-sm font-medium text-umber hover:text-ink">Close</button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div><dt className="text-muted">Category</dt><dd>{expense.category}</dd></div>
        <div><dt className="text-muted">Date spent</dt><dd>{formatDate(expense.spent_on)}</dd></div>
        <div><dt className="text-muted">Added by</dt><dd>{names[expense.added_by] ?? 'Unknown'}</dd></div>
        <div><dt className="text-muted">Recorded on</dt><dd>{formatDate(expense.created_at)}</dd></div>
      </dl>

      <div className="mt-5">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" title="Open full size">
            <img src={url} alt="Receipt" className="max-h-[70vh] w-full border border-line object-contain" />
          </a>
        ) : expense.receipt_path ? (
          <p className="text-sm text-muted">Loading receipt…</p>
        ) : voided || !canEdit ? (
          <p className="border border-dashed border-ash bg-card px-3 py-2 text-sm text-ink">No receipt attached.</p>
        ) : (
          <AttachReceipt expense={expense} onChanged={onChanged} />
        )}
      </div>

      {voided ? (
        <p className="mt-5 border border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">
          Voided on {formatDate(expense.voided_at!)}{expense.voided_by && names[expense.voided_by] ? ` by ${names[expense.voided_by]}` : ''}. Reason: {expense.void_reason}
        </p>
      ) : canEdit && (
        <form onSubmit={voidExpense} className="mt-5 border-t border-line pt-4">
          <label htmlFor="void-reason" className="text-sm font-medium">Void this expense</label>
          <p className="text-xs text-muted">It stays in the records, marked as voided, and no longer counts toward the total.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="min-h-11 min-w-0 flex-1 border border-line px-3 py-2.5 text-base sm:text-sm" />
            <button type="submit" disabled={busy} className={subtleButtonClass + ' min-h-11'}>{busy ? 'Voiding…' : 'Void expense'}</button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-brand-700">{error}</p>}
        </form>
      )}
    </div>
  )
}

/* ---------- audit trail (treasurer and admin only) ---------- */
type JsonRow = Record<string, string | number | null>
interface AuditRow { id: number; table_name: string; action: string; old_data: JsonRow | null; new_data: JsonRow | null; actor: string | null; at: string }

function describe(row: AuditRow): string {
  const n = row.new_data ?? {}
  const o = row.old_data ?? {}
  if (row.table_name === 'budgets') {
    if (row.action === 'INSERT') return `Created the budget with ${peso(Number(n.total_budget))}`
    if (n.total_budget !== o.total_budget) return `Changed the total budget from ${peso(Number(o.total_budget))} to ${peso(Number(n.total_budget))}`
    return 'Edited the budget'
  }
  if (row.action === 'INSERT') return `Added “${n.description}” for ${peso(Number(n.amount))}`
  if (!o.voided_at && n.voided_at) return `Voided “${n.description}” (${peso(Number(n.amount))}). Reason: ${n.void_reason}`
  if (!o.receipt_path && n.receipt_path) return `Attached a receipt to “${n.description}”`
  return `Edited “${n.description}”`
}

function ActivityLog({ budgetId, names }: { budgetId: string; names: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next) return
    const { data, error } = await supabase.from('audit_log').select('*').or(`new_data->>budget_id.eq.${budgetId},record_id.eq.${budgetId}`).order('at', { ascending: false }).limit(100)
    if (error) setError(error.message)
    else { setRows((data ?? []) as AuditRow[]); setError(null) }
  }

  return (
    <section className="mt-10 mb-10" aria-label="Activity log">
      <button type="button" onClick={() => void toggle()} aria-expanded={open} className="min-h-11 py-2 text-xl font-medium">Activity log {open ? '(hide)' : '(show)'}</button>
      {open && (
        <div className="mt-3">
          {error && <p role="alert" className="text-sm text-brand-700">{error}</p>}
          {!rows && !error && <p className="text-sm text-muted">Loading…</p>}
          {rows && rows.length === 0 && <p className="text-sm text-muted">Nothing recorded yet.</p>}
          {rows && rows.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm">
                  <p className="break-words">{describe(r)}</p>
                  <p className="text-xs text-muted">{r.actor ? names[r.actor] ?? 'Unknown' : 'System'}, {new Date(r.at).toLocaleString('en-PH')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
