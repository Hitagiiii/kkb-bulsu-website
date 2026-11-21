export type Stage = 'open' | 'ordered' | 'arrived' | 'closed'
export type PayMethod = 'cash' | 'gcash' | 'other'
export type ChipTone = 'green' | 'amber' | 'red' | 'slate' | 'brand'

export interface MerchItem {
  id: string
  name: string
  category: string
  price: number
  folder_id: string | null
  variants: string[]
  image_paths: string[]
  /** total pieces on offer; null means no limit */
  stock_limit: number | null
  stage: Stage
  order_deadline: string | null
  created_at: string
}

export interface MerchOrder {
  id: string
  item_id: string
  user_id: string | null
  buyer_name: string
  variant: string | null
  quantity: number
  unit_price: number
  amount_paid: number
  note: string | null
  claimed_at: string | null
  claimed_by: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_at: string
}

export interface MerchPayment {
  id: string
  order_id: string
  amount: number
  method: PayMethod
  reference: string | null
  received_by: string | null
  received_at: string
  voided_at: string | null
  void_reason: string | null
}

export const STAGES: Stage[] = ['open', 'ordered', 'arrived', 'closed']

export const STAGE_LABEL: Record<Stage, string> = {
  open: 'Taking orders',
  ordered: 'Ordered from supplier',
  arrived: 'Arrived, ready to claim',
  closed: 'Closed',
}

export const METHOD_LABEL: Record<PayMethod, string> = { cash: 'Cash', gcash: 'GCash', other: 'Other' }

export const MERCH_CATEGORIES = ['Shirt', 'ID lace', 'Pin', 'Lanyard', 'Sticker', 'Other']

const cents = (n: number) => Math.round(n * 100)

type Priced = Pick<MerchOrder, 'quantity' | 'unit_price'>
type Paid = Priced & Pick<MerchOrder, 'amount_paid'>

export const orderTotal = (o: Priced) => (cents(o.unit_price) * o.quantity) / 100
export const orderBalance = (o: Paid) => (cents(o.unit_price) * o.quantity - cents(o.amount_paid)) / 100

export type PayState = 'unpaid' | 'partial' | 'paid'

export function payState(o: Paid): PayState {
  if (orderBalance(o) <= 0) return 'paid'
  return cents(o.amount_paid) > 0 ? 'partial' : 'unpaid'
}

export const PAY_LABEL: Record<PayState, string> = { unpaid: 'Unpaid', partial: 'Partly paid', paid: 'Paid' }
export const PAY_TONE: Record<PayState, ChipTone> = { unpaid: 'red', partial: 'amber', paid: 'green' }

export function hasArrived(item: Pick<MerchItem, 'stage'> | undefined): boolean {
  return item?.stage === 'arrived' || item?.stage === 'closed'
}

/** An order that can be handed over right now */
export function isReady(o: MerchOrder, item: MerchItem | undefined): boolean {
  return !o.cancelled_at && !o.claimed_at && hasArrived(item) && orderBalance(o) <= 0
}

export function pickup(o: MerchOrder, item: MerchItem | undefined): { label: string; tone: ChipTone } {
  if (o.cancelled_at) return { label: 'Cancelled', tone: 'red' }
  if (o.claimed_at) return { label: 'Claimed', tone: 'green' }
  if (hasArrived(item)) {
    return orderBalance(o) <= 0
      ? { label: 'Ready to claim', tone: 'brand' }
      : { label: 'Arrived, balance due', tone: 'amber' }
  }
  if (item?.stage === 'ordered') return { label: 'Ordered from supplier', tone: 'slate' }
  return { label: 'Waiting for orders to close', tone: 'slate' }
}

export function parseVariants(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of text.split(',')) {
    const v = part.trim()
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase())
      out.push(v)
    }
  }
  return out
}

export interface MerchFolder {
  id: string
  name: string
  created_at: string
}

export interface PaymentSettings {
  gcash_number: string | null
  gcash_name: string | null
  instructions: string | null
  qr_path: string | null
}

export type ProofStatus = 'pending' | 'verified' | 'rejected'

export interface PaymentProof {
  id: string
  order_id: string
  user_id: string
  image_path: string
  amount: number
  reference: string | null
  status: ProofStatus
  reviewed_at: string | null
  reject_reason: string | null
  created_at: string
}

export const PROOF_LABEL: Record<ProofStatus, string> = {
  pending: 'Waiting for finance',
  verified: 'Verified',
  rejected: 'Rejected',
}
export const PROOF_TONE: Record<ProofStatus, ChipTone> = { pending: 'amber', verified: 'green', rejected: 'red' }

export interface WaitlistRow {
  id: string
  item_id: string
  user_id: string
  variant: string | null
  quantity: number
  created_at: string
}
