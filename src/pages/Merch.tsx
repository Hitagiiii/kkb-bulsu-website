import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { compressImage, errorMessage, peso } from '../lib/finance'
import { formatDateTime } from '../lib/announcements'
import { signedUrlsFor } from '../lib/storage'
import {
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
import PaymentInfoCard from '../components/PaymentInfoCard'
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'

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
  const [cancelling, setCancelling] = useState<string | null>(null)

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

  async function cancel(o: MerchOrder) {
    const { error } = await supabase.rpc('cancel_order', { p_id: o.id, p_reason: 'Cancelled by the member' })
    setCancelling(null)
    if (error) return setError(errorMessage(error, 'Could not cancel the order.'))
    await load()
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Merch</h1>
          <p className="mt-2 text-slate-600">
            Order here, pay by GCash, then send a screenshot so the finance head can confirm it.
          </p>
        </div>
        {isFinance && (
          <Link to="/merch/manage" className={subtleButtonClass}>
            Manage sales
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {loading && <p className="mt-8 text-sm text-slate-500">Loading…</p>}

      {!loading && (
        <>
          <div className="mt-8">
            <PaymentInfoCard />
          </div>

          <section className="mt-10" aria-label="Open for orders">
            <h2 className="font-display text-xl font-semibold">Open for orders</h2>
            {available.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                Nothing is open for orders right now.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {available.map((item) => (
                  <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                    <OrderForm item={item} folder={item.folder_id ? folderName[item.folder_id] : undefined} onOrdered={load} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10" aria-label="My orders">
            <h2 className="font-display text-xl font-semibold">My orders</h2>
            {orders.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">You have not ordered anything yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                {orders.map((o) => {
                  const item = byId[o.item_id]
                  const p = payState(o)
                  const st = pickup(o, item)
                  const canCancel = !o.cancelled_at && !o.claimed_at && o.amount_paid === 0
                  const myPayments = payments.filter((x) => x.order_id === o.id && !x.voided_at)
                  const myProofs = proofs.filter((x) => x.order_id === o.id)
                  const canSendProof = !o.cancelled_at && !o.claimed_at && orderBalance(o) > 0
                  return (
                    <li key={o.id} className={'py-4 ' + (o.cancelled_at ? 'opacity-60' : '')}>
                      <p className="font-medium break-words">
                        {item?.name ?? 'Item'}
                        {o.variant && <span className="text-slate-600"> ({o.variant})</span>}
                        <span className="text-slate-600"> × {o.quantity}</span>
                      </p>
                      {item?.folder_id && folderName[item.folder_id] && (
                        <p className="text-xs text-slate-500">{folderName[item.folder_id]}</p>
                      )}
                      <p className="mt-1 text-sm text-slate-600">
                        Total {peso(orderTotal(o))}. Paid {peso(o.amount_paid)}.
                        {!o.cancelled_at && orderBalance(o) > 0 && ` Balance ${peso(orderBalance(o))}.`}
                      </p>
                      <p className="mt-2 flex flex-wrap gap-2">
                        {!o.cancelled_at && <Chip tone={PAY_TONE[p]}>{PAY_LABEL[p]}</Chip>}
                        <Chip tone={st.tone}>{st.label}</Chip>
                        {o.claimed_at && <span className="text-xs text-slate-500">on {formatDateTime(o.claimed_at)}</span>}
                      </p>

                      {(myPayments.length > 0 || myProofs.length > 0) && (
                        <ul className="mt-3 space-y-1 text-sm">
                          {myPayments.map((x) => (
                            <li key={x.id} className="text-slate-700">
                              Payment of {peso(x.amount)} confirmed ({METHOD_LABEL[x.method]}, {formatDateTime(x.received_at)})
                            </li>
                          ))}
                          {myProofs
                            .filter((x) => x.status !== 'verified')
                            .map((x) => (
                              <li key={x.id} className="flex flex-wrap items-center gap-2 text-slate-700">
                                {proofUrls[x.image_path] && (
                                  <a href={proofUrls[x.image_path]} target="_blank" rel="noreferrer">
                                    <img src={proofUrls[x.image_path]} alt="Your payment screenshot" className="h-10 w-10 rounded border border-slate-200 object-cover" />
                                  </a>
                                )}
                                <span>Proof of {peso(x.amount)} sent {formatDateTime(x.created_at)}</span>
                                <Chip tone={PROOF_TONE[x.status]}>{PROOF_LABEL[x.status]}</Chip>
                                {x.status === 'rejected' && x.reject_reason && (
                                  <span className="text-xs text-red-700">Reason: {x.reject_reason}</span>
                                )}
                              </li>
                            ))}
                        </ul>
                      )}

                      {canSendProof && <ProofForm order={o} onSent={load} />}

                      {canCancel && (
                        <div className="mt-2 text-sm">
                          {cancelling === o.id ? (
                            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span className="text-slate-700">Cancel this order?</span>
                              <button onClick={() => void cancel(o)} className="py-1 font-semibold text-red-700 hover:underline">
                                Yes, cancel it
                              </button>
                              <button onClick={() => setCancelling(null)} className="py-1 text-slate-600 hover:underline">
                                Keep it
                              </button>
                            </span>
                          ) : (
                            <button onClick={() => setCancelling(o.id)} className="py-1 text-slate-600 hover:text-red-700 hover:underline">
                              Cancel order
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
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
        className="mt-3 py-1 text-sm font-semibold text-brand-700 hover:underline"
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
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
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

function OrderForm({ item, folder, onOrdered }: { item: MerchItem; folder?: string; onOrdered: () => Promise<void> }) {
  const { profile } = useAuth()
  const [variant, setVariant] = useState('')
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const n = Math.floor(Number(qty))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setDone(false)
    if (!profile) return
    if (item.variants.length > 0 && !variant) return setError('Choose a size or type first.')
    if (!(n >= 1 && n <= 10)) return setError('Quantity must be between 1 and 10.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('merch_orders').insert({
      item_id: item.id,
      user_id: profile.id,
      variant: item.variants.length > 0 ? variant : null,
      quantity: n,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not place the order.'))
    setDone(true)
    setQty('1')
    await onOrdered()
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold break-words">{item.name}</h3>
        <span className="font-display text-lg font-semibold">{peso(item.price)}</span>
      </div>
      <p className="text-sm text-slate-500">
        {item.category}
        {folder && `. ${folder}`}
        {item.order_deadline && `. Order by ${formatDateTime(item.order_deadline)}`}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {item.variants.length > 0 && (
          <div>
            <label htmlFor={`v-${item.id}`} className="text-sm font-medium">Size or type</label>
            <select id={`v-${item.id}`} value={variant} onChange={(e) => setVariant(e.target.value)} className={inputClass}>
              <option value="">Choose…</option>
              {item.variants.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`q-${item.id}`} className="text-sm font-medium">Quantity</label>
          <input
            id={`q-${item.id}`}
            type="number"
            min="1"
            max="10"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && (
        <p role="status" className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Order placed. Pay using the GCash details above, then send your proof under "My orders".
        </p>
      )}

      <div className="mt-4 sm:max-w-64">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Placing order…' : `Order${n >= 1 ? ` (${peso(item.price * n)})` : ''}`}
        </button>
      </div>
    </form>
  )
}
