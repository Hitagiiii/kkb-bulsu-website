import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { errorMessage, peso, type BudgetSummary } from '../lib/finance'
import { buttonClass, inputClass } from '../components/ui'

export default function Finance() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canEdit = hasRole(profile?.role, 'treasurer')

  const [rows, setRows] = useState<BudgetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [total, setTotal] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('budget_summary').select('*').order('name')
    if (error) setError(error.message)
    else {
      setRows((data ?? []) as BudgetSummary[])
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
      .insert({ name: name.trim(), total_budget: Math.round(value * 100) / 100 })
      .select('id')
      .single()
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not create the budget.'))
    navigate(`/finance/${data.id}`)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Finance</h1>
      <p className="mt-2 text-slate-600">One budget per event or activity. Open a budget to record expenses.</p>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {canEdit && (
        <form onSubmit={createBudget} className="mt-8 grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
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
            <label htmlFor="b-total" className="text-sm font-medium">Total budget (PHP)</label>
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
          <button type="submit" disabled={busy} className={buttonClass + ' sm:w-auto'}>
            {busy ? 'Creating…' : 'Create budget'}
          </button>
        </form>
      )}

      {loading && <p className="mt-10 text-sm text-slate-500">Loading budgets…</p>}

      {!loading && rows.length === 0 && (
        <p className="mt-10 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          {canEdit
            ? 'No budgets yet. Create the first one above.'
            : 'No budgets yet. The treasurer will add them here.'}
        </p>
      )}

      <ul className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
        {rows.map((r) => {
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
    </div>
  )
}
