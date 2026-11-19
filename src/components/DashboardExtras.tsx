import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { formatDate, peso, todayISO } from '../lib/finance'
import { ChevronRightIcon } from './Icons'

interface OrderBit {
  quantity: number
  unit_price: number
  amount_paid: number
  merch_items: { name: string; stage: string } | null
}
interface TaskBit {
  id: string
  title: string
  due_on: string | null
}
interface AlertRow {
  key: string
  to: string
  text: string
  action: string
}

/**
 * Everything that needs the person to act: polls to vote on, merch ready or owed,
 * payment proofs to verify (finance), and "my tasks" (officers).
 * Renders nothing when there is nothing to do. The parent decides where it sits.
 */
export default function DashboardExtras({
  pollsWaiting,
  className = '',
}: {
  pollsWaiting: number | null
  className?: string
}) {
  const { profile } = useAuth()
  const isOfficer = hasRole(profile?.role, 'officer')
  const [orders, setOrders] = useState<OrderBit[]>([])
  const [tasks, setTasks] = useState<TaskBit[]>([])
  const [proofsWaiting, setProofsWaiting] = useState(0)
  const isFinance = profile?.role === 'treasurer'

  useEffect(() => {
    if (!profile) return
    supabase
      .from('merch_orders')
      .select('quantity, unit_price, amount_paid, merch_items(name, stage)')
      .eq('user_id', profile.id)
      .is('cancelled_at', null)
      .is('claimed_at', null)
      .then(({ data }) => setOrders((data ?? []) as unknown as OrderBit[]))
    if (isOfficer) {
      supabase
        .from('tasks')
        .select('id, title, due_on')
        .eq('assigned_to', profile.id)
        .neq('status', 'done')
        .order('due_on', { ascending: true, nullsFirst: false })
        .limit(5)
        .then(({ data }) => setTasks((data ?? []) as TaskBit[]))
    }
    if (isFinance) {
      supabase
        .from('merch_payment_proofs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count }) => setProofsWaiting(count ?? 0))
    }
  }, [profile, isOfficer, isFinance])

  const cents = (n: number) => Math.round(n * 100)
  const owing = orders.reduce((s, o) => s + Math.max(0, cents(o.unit_price) * o.quantity - cents(o.amount_paid)), 0) / 100
  const ready = orders.filter((o) => {
    const arrived = o.merch_items?.stage === 'arrived' || o.merch_items?.stage === 'closed'
    return arrived && cents(o.unit_price) * o.quantity - cents(o.amount_paid) <= 0
  }).length
  const today = todayISO()

  const alerts: AlertRow[] = []
  if (pollsWaiting && pollsWaiting > 0) {
    alerts.push({
      key: 'polls',
      to: '/polls',
      text: pollsWaiting === 1 ? '1 poll is waiting for your vote' : `${pollsWaiting} polls are waiting for your vote`,
      action: 'Vote',
    })
  }
  if (isFinance && proofsWaiting > 0) {
    alerts.push({
      key: 'proofs',
      to: '/merch/manage',
      text: `${proofsWaiting} payment ${proofsWaiting === 1 ? 'proof is' : 'proofs are'} waiting for you to verify`,
      action: 'Verify',
    })
  }
  if (ready > 0) {
    alerts.push({
      key: 'ready',
      to: '/merch',
      text: `${ready} merch ${ready === 1 ? 'order is' : 'orders are'} ready to claim`,
      action: 'View',
    })
  }
  if (owing > 0) {
    alerts.push({ key: 'owing', to: '/merch', text: `You still owe ${peso(owing)} for merch`, action: 'Pay' })
  }

  const showTasks = isOfficer && tasks.length > 0
  if (alerts.length === 0 && !showTasks) return null

  return (
    <section aria-label="Needs your attention" className={className}>
      {alerts.length > 0 && (
        <>
          <h2 className="font-display text-lg font-bold">Needs your attention</h2>
          <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
            {alerts.map((a) => (
              <li key={a.key}>
                <Link to={a.to} className="flex items-center justify-between gap-3 px-1 py-3 transition-colors hover:bg-card">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-brand-700" />
                    <span className="min-w-0 text-sm font-medium break-words text-ink">{a.text}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-sm font-bold text-brand-700">
                    {a.action}
                    <ChevronRightIcon size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {showTasks && (
        <div className={alerts.length > 0 ? 'mt-6' : ''}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-lg font-bold">My tasks</h2>
            <Link to="/tasks" className="py-1 text-sm font-medium text-brand-700 hover:underline">
              See all
            </Link>
          </div>
          <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
            {tasks.map((t) => (
              <li key={t.id}>
                <Link to="/tasks" className="block px-1 py-2.5 transition-colors hover:bg-card">
                  <p className="text-sm font-medium break-words text-ink">{t.title}</p>
                  {t.due_on && (
                    <p className={'text-xs ' + (t.due_on < today ? 'font-semibold text-error' : 'text-slate-500')}>
                      {t.due_on < today ? 'Overdue: ' : 'Due '}
                      {formatDate(t.due_on)}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}