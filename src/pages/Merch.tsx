import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { compressImage, errorMessage, peso } from '../lib/finance'
import { formatDateTime, timeUntil } from '../lib/announcements'
import { signedUrlsFor } from '../lib/storage'
import {
  hasArrived,
  METHOD_LABEL,
  orderBalance,
  orderTotal,
  payState,
  PAY_LABEL,
  PAY_TONE,
  pickup,
  PROOF_LABEL,
  PROOF_TONE,
  type MerchFolder,
  type MerchItem,
  type MerchOrder,
  type MerchPayment,
  type PaymentProof,
  type WaitlistRow,
} from '../lib/merch'
import Chip from '../components/Chip'
import { CheckIcon, ClockIcon, MinusIcon, PlusIcon } from '../components/Icons'
import MerchPhoto from '../components/MerchPhoto'
import PaymentInfoCard from '../components/PaymentInfoCard'
import StatCard from '../components/StatCard'
import { buttonClass, cardClass, eyebrowClass, inputClass, subtleButtonClass } from '../components/ui'
import PageHeader from '../components/PageHeader'
import Stepper from '../components/Stepper'

type Tab = 'all' | 'pay' | 'progress' | 'ready' | 'done'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pay', label: 'To pay' },
  { id: 'progress', label: 'In progress' },
  { id: 'ready', label: 'Ready to claim' },
  { id: 'done', label: 'Completed' },
]

function classify(o: MerchOrder, item: MerchItem | undefined): Exclude<Tab, 'all'> {
  if (o.cancelled_at || o.claimed_at) return 'done'
  if (orderBalance(o) > 0) return 'pay'
  return hasArrived(item) ? 'ready' : 'progress'
}

