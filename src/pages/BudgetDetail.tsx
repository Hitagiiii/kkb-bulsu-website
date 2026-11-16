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
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'

const CAT_COLORS = ['bg-brand-800', 'bg-gold-400', 'bg-brand-600', 'bg-slate-500', 'bg-amber-600', 'bg-rose-400', 'bg-slate-300']

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
  const [showVoided, setShowVoided] = useState(false)
  const [onlyMissing, setOnlyMissing] = useState(false)
  const urlCache = useRef<Record<string, string>>({})

  const closeDetail = useCallback(() => setSelectedId(null), [])

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
  const hasVoided = expenses.length !== active.length

  const catMap = new Map<string, number>()
  for (const x of active) {
    const key = x.category || 'General'
    catMap.set(key, (catMap.get(key) ?? 0) + Math.round(x.amount * 100))
  }
  const categories = [...catMap.entries()].sort((a, b) => b[1] - a[1])

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

  if (loading) return <p className="text-sm text-slate-500">Loading budget…</p>
  if (!budget) {
    return (
      <div>
        <p className="text-slate-600">{error ?? 'This budget does not exist, or you do not have access to it.'}</p>
        <Link to="/finance" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">
          Back to all budgets
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-4xl print:hidden">
        <Link to="/finance" className="inline-block py-1 text-sm font-medium text-brand-700 hover:underline">
          Back to all budgets
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold break-words sm:text-3xl">{budget.name}</h1>
            <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
              <span className={'h-2 w-2 rounded-full ' + (live ? 'bg-emerald-500' : 'bg-slate-300')} />
              {live ? 'Updates live' : 'Reconnecting…'}
            </p>
          </div>
          <button onClick={() => void printBill()} className={subtleButtonClass}>
            Print audit bill
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <section aria-label="Budget summary" className="mt-6">
          <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-brand-900 via-brand-800 to-brand-700 p-5 text-white shadow-sm sm:p-7">
            <span aria-hidden="true" className="absolute -top-16 -right-10 h-52 w-52 rounded-full bg-white/10" />
            <p className="relative text-sm text-white/70">{over ? 'Over budget by' : 'Money left'}</p>
            <p className={'font-display relative text-5xl font-bold tracking-tight tabular-nums break-words sm:text-6xl ' + (over ? 'text-red-200' : '')}>
              {peso(Math.abs(left))}
            </p>
            <div className="relative mt-5 h-2.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
              <div
                className={'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ' + (over ? 'bg-red-300' : 'bg-gold-400')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="relative mt-2 text-sm text-white/70">{Math.round(pct)}% of the budget used</p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <dt className="text-sm text-slate-500">Total budget</dt>
              <dd className="font-display mt-1 text-2xl font-semibold tabular-nums break-words">{peso(budget.total_budget)}</dd>
              {canEdit && <ChangeTotal budget={budget} onChanged={load} />}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <dt className="text-sm text-slate-500">Spent</dt>
              <dd className="font-display mt-1 text-2xl font-semibold tabular-nums break-words">{peso(spent)}</dd>
            </div>
            <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-1">
              <dt className="text-sm text-slate-500">Receipts missing</dt>
              <dd className={'font-display mt-1 text-2xl font-semibold ' + (missingCount > 0 ? 'text-amber-800' : 'text-brand-800')}>
                {missingCount}
              </dd>
            </div>
          </dl>

          {categories.length > 0 && spentCents > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="font-display text-lg font-semibold">Where the money went</h3>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Spending by category">
                {categories.map(([cat, cents], i) => (
                  <span
                    key={cat}
                    className={CAT_COLORS[Math.min(i, CAT_COLORS.length - 1)]}
                    style={{ width: `${(cents / spentCents) * 100}%` }}
                    title={`${cat}: ${peso(cents / 100)}`}
                  />
                ))}
              </div>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {categories.map(([cat, cents], i) => (
                  <li key={cat} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={'h-2.5 w-2.5 shrink-0 rounded-full ' + CAT_COLORS[Math.min(i, CAT_COLORS.length - 1)]} />
                      <span className="truncate">{cat}</span>
                    </span>
                    <span className="tabular-nums text-slate-600">{peso(cents / 100)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <BudgetFolderPicker budgetId={budget.id} />

        <BudgetEventLink budget={budget} spent={spent} canEdit={canEdit} onChanged={load} />

        {canEdit && <AddExpenseForm budgetId={budget.id} onAdded={load} />}

        <section className="mt-10" aria-label="Expenses">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Expenses ({active.length})</h2>
            {hasVoided && (
              <label className="flex items-center gap-2 py-1 text-sm text-slate-600">
                <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
                Show voided
              </label>
            )}
          </div>

          {missingCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>
                {missingCount} {missingCount === 1 ? 'expense has' : 'expenses have'} no receipt yet.
              </span>
              <label className="flex items-center gap-2 py-1">
                <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
                Show only these
              </label>
            </div>
          )}

          {visible.length === 0 && (
            <p className="mt-4 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
              {canEdit ? 'No expenses yet. Add the first one above.' : 'No expenses recorded yet.'}
            </p>
          )}

          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {visible.map((x) => {
              const isSelected = x.id === selectedId
              const voided = !!x.voided_at
              const thumb = x.receipt_path ? urls[x.receipt_path] : undefined
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : x.id)}
                    aria-pressed={isSelected}
                    className={
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ' +
                      (isSelected ? 'bg-brand-50 ' : '') +
                      (voided ? 'opacity-60' : '')
                    }
                  >
                    {thumb ? (
                      <img src={thumb} alt="Receipt thumbnail" className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover" />
                    ) : x.receipt_path ? (
                      <span className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-slate-100" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-amber-500 bg-amber-50 text-center text-[10px] leading-tight font-semibold text-amber-800">
                        No
                        <br />
                        receipt
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={'block text-sm font-medium break-words ' + (voided ? 'line-through' : '')}>{x.description}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{x.category}</span>
                        <span>{formatDate(x.spent_on)}</span>
                        {voided && <span className="font-medium text-red-700">Voided</span>}
                      </span>
                    </span>
                    <span className={'font-display shrink-0 text-lg font-semibold tabular-nums ' + (voided ? 'line-through' : '')}>
                      {peso(x.amount)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {canEdit && <ActivityLog budgetId={budget.id} names={names} />}
      </div>

      {selected && (
        <Modal label="Expense details" onClose={closeDetail}>
          <ExpenseDetail
            expense={selected}
            url={selected.receipt_path ? urls[selected.receipt_path] : undefined}
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
        onClick={() => {
          setValue(String(budget.total_budget))
          setOpen(true)
        }}
        className="mt-1 py-1 text-sm font-medium text-brand-700 hover:underline"
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
        className="w-32 rounded-md border border-slate-300 px-2 py-2 text-base sm:py-1 sm:text-sm"
      />
      <button type="submit" disabled={busy} className={subtleButtonClass}>
        Save
      </button>
      <button type="button" onClick={() => setOpen(false)} className="py-1 text-sm text-slate-500 hover:underline">
        Cancel
      </button>
      {error && <span role="alert" className="w-full text-xs text-red-700">{error}</span>}
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
    <form onSubmit={submit} className="mt-8 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="font-display text-xl font-semibold">Add an expense</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="x-desc" className="text-sm font-medium">What was it for?</label>
          <input
            id="x-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Lunch for 30 members"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="x-amount" className="text-sm font-medium">Amount (PHP)</label>
          <input
            id="x-amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="x-date" className="text-sm font-medium">Date spent</label>
          <input
            id="x-date"
            type="date"
            value={spentOn}
            onChange={(e) => setSpentOn(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="x-cat" className="text-sm font-medium">Category</label>
          <input
            id="x-cat"
            list="x-cats"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          />
          <datalist id="x-cats">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="x-file" className="text-sm font-medium">Receipt photo (optional)</label>
          <input
            id="x-file"
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-slate-200"
          />
          <p className="mt-1 text-xs text-slate-500">You can also add the receipt later from the saved expense.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 sm:max-w-48">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Saving…' : 'Add expense'}
        </button>
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

      // Only fill in an empty receipt slot, never replace an existing receipt
      const { data, error } = await supabase
        .from('expenses')
        .update({ receipt_path: path })
        .eq('id', expense.id)
        .is('receipt_path', null)
        .select('id')
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
    <form onSubmit={submit} className="rounded-lg border border-dashed border-amber-500 bg-amber-50 p-4">
      <label htmlFor="attach-file" className="text-sm font-medium text-amber-900">
        This expense has no receipt yet
      </label>
      <input
        id="attach-file"
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-slate-100"
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-3 sm:max-w-48">
        <button type="submit" disabled={busy || !file} className={buttonClass}>
          {busy ? 'Attaching…' : 'Attach receipt'}
        </button>
      </div>
      <p className="mt-2 text-xs text-amber-900">
        Once attached, a receipt can't be replaced. If it's the wrong photo, void the expense and add it again.
      </p>
    </form>
  )
}

/* ---------- one expense: receipt, details, void ---------- */
function ExpenseDetail({
  expense,
  url,
  names,
  canEdit,
  onChanged,
  onClose,
}: {
  expense: Expense
  url: string | undefined
  names: Record<string, string>
  canEdit: boolean
  onChanged: () => Promise<void>
  onClose: () => void
}) {
  const { profile } = useAuth()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const voided = !!expense.voided_at

  async function voidExpense(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return setError('Say why this expense is being voided.')
    setBusy(true)
    const { error } = await supabase
      .from('expenses')
      .update({ voided_at: new Date().toISOString(), void_reason: reason.trim(), voided_by: profile?.id })
      .eq('id', expense.id)
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not void the expense.'))
    setReason('')
    setError(null)
    await onChanged()
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-2xl font-semibold">{peso(expense.amount)}</p>
          <p className="mt-1 break-words">{expense.description}</p>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          Close
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-slate-500">Category</dt>
          <dd>{expense.category}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Date spent</dt>
          <dd>{formatDate(expense.spent_on)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Added by</dt>
          <dd>{names[expense.added_by] ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Recorded on</dt>
          <dd>{formatDate(expense.created_at)}</dd>
        </div>
      </dl>

      <div className="mt-5">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" title="Open full size">
            <img src={url} alt="Receipt" className="max-h-96 w-full rounded-lg border border-slate-200 object-contain" />
          </a>
        ) : expense.receipt_path ? (
          <p className="text-sm text-slate-500">Loading receipt…</p>
        ) : voided || !canEdit ? (
          <p className="rounded-md border border-dashed border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No receipt attached.
          </p>
        ) : (
          <AttachReceipt expense={expense} onChanged={onChanged} />
        )}
      </div>

      {voided ? (
        <p className="mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Voided on {formatDate(expense.voided_at!)}
          {expense.voided_by && names[expense.voided_by] ? ` by ${names[expense.voided_by]}` : ''}. Reason:{' '}
          {expense.void_reason}
        </p>
      ) : (
        canEdit && (
          <form onSubmit={voidExpense} className="mt-5 border-t border-slate-200 pt-4">
            <label htmlFor="void-reason" className="text-sm font-medium">Void this expense</label>
            <p className="text-xs text-slate-500">
              It stays in the records, marked as voided, and no longer counts toward the total.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                id="void-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (required)"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-base sm:py-2 sm:text-sm"
              />
              <button type="submit" disabled={busy} className={subtleButtonClass}>
                {busy ? 'Voiding…' : 'Void expense'}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
        )
      )}
    </div>
  )
}

/* ---------- audit trail (treasurer and admin only) ---------- */
type JsonRow = Record<string, string | number | null>
interface AuditRow {
  id: number
  table_name: string
  action: string
  old_data: JsonRow | null
  new_data: JsonRow | null
  actor: string | null
  at: string
}

function describe(row: AuditRow): string {
  const n = row.new_data ?? {}
  const o = row.old_data ?? {}
  if (row.table_name === 'budgets') {
    if (row.action === 'INSERT') return `Created the budget with ${peso(Number(n.total_budget))}`
    if (n.total_budget !== o.total_budget)
      return `Changed the total budget from ${peso(Number(o.total_budget))} to ${peso(Number(n.total_budget))}`
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
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .or(`new_data->>budget_id.eq.${budgetId},record_id.eq.${budgetId}`)
      .order('at', { ascending: false })
      .limit(100)
    if (error) setError(error.message)
    else {
      setRows((data ?? []) as AuditRow[])
      setError(null)
    }
  }

  return (
    <section className="mt-10 mb-10" aria-label="Activity log">
      <button onClick={() => void toggle()} aria-expanded={open} className="font-display py-1 text-xl font-semibold">
        Activity log {open ? '(hide)' : '(show)'}
      </button>
      {open && (
        <div className="mt-3">
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {!rows && !error && <p className="text-sm text-slate-500">Loading…</p>}
          {rows && rows.length === 0 && <p className="text-sm text-slate-500">Nothing recorded yet.</p>}
          {rows && rows.length > 0 && (
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {rows.map((r) => (
                <li key={r.id} className="py-3 text-sm">
                  <p className="break-words">{describe(r)}</p>
                  <p className="text-xs text-slate-500">
                    {r.actor ? names[r.actor] ?? 'Unknown' : 'System'}, {new Date(r.at).toLocaleString('en-PH')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
