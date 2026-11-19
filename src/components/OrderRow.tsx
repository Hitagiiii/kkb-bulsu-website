import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, peso } from '../lib/finance'
import { formatDateTime } from '../lib/announcements'
import {
  METHOD_LABEL,
  orderBalance,
  orderTotal,
  payState,
  pickup,
  PAY_LABEL,
  PAY_TONE,
  PROOF_LABEL,
  PROOF_TONE,
  type MerchItem,
  type MerchOrder,
  type MerchPayment,
  type PayMethod,
  type PaymentProof,
} from '../lib/merch'
import Chip from './Chip'
import { buttonClass, inputClass, subtleButtonClass } from './ui'

/** One order in the treasurer's list: take payment, claim, cancel. */
export default function OrderRow({
  order,
  item,
  payments,
  proofs,
  proofUrls,
  canEdit,
  names,
  onChanged,
}: {
  order: MerchOrder
  item: MerchItem
  payments: MerchPayment[]
  proofs: PaymentProof[]
  proofUrls: Record<string, string>
  canEdit: boolean
  names: Record<string, string>
  onChanged: () => Promise<void>
}) {
  const [mode, setMode] = useState<null | 'pay' | 'cancel'>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('cash')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [voidId, setVoidId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [history, setHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancelled = !!order.cancelled_at
  const claimed = !!order.claimed_at
  const balance = orderBalance(order)
  const p = payState(order)
  const st = pickup(order, item)
  const buyer = order.buyer_name || (order.user_id ? names[order.user_id] : '') || 'Unnamed'
  const canClaim = canEdit && !cancelled && !claimed && (item.stage === 'arrived' || item.stage === 'closed') && balance <= 0
  const refundDue = cancelled && order.amount_paid > 0
  const pendingProofs = proofs.filter((x) => x.status === 'pending')

  async function run(fn: () => PromiseLike<{ error: unknown }>, fallback: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    const { error } = await fn()
    setBusy(false)
    if (error) {
      setError(errorMessage(error, fallback))
      return false
    }
    await onChanged()
    return true
  }

  async function pay(e: FormEvent) {
    e.preventDefault()
    const v = Number(amount)
    if (!(v > 0)) return setError('Enter the amount received.')
    if (Math.round(v * 100) > Math.round(balance * 100)) return setError(`That is more than the balance of ${peso(balance)}.`)
    const ok = await run(
      () =>
        supabase.from('merch_payments').insert({
          order_id: order.id,
          amount: Math.round(v * 100) / 100,
          method,
          reference: reference.trim() || null,
        }),
      'Could not record the payment.',
    )
    if (ok) {
      setMode(null)
      setAmount('')
      setReference('')
    }
  }

  async function cancel(e: FormEvent) {
    e.preventDefault()
    const ok = await run(() => supabase.rpc('cancel_order', { p_id: order.id, p_reason: reason }), 'Could not cancel the order.')
    if (ok) {
      setMode(null)
      setReason('')
    }
  }

  async function voidPayment(e: FormEvent) {
    e.preventDefault()
    if (!voidId) return
    if (!voidReason.trim()) return setError('Say why this payment is being voided.')
    const ok = await run(() => supabase.rpc('void_payment', { p_id: voidId, p_reason: voidReason }), 'Could not void the payment.')
    if (ok) {
      setVoidId(null)
      setVoidReason('')
    }
  }

  return (
    <li className={'py-3 ' + (cancelled ? 'opacity-70' : '')}>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_auto_auto] md:items-center md:gap-4">
        <div className="min-w-0">
          <p className="font-semibold break-words">
            {buyer}
            {!order.user_id && <span className="ml-2 text-xs font-normal text-slate-500">(not a member)</span>}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {order.variant ? `${order.variant} · ` : ''}Qty {order.quantity}
          </p>
        </div>
        <p className="text-sm tabular-nums text-slate-600 md:text-right">
          <span className="font-semibold text-ink">{peso(order.amount_paid)}</span> / {peso(orderTotal(order))}
        </p>
        <p className="flex flex-wrap items-center gap-1.5">
        {!cancelled && <Chip tone={PAY_TONE[p]}>{PAY_LABEL[p]}</Chip>}
        <Chip tone={st.tone}>{st.label}</Chip>
        {refundDue && <Chip tone="amber">Refund {peso(order.amount_paid)} due</Chip>}
        {pendingProofs.length > 0 && <Chip tone="amber">Proof to verify</Chip>}
      </p>
      <div className="hidden text-xs text-slate-500 md:block md:text-right">{claimed ? `Claimed ${formatDateTime(order.claimed_at!)}` : st.label}</div>
      </div>
      {cancelled && order.cancel_reason && <p className="mt-1 text-xs text-slate-500">Reason: {order.cancel_reason}</p>}

      {proofs.length > 0 && (
        <ProofReview order={order} proofs={proofs} urls={proofUrls} canEdit={canEdit} onChanged={onChanged} />
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>
      )}

      {canEdit && mode === null && voidId === null && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-2 text-sm">
          {!cancelled && !claimed && balance > 0 && (
            <button
              onClick={() => {
                setAmount(String(balance))
                setMode('pay')
              }}
              className="min-h-11 rounded-md border border-brand-700 px-3 py-2 font-semibold text-brand-700 hover:bg-brand-50"
            >
              Record payment
            </button>
          )}
          {canClaim && (
            <button
              disabled={busy}
              onClick={() => void run(() => supabase.from('merch_orders').update({ claimed_at: new Date().toISOString() }).eq('id', order.id), 'Could not mark as claimed.')}
              className="min-h-11 rounded-md border border-brand-700 px-3 py-2 font-semibold text-brand-700 hover:bg-brand-50"
            >
              Mark as claimed
            </button>
          )}
          {claimed && (
            <button
              disabled={busy}
              onClick={() => void run(() => supabase.from('merch_orders').update({ claimed_at: null }).eq('id', order.id), 'Could not undo the claim.')}
              className="min-h-11 rounded-md border border-hairline bg-white px-3 py-2 text-slate-700 hover:bg-card"
            >
              Undo claim
            </button>
          )}
          {!cancelled && !claimed && (
            <button onClick={() => setMode('cancel')} className="min-h-11 rounded-md border border-hairline bg-white px-3 py-2 text-slate-700 hover:border-error hover:text-error">
              Cancel order
            </button>
          )}
          {payments.length > 0 && (
            <button onClick={() => setHistory((h) => !h)} aria-expanded={history} className="min-h-11 rounded-md border border-hairline bg-white px-3 py-2 text-slate-700 hover:bg-card">
              Payments ({payments.length}) {history ? '(hide)' : '(show)'}
            </button>
          )}
        </div>
      )}

      {!canEdit && payments.length > 0 && (
        <button onClick={() => setHistory((h) => !h)} aria-expanded={history} className="mt-2 min-h-11 rounded-md border border-hairline bg-white px-3 py-2 text-sm text-slate-700 hover:bg-card">
          Payments ({payments.length}) {history ? '(hide)' : '(show)'}
        </button>
      )}

      {mode === 'pay' && (
        <form onSubmit={pay} className="mt-3 grid gap-3 border border-hairline bg-card p-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`amt-${order.id}`} className="text-sm font-medium">Amount received</label>
            <input
              id={`amt-${order.id}`}
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
            <label htmlFor={`met-${order.id}`} className="text-sm font-medium">Paid by</label>
            <select id={`met-${order.id}`} value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className={inputClass}>
              {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`ref-${order.id}`} className="text-sm font-medium">GCash ref (optional)</label>
            <input id={`ref-${order.id}`} value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-center gap-3 sm:col-span-3">
            <div className="w-40">
              <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save payment'}</button>
            </div>
            <button type="button" onClick={() => setMode(null)} className="min-h-11 px-2 py-2 text-sm text-slate-600 hover:underline">Cancel</button>
          </div>
        </form>
      )}

      {mode === 'cancel' && (
        <form onSubmit={cancel} className="mt-3 flex flex-wrap items-center gap-2 border border-hairline bg-card p-3">
          <input
            aria-label="Reason for cancelling"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-base sm:py-2 sm:text-sm"
          />
          <button type="submit" disabled={busy} className={subtleButtonClass}>Cancel the order</button>
          <button type="button" onClick={() => setMode(null)} className="min-h-11 px-2 py-2 text-sm text-slate-600 hover:underline">Keep it</button>
          {order.amount_paid > 0 && (
            <p className="w-full text-xs text-amber-900">
              {peso(order.amount_paid)} was already paid. After cancelling, return the money and void the payment so the books match.
            </p>
          )}
        </form>
      )}

      {history && (
        <ul className="mt-3 divide-y divide-hairline border-y border-hairline text-sm">
          {payments.map((pay) => (
            <li key={pay.id} className="py-2">
              <p className={pay.voided_at ? 'text-slate-500 line-through' : ''}>
                {peso(pay.amount)} by {METHOD_LABEL[pay.method]}
                {pay.reference && ` (${pay.reference})`}
              </p>
              <p className="text-xs text-slate-500">
                {formatDateTime(pay.received_at)}, received by {pay.received_by ? names[pay.received_by] ?? 'Unknown' : 'Unknown'}
              </p>
              {pay.voided_at && <p className="text-xs text-red-700">Voided: {pay.void_reason}</p>}
              {canEdit && !pay.voided_at && !claimed && voidId !== pay.id && (
                <button onClick={() => setVoidId(pay.id)} className="min-h-11 px-2 py-2 text-xs text-slate-600 hover:text-red-700 hover:underline">
                  Void payment
                </button>
              )}
              {voidId === pay.id && (
                <form onSubmit={voidPayment} className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    aria-label="Reason for voiding"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Reason (required)"
                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-base sm:py-1.5 sm:text-sm"
                  />
                  <button type="submit" disabled={busy} className={subtleButtonClass}>Void</button>
                  <button type="button" onClick={() => setVoidId(null)} className="min-h-11 px-2 py-2 text-xs text-slate-600 hover:underline">Cancel</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/* ---------- payment proofs sent by the member ---------- */
function ProofReview({
  order,
  proofs,
  urls,
  canEdit,
  onChanged,
}: {
  order: MerchOrder
  proofs: PaymentProof[]
  urls: Record<string, string>
  canEdit: boolean
  onChanged: () => Promise<void>
}) {
  const [active, setActive] = useState<{ id: string; mode: 'verify' | 'reject' } | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('gcash')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const balance = orderBalance(order)

  async function verify(e: FormEvent, proof: PaymentProof) {
    e.preventDefault()
    const v = Number(amount)
    if (!(v > 0)) return setError('Enter the amount you actually received.')
    if (Math.round(v * 100) > Math.round(balance * 100)) return setError(`That is more than the balance of ${peso(balance)}.`)
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('verify_payment_proof', {
      p_proof: proof.id,
      p_amount: Math.round(v * 100) / 100,
      p_method: method,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not verify the payment.'))
    setActive(null)
    await onChanged()
  }

  async function reject(e: FormEvent, proof: PaymentProof) {
    e.preventDefault()
    if (!reason.trim()) return setError('Tell the member why it was rejected.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('reject_payment_proof', { p_proof: proof.id, p_reason: reason })
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not reject the proof.'))
    setActive(null)
    setReason('')
    await onChanged()
  }

  return (
    <ul className="mt-3 space-y-2 text-sm">
      {proofs.map((p) => (
        <li key={p.id} className={'border p-3 ' + (p.status === 'pending' ? 'border-ink bg-white' : 'border-hairline bg-card')}>
          <div className="flex gap-3">
            {urls[p.image_path] ? (
              <a href={urls[p.image_path]} target="_blank" rel="noreferrer" title="Open full size" className="shrink-0">
                <img src={urls[p.image_path]} alt="Payment screenshot" className="h-16 w-16 rounded-md border border-hairline bg-white object-cover" />
              </a>
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-md border border-hairline bg-card" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="font-medium">
                Member says {peso(p.amount)}
                {p.reference && <span className="font-normal text-slate-600"> (ref {p.reference})</span>}
              </p>
              <p className="text-xs text-slate-500">Sent {formatDateTime(p.created_at)}</p>
              <p className="mt-1">
                <Chip tone={PROOF_TONE[p.status]}>{PROOF_LABEL[p.status]}</Chip>
                {p.status === 'rejected' && p.reject_reason && <span className="ml-2 text-xs text-red-700">{p.reject_reason}</span>}
              </p>
            </div>
          </div>

          {canEdit && p.status === 'pending' && active?.id !== p.id && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-2">
              <button
                onClick={() => {
                  setAmount(String(Math.min(p.amount, balance)))
                  setActive({ id: p.id, mode: 'verify' })
                  setError(null)
                }}
                className="min-h-11 rounded-md border border-brand-700 px-3 py-2 font-semibold text-brand-700 hover:bg-brand-50"
              >
                Verify and record payment
              </button>
              <button
                onClick={() => {
                  setActive({ id: p.id, mode: 'reject' })
                  setError(null)
                }}
                className="min-h-11 rounded-md border border-hairline bg-white px-3 py-2 text-slate-700 hover:border-error hover:text-error"
              >
                Reject
              </button>
            </div>
          )}

          {active?.id === p.id && active.mode === 'verify' && (
            <form onSubmit={(e) => void verify(e, p)} className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`va-${p.id}`} className="text-sm font-medium">Amount received (PHP)</label>
                <input id={`va-${p.id}`} type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor={`vm-${p.id}`} className="text-sm font-medium">Paid by</label>
                <select id={`vm-${p.id}`} value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} className={inputClass}>
                  {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                    <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <div className="w-44">
                  <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Confirm payment'}</button>
                </div>
                <button type="button" onClick={() => setActive(null)} className="min-h-11 px-2 py-2 text-sm text-slate-600 hover:underline">Cancel</button>
              </div>
            </form>
          )}

          {active?.id === p.id && active.mode === 'reject' && (
            <form onSubmit={(e) => void reject(e, p)} className="mt-3 flex flex-wrap items-center gap-2">
              <input
                aria-label="Reason for rejecting"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (the member will see this)"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-base sm:py-2 sm:text-sm"
              />
              <button type="submit" disabled={busy} className={subtleButtonClass}>Reject</button>
              <button type="button" onClick={() => setActive(null)} className="min-h-11 px-2 py-2 text-sm text-slate-600 hover:underline">Cancel</button>
            </form>
          )}
          {error && active?.id === p.id && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        </li>
      ))}
    </ul>
  )
}