export default function Merch() {
  const { profile } = useAuth()
  const isFinance = profile?.role === 'treasurer'
  const [items, setItems] = useState<MerchItem[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [payments, setPayments] = useState<MerchPayment[]>([])
  const [proofs, setProofs] = useState<PaymentProof[]>([])
  const [folders, setFolders] = useState<MerchFolder[]>([])
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [section, setSection] = useState<'shop' | 'orders'>('shop')
  const [stockLeft, setStockLeft] = useState<Record<string, number>>({})
  const [waiting, setWaiting] = useState<WaitlistRow[]>([])

  const load = useCallback(async () => {
    if (!profile) return
    const [i, o, p, pr, f, st, wl] = await Promise.all([
      supabase.from('merch_items').select('*').order('created_at', { ascending: false }),
      supabase.from('merch_orders').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('merch_payments').select('*').order('received_at'),
      supabase.from('merch_payment_proofs').select('*').eq('user_id', profile.id).order('created_at'),
      supabase.from('merch_folders').select('*').order('created_at'),
      supabase.rpc('merch_stock_left'),
      supabase.from('merch_waitlist').select('*').eq('user_id', profile.id),
    ])
    // stock and waitlist come from a newer database update; the shop still works without them
    setStockLeft(Object.fromEntries(((st.data ?? []) as { item_id: string; stock_left: number }[]).map((x) => [x.item_id, x.stock_left])))
    setWaiting((wl.data ?? []) as WaitlistRow[])
    const err = i.error ?? o.error ?? p.error ?? pr.error ?? f.error
    if (err) {
      setError(err.message)
    } else {
      const mine = (o.data ?? []) as MerchOrder[]
      const ids = new Set(mine.map((x) => x.id))
      const proofRows = (pr.data ?? []) as PaymentProof[]
      setItems((i.data ?? []) as MerchItem[])
      setOrders(mine)
      setPayments(((p.data ?? []) as MerchPayment[]).filter((x) => ids.has(x.order_id)))
      setProofs(proofRows)
      setFolders((f.data ?? []) as MerchFolder[])
      setProofUrls(await signedUrlsFor('payment-proofs', proofRows.map((x) => x.image_path)))
      setError(null)
    }
    setLoading(false)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  const byId = Object.fromEntries(items.map((i) => [i.id, i]))
  const folderName = Object.fromEntries(folders.map((f) => [f.id, f.name]))
  const now = Date.now()
  const available = items.filter(
    (i) => i.stage === 'open' && (!i.order_deadline || new Date(i.order_deadline).getTime() > now),
  )

  const owing = orders
    .filter((o) => !o.cancelled_at && !o.claimed_at)
    .reduce((s, o) => s + Math.max(0, Math.round(orderBalance(o) * 100)), 0) / 100
  const readyCount = orders.filter((o) => classify(o, byId[o.item_id]) === 'ready').length
  const counts: Record<Tab, number> = {
    all: orders.length,
    pay: orders.filter((o) => classify(o, byId[o.item_id]) === 'pay').length,
    progress: orders.filter((o) => classify(o, byId[o.item_id]) === 'progress').length,
    ready: readyCount,
    done: orders.filter((o) => classify(o, byId[o.item_id]) === 'done').length,
  }
  const shown = orders.filter((o) => tab === 'all' || classify(o, byId[o.item_id]) === tab)

  const activeCount = orders.filter((o) => classify(o, byId[o.item_id]) !== 'done').length

  return (
    <div className="w-full">
      <PageHeader
        eyebrow={section === 'shop' ? 'The KKB collection' : 'Your orders'}
        title={section === 'shop' ? 'Wear your community.' : 'From us, to you.'}
        subtitle={
          section === 'shop'
            ? 'Thoughtful org essentials. Made for everyday campus life.'
            : 'Track every order, from payment to pickup.'
        }
        action={
          isFinance ? (
            <Link to="/merch/manage" className={subtleButtonClass}>
              Manage sales
            </Link>
          ) : undefined
        }
      />

      <div role="group" aria-label="Merch sections" className="mt-6 flex gap-5 border-b border-line text-sm">
        {([
          ['shop', 'Shop'],
          ['orders', `My orders (${activeCount})`],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={section === id}
            onClick={() => setSection(id)}
            className={
              '-mb-px min-h-11 border-b-2 transition-colors ' +
              (section === id ? 'border-brand-700 font-semibold text-brand-700' : 'border-transparent text-muted hover:text-ink')
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mt-6 border-l-4 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}

      {loading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Loading">
          {[0, 1].map((n) => (
            <div key={n} className="h-72 animate-pulse rounded-md bg-sand" />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {orders.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:max-w-xl">
              <StatCard label="You owe" value={peso(owing)} tone={owing > 0 ? 'warn' : 'good'} hint={owing > 0 ? 'Pay by GCash, then send proof' : 'All paid up'} />
              <StatCard label="Ready to claim" value={readyCount} tone={readyCount > 0 ? 'good' : 'default'} hint={readyCount > 0 ? 'Show this page to the finance head' : 'Nothing waiting yet'} />
            </div>
          )}

          {section === 'shop' && (
            <>
              <div className="mt-6">
                <PaymentInfoCard />
              </div>

              <section className="mt-8" aria-label="Open for orders">
                {available.length === 0 ? (
                  <div className={cardClass + ' px-4 py-10 text-center'}>
                    <p className="text-base font-semibold">Nothing is open for orders right now.</p>
                    <p className="mt-1 text-sm text-muted">New drops show up here as soon as officers open them.</p>
                  </div>
                ) : (
                  <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {available.map((item) => (
                      <li key={item.id}>
                        <ProductCard
                          item={item}
                          folder={item.folder_id ? folderName[item.folder_id] : undefined}
                          left={item.stock_limit !== null && item.stock_limit !== undefined ? stockLeft[item.id] ?? item.stock_limit : undefined}
                          waiting={waiting.find((w) => w.item_id === item.id)}
                          onOrdered={load}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-8 border-t border-line pt-5">
                  <p className="text-base font-medium">Made together, not mass produced.</p>
                  <p className="mt-1 text-sm text-muted">Payment confirms your order. Bring your student ID when claiming.</p>
                </div>
              </section>
            </>
          )}

          {section === 'orders' && (
            <section className="mt-6" aria-label="My orders">
              {orders.length === 0 ? (
                <div className={cardClass + ' px-4 py-12 text-center'}>
                  <p className="text-xl font-medium">Your first KKB find is waiting.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                    You haven’t placed an order yet. Browse the collection and find your everyday essential.
                  </p>
                  <button type="button" onClick={() => setSection('shop')} className={buttonClass + ' mx-auto mt-5 !w-auto'}>
                    Explore merch
                  </button>
                </div>
              ) : (
                <>
                  <div role="group" aria-label="Filter orders" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={
                          'shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:py-1.5 ' +
                          (tab === t.id ? 'border-brand-700 bg-soft text-brand-700' : 'border-line bg-white text-muted hover:bg-paper')
                        }
                      >
                        {t.label} <span className="opacity-70">({counts[t.id]})</span>
                      </button>
                    ))}
                  </div>

                  {shown.length === 0 ? (
                    <p className="mt-4 text-sm text-muted">No orders in this tab.</p>
                  ) : (
                    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
                    <ul className="grid gap-4">
                      {shown.map((o) => (
                        <li key={o.id}>
                          <OrderCard
                            order={o}
                            item={byId[o.item_id]}
                            folder={byId[o.item_id]?.folder_id ? folderName[byId[o.item_id].folder_id!] : undefined}
                            payments={payments.filter((x) => x.order_id === o.id && !x.voided_at)}
                            proofs={proofs.filter((x) => x.order_id === o.id)}
                            proofUrls={proofUrls}
                            onChanged={load}
                            onError={setError}
                          />
                        </li>
                      ))}
                    </ul>
                    <aside className="border-t border-line bg-sand/60 p-4 xl:sticky xl:top-6 xl:border-t-0 xl:border-l xl:bg-transparent xl:pl-5" aria-label="Order help">
                      <p className="text-[11px] font-bold tracking-[0.12em] text-brand-700 uppercase">Need a hand?</p>
                      <h3 className="mt-2 text-lg font-semibold">From order to pickup.</h3>
                      <p className="mt-1 text-sm text-muted">Your order moves through four steps. Keep your reference handy when claiming.</p>
                      <ol className="mt-4 space-y-3 border-l border-brand-200 pl-4 text-sm">
                        <li><strong className="block text-ink">1. Ordered</strong><span className="text-muted">Your item is reserved.</span></li>
                        <li><strong className="block text-ink">2. Paid</strong><span className="text-muted">Payment is verified by the treasurer.</span></li>
                        <li><strong className="block text-ink">3. Arrived</strong><span className="text-muted">You can arrange campus pickup.</span></li>
                        <li><strong className="block text-ink">4. Claimed</strong><span className="text-muted">Bring your student ID and order reference.</span></li>
                      </ol>
                    </aside>
                  </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* ---------- a product in the shop ---------- */
function ProductCard({
  item,
  folder,
  left,
  waiting,
  onOrdered,
}: {
  item: MerchItem
  folder?: string
  /** pieces left; undefined means no limit */
  left?: number
  waiting?: WaitlistRow
  onOrdered: () => Promise<void>
}) {
  const { profile } = useAuth()
  const [variant, setVariant] = useState('')
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [joined, setJoined] = useState(false)
  const soldOut = left !== undefined && qty > left
  const maxQty = left === undefined ? 10 : Math.max(1, Math.min(10, left))

  async function joinWaitlist() {
    if (!profile) return
    if (item.variants.length > 0 && !variant) return setError('Choose a size or type first.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('merch_waitlist').insert({
      item_id: item.id,
      user_id: profile.id,
      variant: item.variants.length > 0 ? variant : null,
      quantity: qty,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not join the waitlist.'))
    setJoined(true)
    await onOrdered()
  }

  async function leaveWaitlist() {
    if (!waiting) return
    setBusy(true)
    const { error } = await supabase.from('merch_waitlist').delete().eq('id', waiting.id)
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not leave the waitlist.'))
    setJoined(false)
    await onOrdered()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setDone(false)
    if (!profile) return
    if (soldOut) return
    if (item.variants.length > 0 && !variant) return setError('Choose a size or type first.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('merch_orders').insert({
      item_id: item.id,
      user_id: profile.id,
      variant: item.variants.length > 0 ? variant : null,
      quantity: qty,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not place the order.'))
    setDone(true)
    setQty(1)
    await onOrdered()
  }

  return (
    <form onSubmit={submit} className="h-full overflow-hidden rounded-md border border-line bg-white">
      <div className="relative">
        <MerchPhoto paths={item.image_paths ?? []} category={item.category} name={item.name} className="aspect-[4/3] w-full" gallery />
        <span className="absolute top-3 right-3 rounded-md bg-white px-2.5 py-1 text-sm font-semibold text-ink tabular-nums">
          {peso(item.price)}
        </span>
        {item.order_deadline && (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-brand-700">
            <ClockIcon size={13} />
            Closes {timeUntil(item.order_deadline)}
          </span>
        )}
        {left !== undefined && (
          <span className={'absolute right-3 bottom-3 rounded-md px-2.5 py-1 text-xs font-semibold ' + (left === 0 ? 'bg-ink text-white' : left <= 5 ? 'bg-accent-100 text-accent-700' : 'bg-white text-ink')}>
            {left === 0 ? 'Sold out' : `${left} left`}
          </span>
        )}
      </div>

      <div className="border-t-4 border-brand-700 p-4 sm:p-5">
        <h3 className="text-lg font-semibold tracking-tight break-words">{item.name}</h3>
        <p className="text-sm text-muted">
          {item.category}
          {folder && ` · ${folder}`}
        </p>

        {item.variants.length > 0 && (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Size or type</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.variants.map((v) => (
                <label key={v} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`variant-${item.id}`}
                    value={v}
                    checked={variant === v}
                    onChange={() => setVariant(v)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex min-w-11 items-center justify-center rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-ink transition-colors peer-checked:border-brand-700 peer-checked:bg-brand-700 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700 hover:bg-paper peer-checked:hover:bg-brand-800">
                    {v}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center rounded-md border border-line" role="group" aria-label="Quantity">
            <button
              type="button"
              aria-label="One less"
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="rounded-md p-3 text-ink hover:bg-paper disabled:opacity-40 sm:p-2.5"
            >
              <MinusIcon />
            </button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{qty}</span>
            <button
              type="button"
              aria-label="One more"
              disabled={qty >= maxQty && left !== 0}
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              className="rounded-md p-3 text-ink hover:bg-paper disabled:opacity-40 sm:p-2.5"
            >
              <PlusIcon />
            </button>
          </div>
          <p className="text-lg font-semibold tabular-nums">{peso(item.price * qty)}</p>
        </div>

        {error && <p role="alert" className="mt-3 rounded-md bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}
        {done && (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-md bg-success-pale px-3 py-2 text-sm text-success-deep">
            <CheckIcon size={16} className="mt-0.5 shrink-0" />
            Order placed. Pay with the GCash details above, then send your proof under "My orders".
          </p>
        )}

        {waiting ? (
          <div className="mt-4 rounded-md bg-paper p-3 text-sm">
            <p className="font-semibold text-ink">You’re on the waitlist</p>
            <p className="mt-0.5 text-muted">
              {waiting.quantity} × {item.name}
              {waiting.variant ? ` (${waiting.variant})` : ''}. We’ll notify you if a piece opens up.
            </p>
            <button type="button" disabled={busy} onClick={() => void leaveWaitlist()} className="mt-2 min-h-11 py-2 text-muted underline underline-offset-2 hover:text-brand-700">
              Leave waitlist
            </button>
          </div>
        ) : soldOut ? (
          <div className="mt-4">
            <p className="mb-2 text-sm text-muted">
              {left === 0 ? 'This item is sold out.' : `Only ${left} left, fewer than you picked.`} Join the waitlist and we’ll tell you if a piece frees up.
            </p>
            <button type="button" disabled={busy} onClick={() => void joinWaitlist()} className={subtleButtonClass + ' w-full'}>
              {busy ? 'Joining…' : 'Join the waitlist'}
            </button>
            {joined && <p role="status" className="mt-2 text-sm text-success-deep">You’re on the list.</p>}
          </div>
        ) : (
          <div className="mt-4">
            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? 'Placing order…' : 'Place order'}
            </button>
          </div>
        )}
      </div>
    </form>
  )
}

/* ---------- one of my orders ---------- */
function OrderCard({
  order: o,
  item,
  folder,
  payments,
  proofs,
  proofUrls,
  onChanged,
  onError,
}: {
  order: MerchOrder
  item: MerchItem | undefined
  folder?: string
  payments: MerchPayment[]
  proofs: PaymentProof[]
  proofUrls: Record<string, string>
  onChanged: () => Promise<void>
  onError: (m: string | null) => void
}) {
  const [cancelling, setCancelling] = useState(false)
  const total = orderTotal(o)
  const balance = orderBalance(o)
  const p = payState(o)
  const st = pickup(o, item)
  const cancelled = !!o.cancelled_at
  const pct = total > 0 ? Math.min(100, (o.amount_paid / total) * 100) : 100
  const canCancel = !cancelled && !o.claimed_at && o.amount_paid === 0
  const canSendProof = !cancelled && !o.claimed_at && balance > 0

  async function cancel() {
    const { error } = await supabase.rpc('cancel_order', { p_id: o.id, p_reason: 'Cancelled by the member' })
    setCancelling(false)
    if (error) return onError(errorMessage(error, 'Could not cancel the order.'))
    await onChanged()
  }

  return (
    <article className={'overflow-hidden rounded-md border border-line bg-white ' + (cancelled ? 'opacity-70' : '')}>
      <div className="flex gap-4 p-4 sm:p-5">
        <MerchPhoto paths={item?.image_paths ?? []} category={item?.category ?? ''} name={item?.name ?? 'Item'} className="h-16 w-16 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3 className="text-lg leading-snug font-medium break-words">
              {item?.name ?? 'Item'}
              {o.variant && <span className="font-sans text-base font-normal text-umber"> ({o.variant})</span>}
            </h3>
            <Chip tone={st.tone}>{st.label}</Chip>
          </div>
          <p className="text-sm text-muted">
            Quantity {o.quantity}
            {folder && ` · ${folder}`}
          </p>
        </div>
      </div>

      <div className="border-t border-line px-4 pb-4 sm:px-5 sm:pb-5">
        {cancelled ? (
          <p className="mt-4 rounded-md bg-soft px-3 py-2 text-sm text-brand-700">
            This order was cancelled{o.cancel_reason ? `: ${o.cancel_reason}` : '.'}
            {o.amount_paid > 0 && ' Ask the finance head about your refund.'}
          </p>
        ) : (
          <div className="mt-4">
            <Stepper
              steps={['Ordered', 'Paid', 'Arrived', 'Claimed']}
              done={[true, balance <= 0, hasArrived(item), !!o.claimed_at].findIndex((x) => !x) === -1 ? 4 : [true, balance <= 0, hasArrived(item), !!o.claimed_at].findIndex((x) => !x)}
            />
            <p className="mt-3 text-xs text-muted">{st.label}</p>
          </div>
        )}

        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-umber">
              Paid <span className="font-semibold text-ink tabular-nums">{peso(o.amount_paid)}</span> of{' '}
              <span className="tabular-nums">{peso(total)}</span>
            </span>
            {!cancelled && <Chip tone={PAY_TONE[p]}>{PAY_LABEL[p]}</Chip>}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-700 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
          {!cancelled && balance > 0 && (
            <p className="mt-1.5 text-sm font-semibold text-brand-700">Balance {peso(balance)}</p>
          )}
          {o.claimed_at && <p className="mt-1.5 text-xs text-muted">Claimed {formatDateTime(o.claimed_at)}</p>}
        </div>

        {(payments.length > 0 || proofs.some((x) => x.status !== 'verified')) && (
          <ul className="mt-4 space-y-2 text-sm">
            {payments.map((x) => (
              <li key={x.id} className="flex items-start gap-2 text-ink">
                <CheckIcon size={16} className="mt-0.5 shrink-0 text-success-deep" />
                <span>
                  Payment of {peso(x.amount)} confirmed ({METHOD_LABEL[x.method]}, {formatDateTime(x.received_at)})
                </span>
              </li>
            ))}
            {proofs
              .filter((x) => x.status !== 'verified')
              .map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 text-ink">
                  {proofUrls[x.image_path] && (
                    <a href={proofUrls[x.image_path]} target="_blank" rel="noreferrer">
                      <img src={proofUrls[x.image_path]} alt="Your payment screenshot" className="h-10 w-10 rounded border border-line object-cover" />
                    </a>
                  )}
                  <span>
                    Proof of {peso(x.amount)} sent {formatDateTime(x.created_at)}
                  </span>
                  <Chip tone={PROOF_TONE[x.status]}>{PROOF_LABEL[x.status]}</Chip>
                  {x.status === 'rejected' && x.reject_reason && <span className="text-xs text-brand-700">Reason: {x.reject_reason}</span>}
                </li>
              ))}
          </ul>
        )}

        {canSendProof && <ProofForm order={o} onSent={onChanged} />}

        {canCancel && (
          <div className="mt-3 text-sm">
            {cancelling ? (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-ink">Cancel this order?</span>
                <button onClick={() => void cancel()} className="py-1 font-semibold text-brand-700 hover:underline">
                  Yes, cancel it
                </button>
                <button onClick={() => setCancelling(false)} className="py-1 text-umber hover:underline">
                  Keep it
                </button>
              </span>
            ) : (
              <button onClick={() => setCancelling(true)} className="py-1 text-umber hover:text-brand-700 hover:underline">
                Cancel order
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

/* ---------- send a screenshot of your payment to the finance head ---------- */
function ProofForm({ order, onSent }: { order: MerchOrder; onSent: () => Promise<void> }) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(orderBalance(order)))
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        onClick={() => {
          setAmount(String(orderBalance(order)))
          setOpen(true)
        }}
        className={buttonClass + ' mt-4'}
      >
        Pay {peso(orderBalance(order))} via GCash
      </button>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    const v = Number(amount)
    if (!file) return setError('Choose the screenshot of your payment.')
    if (!confirmed) return setError('Please confirm this proof is for this order.')
    if (!(v > 0)) return setError('Enter the amount you paid.')
    if (Math.round(v * 100) > Math.round(orderBalance(order) * 100)) {
      return setError(`That is more than your balance of ${peso(orderBalance(order))}.`)
    }
    setBusy(true)
    setError(null)
    const path = `${profile.id}/${crypto.randomUUID()}.jpg`
    try {
      const blob = await compressImage(file)
      const up = await supabase.storage.from('payment-proofs').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const { error } = await supabase.from('merch_payment_proofs').insert({
        order_id: order.id,
        image_path: path,
        amount: Math.round(v * 100) / 100,
        reference: reference.trim() || null,
      })
      if (error) {
        await supabase.storage.from('payment-proofs').remove([path])
        throw error
      }
      setOpen(false)
      setFile(null)
      setReference('')
      setConfirmed(false)
      await onSent()
    } catch (err) {
      setError(errorMessage(err, 'Could not send the proof.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-md border border-line bg-paper p-4">
      <p className={eyebrowClass}>GCash / Send money</p>
      <p className="mt-1 text-sm text-muted">Amount to send</p>
      <p className="text-3xl font-medium tabular-nums text-ink">{peso(orderBalance(order))}</p>
      <ol className="mt-3 space-y-1 text-sm text-ink">
        <li>1 Pay the exact amount in GCash using the details in the Shop tab.</li>
        <li>2 Save your successful transaction receipt.</li>
        <li>3 Upload it below with the reference number.</li>
      </ol>
      <p className="mt-2 text-xs text-muted">Never share your MPIN or OTP. GCash fees are not included.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`pf-${order.id}`} className="text-sm font-semibold">Payment receipt</label>
          <input
            id={`pf-${order.id}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2.5 file:text-sm file:font-semibold hover:file:bg-paper"
          />
          <p className="mt-1 text-xs text-muted">PNG or JPG. Keep amount, date and reference visible.</p>
        </div>
        <div>
          <label htmlFor={`pa-${order.id}`} className="text-sm font-semibold">Amount you paid (PHP)</label>
          <input id={`pa-${order.id}`} type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`pr-${order.id}`} className="text-sm font-semibold">GCash reference number</label>
          <input id={`pr-${order.id}`} value={reference} maxLength={60} placeholder="13-digit reference number" onChange={(e) => setReference(e.target.value)} className={inputClass} />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
          I confirm this proof is for this order.
        </label>
        {error && <p role="alert" className="rounded-md bg-soft px-3 py-2 text-sm text-brand-700 sm:col-span-2">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <div className="w-full sm:w-auto sm:min-w-44">
            <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="py-2 text-sm text-muted hover:underline">Cancel</button>
        </div>
        <p className="text-xs text-muted sm:col-span-2">Your order moves to Paid after the treasurer verifies it, usually within 1 school day.</p>
      </div>
    </form>
  )
}
