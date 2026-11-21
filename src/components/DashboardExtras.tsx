import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { formatDate, peso, todayISO } from '../lib/finance'
import { ChevronRightIcon } from './Icons'
import { eyebrowClass } from './ui'

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
  eyebrow: string
  text: string
  detail: string
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
  if (owing > 0) {
    alerts.push({
      key: 'owing',
      to: '/merch',
      eyebrow: 'Action needed',
      text: 'Your merch order is waiting for payment',
      detail: `You still owe ${peso(owing)}. Pay by GCash, then send your proof`,
    })
  }
  if (isFinance && proofsWaiting > 0) {
    alerts.push({
      key: 'proofs',
      to: '/merch/manage',
      eyebrow: 'Action needed',
      text: `${proofsWaiting} payment ${proofsWaiting === 1 ? 'proof is' : 'proofs are'} waiting for you to verify`,
      detail: 'Review the screenshots and verify the payments',
    })
  }
  if (ready > 0) {
    alerts.push({
      key: 'ready',
      to: '/merch',
      eyebrow: 'Ready to claim',
      text: `${ready} merch ${ready === 1 ? 'order is' : 'orders are'} ready to claim`,
      detail: 'Bring your student ID when claiming',
    })
  }
  if (pollsWaiting && pollsWaiting > 0) {
    alerts.push({
      key: 'polls',
      to: '/polls',
      eyebrow: 'Member poll',
      text: pollsWaiting === 1 ? '1 poll is waiting for your vote' : `${pollsWaiting} polls are waiting for your vote`,
      detail: 'One vote per member. It takes a few seconds',
    })
  }

  const showTasks = isOfficer && tasks.length > 0
  if (alerts.length === 0 && !showTasks) return null

  return (
    <section aria-label="Needs your attention" className={className}>
      {alerts.length > 0 && (
        <>
          <h2 className="text-xl font-medium text-ink">Needs your attention</h2>
          <ul className="mt-3 space-y-3">
            {alerts.map((a) => (
              <li key={a.key}>
                <Link to={a.to} className="block rounded-md border border-line bg-white p-4 transition-colors hover:bg-paper">
                  <p className={eyebrowClass}>{a.eyebrow}</p>
                  <p className="mt-1 text-base font-semibold break-words text-ink">{a.text}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                    {a.detail}
                    <ChevronRightIcon size={12} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {showTasks && (
        <div className={alerts.length > 0 ? 'mt-8' : ''}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-medium text-ink">My tasks</h2>
            <Link to="/tasks" className="py-1 text-sm font-semibold text-brand-700 hover:underline">
              See all
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-white">
            {tasks.map((t) => (
              <li key={t.id}>
                <Link to="/tasks" className="block px-4 py-3 transition-colors hover:bg-paper">
                  <p className="text-sm font-semibold break-words text-ink">{t.title}</p>
                  {t.due_on && (
                    <p className={'text-xs ' + (t.due_on < today ? 'font-semibold text-error' : 'text-muted')}>
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
