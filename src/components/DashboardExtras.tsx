import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { formatDate, peso, todayISO } from '../lib/finance'
import { noticeClass } from './ui'

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

/** Merch pickup / balance banner for everyone, "my tasks" for officers. */
export default function DashboardExtras() {
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

  return (
    <>
      {isFinance && proofsWaiting > 0 && (
        <Link
          to="/merch/manage"
          className={noticeClass + ' mt-4 block hover:bg-secondary'}
        >
          {proofsWaiting} payment {proofsWaiting === 1 ? 'proof is' : 'proofs are'} waiting for you to verify.
        </Link>
      )}

      {(ready > 0 || owing > 0) && (
        <Link
          to="/merch"
          className={noticeClass + ' mt-4 block hover:bg-secondary'}
        >
          {ready > 0 && `${ready} merch ${ready === 1 ? 'order is' : 'orders are'} ready to claim. `}
          {owing > 0 && `You still owe ${peso(owing)} for merch.`}
        </Link>
      )}

      {isOfficer && tasks.length > 0 && (
        <section className="mt-10" aria-label="My tasks">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl font-semibold">My tasks</h2>
            <Link to="/tasks" className="py-1 text-sm font-medium text-brand-700 hover:underline">See all</Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
            {tasks.map((t) => (
              <li key={t.id}>
                <Link to="/tasks" className="block py-3 transition-colors hover:text-brand-700">
                  <p className="font-medium break-words">{t.title}</p>
                  {t.due_on && (
                    <p className={'text-sm ' + (t.due_on < today ? 'font-semibold text-red-700' : 'text-slate-500')}>
                      {t.due_on < today ? 'Overdue: ' : 'Due '}
                      {formatDate(t.due_on)}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
