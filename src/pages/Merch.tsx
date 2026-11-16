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
} from '../lib/merch'
import Chip from '../components/Chip'
import { CheckIcon, ClockIcon, MinusIcon, PlusIcon, ProductArt } from '../components/Icons'
import PaymentInfoCard from '../components/PaymentInfoCard'
import StatCard from '../components/StatCard'
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'

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

  const load = useCallback(async () => {
    if (!profile) return
    const [i, o, p, pr, f] = await Promise.all([
      supabase.from('merch_items').select('*').order('created_at', { ascending: false }),
      supabase.from('merch_orders').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('merch_payments').select('*').order('received_at'),
      supabase.from('merch_payment_proofs').select('*').eq('user_id', profile.id).order('created_at'),
      supabase.from('merch_folders').select('*').order('created_at'),
    ])
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

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Merch</h1>
          <p className="mt-2 text-slate-600">Order, pay by GCash, send your screenshot, then claim it when it arrives.</p>
        </div>
        {isFinance && (
          <Link to="/merch/manage" className={subtleButtonClass}>
            Manage sales
          </Link>
        )}
      </div>

      {error && <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-label="Loading">
          {[0, 1].map((n) => (
            <div key={n} className="h-72 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {orders.length > 0 && (
            <div className="mt-8 grid grid-cols-2 gap-4">
              <StatCard label="You owe" value={peso(owing)} tone={owing > 0 ? 'warn' : 'good'} hint={owing > 0 ? 'Pay by GCash, then send proof' : 'All paid up'} />
              <StatCard label="Ready to claim" value={readyCount} tone={readyCount > 0 ? 'good' : 'default'} hint={readyCount > 0 ? 'Show this page to the finance head' : 'Nothing waiting yet'} />
            </div>
          )}

          <div className="mt-8">
            <PaymentInfoCard />
          </div>

          <section className="mt-12" aria-label="Open for orders">
            <h2 className="font-display text-xl font-semibold">Shop</h2>
            {available.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Nothing is open for orders right now.
              </p>
            ) : (
              <ul className="mt-4 grid gap-5 sm:grid-cols-2">
                {available.map((item, i) => (
                  <li key={item.id} className="animate-fade-up motion-reduce:animate-none" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                    <ProductCard item={item} folder={item.folder_id ? folderName[item.folder_id] : undefined} onOrdered={load} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-12" aria-label="My orders">
            <h2 className="font-display text-xl font-semibold">My orders</h2>

            {orders.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                You have not ordered anything yet.
              </p>
            ) : (
              <>
                <div role="group" aria-label="Filter orders" className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={tab === t.id}
                      onClick={() => setTab(t.id)}
                      className={
                        'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors sm:py-1.5 ' +
                        (tab === t.id
                          ? 'border-brand-700 bg-brand-700 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
                      }
                    >
                      {t.label} <span className={tab === t.id ? 'text-white/80' : 'text-slate-500'}>({counts[t.id]})</span>
                    </button>
                  ))}
                </div>

                {shown.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No orders in this tab.</p>
                ) : (
                  <ul className="mt-4 space-y-4">
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
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/* ---------- a product in the shop ---------- */
function ProductCard({ item, folder, onOrdered }: { item: MerchItem; folder?: string; onOrdered: () => Promise<void> }) {
  const { profile } = useAuth()
  const [variant, setVariant] = useState('')
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setDone(false)
    if (!profile) return
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
    <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none">
      <div className="relative">
        <ProductArt category={item.category} />
        <span className="font-display absolute top-3 right-3 rounded-full bg-white px-3 py-1 text-lg font-semibold text-brand-900 shadow">
          {peso(item.price)}
        </span>
        {item.order_deadline && (
          <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur">
            <ClockIcon size={13} />
            Closes {timeUntil(item.order_deadline)}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-display text-lg font-semibold break-words">{item.name}</h3>
        <p className="text-sm text-slate-500">
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
                  <span className="inline-flex min-w-11 items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors peer-checked:border-brand-700 peer-checked:bg-brand-700 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 hover:bg-slate-50 peer-checked:hover:bg-brand-700">
                    {v}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center rounded-full border border-slate-300" role="group" aria-label="Quantity">
            <button
              type="button"
              aria-label="One less"
              disabled={qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="rounded-full p-3 text-slate-700 hover:bg-slate-100 disabled:opacity-40 sm:p-2.5"
            >
              <MinusIcon />
            </button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{qty}</span>
            <button
              type="button"
              aria-label="One more"
              disabled={qty >= 10}
              onClick={() => setQty((q) => Math.min(10, q + 1))}
              className="rounded-full p-3 text-slate-700 hover:bg-slate-100 disabled:opacity-40 sm:p-2.5"
            >
              <PlusIcon />
            </button>
          </div>
          <p className="font-display text-lg font-semibold tabular-nums">{peso(item.price * qty)}</p>
        </div>

        {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {done && (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <CheckIcon size={16} className="mt-0.5 shrink-0" />
            Order placed. Pay with the GCash details above, then send your proof under "My orders".
          </p>
        )}

        <div className="mt-4">
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? 'Placing order…' : 'Place order'}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ---------- step tracker (ordered, paid, arrived, claimed) ---------- */
function Steps({ steps }: { steps: { label: string; done: boolean }[] }) {
  const current = steps.findIndex((s) => !s.done)
  return (
    <ol className="mt-5 flex items-start" aria-label="Order progress">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex flex-1 flex-col items-center text-center" aria-current={i === current ? 'step' : undefined}>
          {i > 0 && (
            <span aria-hidden="true" className={'absolute top-3 -left-1/2 h-0.5 w-full ' + (s.done ? 'bg-brand-700' : 'bg-slate-200')} />
          )}
          <span
            className={
              'relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-white ' +
              (s.done ? 'bg-brand-700' : i === current ? 'border-2 border-gold-400 bg-white' : 'bg-slate-200')
            }
          >
            {s.done && <CheckIcon size={14} />}
          </span>
          <span className={'mt-1.5 text-xs ' + (s.done ? 'font-medium text-ink' : 'text-slate-500')}>{s.label}</span>
        </li>
      ))}
    </ol>
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
    <article className={'overflow-hidden rounded-2xl border bg-white shadow-sm ' + (cancelled ? 'border-slate-200 opacity-70' : 'border-slate-200')}>
      <div className="flex gap-4 p-4 sm:p-5">
        <ProductArt category={item?.category ?? ''} className="h-16 w-16 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3 className="font-display text-lg leading-snug font-semibold break-words">
              {item?.name ?? 'Item'}
              {o.variant && <span className="font-sans text-base font-normal text-slate-600"> ({o.variant})</span>}
            </h3>
            <Chip tone={st.tone}>{st.label}</Chip>
          </div>
          <p className="text-sm text-slate-500">
            Quantity {o.quantity}
            {folder && ` · ${folder}`}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 pb-4 sm:px-5 sm:pb-5">
        {cancelled ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            This order was cancelled{o.cancel_reason ? `: ${o.cancel_reason}` : '.'}
            {o.amount_paid > 0 && ' Ask the finance head about your refund.'}
          </p>
        ) : (
          <Steps
            steps={[
              { label: 'Ordered', done: true },
              { label: 'Paid', done: balance <= 0 },
              { label: 'Arrived', done: hasArrived(item) },
              { label: 'Claimed', done: !!o.claimed_at },
            ]}
          />
        )}

        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-slate-600">
              Paid <span className="font-semibold text-ink tabular-nums">{peso(o.amount_paid)}</span> of{' '}
              <span className="tabular-nums">{peso(total)}</span>
            </span>
            {!cancelled && <Chip tone={PAY_TONE[p]}>{PAY_LABEL[p]}</Chip>}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-700 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
          {!cancelled && balance > 0 && (
            <p className="mt-1.5 text-sm font-medium text-amber-800">Balance {peso(balance)}</p>
          )}
          {o.claimed_at && <p className="mt-1.5 text-xs text-slate-500">Claimed {formatDateTime(o.claimed_at)}</p>}
        </div>

        {(payments.length > 0 || proofs.some((x) => x.status !== 'verified')) && (
          <ul className="mt-4 space-y-2 text-sm">
            {payments.map((x) => (
              <li key={x.id} className="flex items-start gap-2 text-slate-700">
                <CheckIcon size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  Payment of {peso(x.amount)} confirmed ({METHOD_LABEL[x.method]}, {formatDateTime(x.received_at)})
                </span>
              </li>
            ))}
            {proofs
              .filter((x) => x.status !== 'verified')
              .map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 text-slate-700">
                  {proofUrls[x.image_path] && (
                    <a href={proofUrls[x.image_path]} target="_blank" rel="noreferrer">
                      <img src={proofUrls[x.image_path]} alt="Your payment screenshot" className="h-10 w-10 rounded border border-slate-200 object-cover" />
                    </a>
                  )}
                  <span>
                    Proof of {peso(x.amount)} sent {formatDateTime(x.created_at)}
                  </span>
                  <Chip tone={PROOF_TONE[x.status]}>{PROOF_LABEL[x.status]}</Chip>
                  {x.status === 'rejected' && x.reject_reason && <span className="text-xs text-red-700">Reason: {x.reject_reason}</span>}
                </li>
              ))}
          </ul>
        )}

        {canSendProof && <ProofForm order={o} onSent={onChanged} />}

        {canCancel && (
          <div className="mt-3 text-sm">
            {cancelling ? (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-slate-700">Cancel this order?</span>
                <button onClick={() => void cancel()} className="py-1 font-semibold text-red-700 hover:underline">
                  Yes, cancel it
                </button>
                <button onClick={() => setCancelling(false)} className="py-1 text-slate-600 hover:underline">
                  Keep it
                </button>
              </span>
            ) : (
              <button onClick={() => setCancelling(true)} className="py-1 text-slate-600 hover:text-red-700 hover:underline">
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        onClick={() => {
          setAmount(String(orderBalance(order)))
          setOpen(true)
        }}
        className="mt-4 rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
      >
        I paid. Send proof of payment
      </button>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    const v = Number(amount)
    if (!file) return setError('Choose the screenshot of your payment.')
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
      await onSent()
    } catch (err) {
      setError(errorMessage(err, 'Could not send the proof.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`pf-${order.id}`} className="text-sm font-medium">Screenshot of your payment</label>
        <input
          id={`pf-${order.id}`}
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-slate-100"
        />
      </div>
      <div>
        <label htmlFor={`pa-${order.id}`} className="text-sm font-medium">Amount you paid (PHP)</label>
        <input id={`pa-${order.id}`} type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`pr-${order.id}`} className="text-sm font-medium">GCash reference no. (optional)</label>
        <input id={`pr-${order.id}`} value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} className={inputClass} />
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <div className="w-full sm:w-auto sm:min-w-44">
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Sending…' : 'Send to finance'}</button>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="py-2 text-sm text-slate-600 hover:underline">Cancel</button>
      </div>
    </form>
  )
}
