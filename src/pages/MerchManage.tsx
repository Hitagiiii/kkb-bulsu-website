import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { errorMessage, peso } from '../lib/finance'
import { formatDateTime, toLocalInput } from '../lib/announcements'
import { signedUrlsFor } from '../lib/storage'
import {
  isReady,
  MERCH_CATEGORIES,
  orderBalance,
  orderTotal,
  parseVariants,
  STAGE_LABEL,
  STAGES,
  type MerchFolder,
  type MerchItem,
  type MerchOrder,
  type MerchPayment,
  type PaymentProof,
  type Stage,
  type WaitlistRow,
} from '../lib/merch'
import Chip from '../components/Chip'
import OrderRow from '../components/OrderRow'
import PaymentInfoCard from '../components/PaymentInfoCard'
import PageHeader from '../components/PageHeader'
import MerchPhoto from '../components/MerchPhoto'
import PhotoPicker from '../components/PhotoPicker'
import { removeMerchPhotos, uploadMerchPhotos } from '../lib/merchImages'
import { buttonClass, dangerButtonClass, inputClass, noticeClass, subtleButtonClass } from '../components/ui'

interface Person {
  id: string
  full_name: string
}

export default function MerchManage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'treasurer'
  const [items, setItems] = useState<MerchItem[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [payments, setPayments] = useState<MerchPayment[]>([])
  const [proofs, setProofs] = useState<PaymentProof[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [folders, setFolders] = useState<MerchFolder[]>([])
  const [costs, setCosts] = useState<Record<string, number>>({})
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([])
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({})
  const [folderFilter, setFolderFilter] = useState('all') // 'all' | 'none' | folder id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const urlCache = useRef<Record<string, string>>({})

  const load = useCallback(async () => {
    const [i, o, p, m, f, c, pr, wl] = await Promise.all([
      supabase.from('merch_items').select('*').order('created_at', { ascending: false }),
      supabase.from('merch_orders').select('*').order('created_at'),
      supabase.from('merch_payments').select('*').order('received_at'),
      supabase.from('profiles').select('id, full_name').eq('approved', true).order('full_name'),
      supabase.from('merch_folders').select('*').order('created_at'),
      supabase.from('merch_item_costs').select('item_id, unit_cost'),
      supabase.from('merch_payment_proofs').select('*').order('created_at'),
      supabase.from('merch_waitlist').select('*').order('created_at'),
    ])
    setWaitlist((wl.data ?? []) as WaitlistRow[]) // empty until the stock/waitlist update is installed
    const err = i.error ?? o.error ?? p.error ?? m.error ?? f.error ?? c.error ?? pr.error
    if (err) {
      setError(err.message)
    } else {
      const proofRows = (pr.data ?? []) as PaymentProof[]
      setItems((i.data ?? []) as MerchItem[])
      setOrders((o.data ?? []) as MerchOrder[])
      setPayments((p.data ?? []) as MerchPayment[])
      setPeople((m.data ?? []) as Person[])
      setFolders((f.data ?? []) as MerchFolder[])
      setCosts(Object.fromEntries(((c.data ?? []) as { item_id: string; unit_cost: number }[]).map((x) => [x.item_id, x.unit_cost])))
      setProofs(proofRows)
      const missing = proofRows.map((x) => x.image_path).filter((x) => !urlCache.current[x])
      if (missing.length) Object.assign(urlCache.current, await signedUrlsFor('payment-proofs', missing))
      setProofUrls({ ...urlCache.current })
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.full_name || 'Unnamed'])), [people])
  const visibleItems = items.filter((i) =>
    folderFilter === 'all' ? true : folderFilter === 'none' ? !i.folder_id : i.folder_id === folderFilter,
  )
  const visibleIds = new Set(visibleItems.map((i) => i.id))
  const scoped = orders.filter((o) => visibleIds.has(o.item_id))
  const live = scoped.filter((o) => !o.cancelled_at)
  const expected = live.reduce((s, o) => s + Math.round(orderTotal(o) * 100), 0) / 100
  const collected = live.reduce((s, o) => s + Math.round(o.amount_paid * 100), 0) / 100
  const refunds = scoped.filter((o) => o.cancelled_at).reduce((s, o) => s + Math.round(o.amount_paid * 100), 0) / 100
  const pendingProofs = proofs.filter((x) => x.status === 'pending').length
  const forVerification = proofs.filter((x) => x.status === 'pending' && visibleIds.has(orders.find((o) => o.id === x.order_id)?.item_id ?? '')).reduce((s, x) => s + Math.round(x.amount * 100), 0) / 100

  return (
    <div className="w-full">
      <Link to="/merch" className="inline-block py-1 text-sm font-medium text-accent hover:underline">
        ← Back to merch
      </Link>
      <div className="mt-3">
        <PageHeader
          eyebrow="Treasurer workspace"
          title="Merch orders"
          subtitle="Orders, payments, proofs, supplier order sheet and claiming, in one place."
          action={
            canEdit && !creating ? (
              <button onClick={() => setCreating(true)} className={subtleButtonClass}>
                Add an item
              </button>
            ) : undefined
          }
        />
      </div>

      {error && <p role="alert" className="mt-6 rounded-md bg-soft px-3 py-2 text-sm text-accent">{error}</p>}

      {!loading && (
        <dl aria-label="Totals" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric label="Expected" value={peso(expected)} />
          <Metric label="Collected" value={peso(collected)} tone="good" />
          <Metric label="For verification" value={peso(forVerification)} tone={pendingProofs > 0 ? 'warn' : 'default'} hint={`${pendingProofs} ${pendingProofs === 1 ? 'proof needs' : 'proofs need'} review`} />
          <Metric label="Unpaid" value={peso(expected - collected)} tone={expected - collected > 0 ? 'warn' : 'default'} />
          <Metric label="Refunds due" value={peso(refunds)} tone={refunds > 0 ? 'bad' : 'default'} />
        </dl>
      )}

      <FolderBar folders={folders} value={folderFilter} onChange={setFolderFilter} canEdit={canEdit} onChanged={load} setError={setError} />

      <div className="mt-5">
        <PaymentInfoCard editable={canEdit} />
      </div>

      {pendingProofs > 0 && (
        <p role="status" className={noticeClass + ' mt-4'}>
          {pendingProofs} payment {pendingProofs === 1 ? 'proof is' : 'proofs are'} waiting for you to verify. Look for
          "Proof to verify" on the orders below, or choose "Needs verification" in an item's filter.
        </p>
      )}

      {canEdit && creating && (
        <NewItemForm
          folders={folders}
          defaultFolder={folderFilter !== 'all' && folderFilter !== 'none' ? folderFilter : ''}
          onDone={async () => {
            setCreating(false)
            await load()
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {loading && <p className="mt-10 text-sm text-slate-500">Loading…</p>}

      {!loading && visibleItems.length === 0 && (
        <p className="mt-8 rounded-md border border-dashed border-line px-4 py-6 text-sm text-slate-500">
          {items.length === 0 ? 'No items yet. Add the first one above.' : 'No items in this folder yet.'}
        </p>
      )}

      <div className="mt-8 space-y-10">
        {visibleItems.map((item) => (
          <ItemSection
            key={item.id}
            item={item}
            cost={costs[item.id] ?? 0}
            orders={orders.filter((o) => o.item_id === item.id)}
            waitlist={waitlist.filter((w) => w.item_id === item.id)}
            payments={payments}
            proofs={proofs}
            proofUrls={proofUrls}
            folders={folders}
            people={people}
            names={names}
            canEdit={canEdit}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value, tone = 'default', hint }: { label: string; value: string; tone?: 'default' | 'good' | 'warn' | 'bad'; hint?: string }) {
  const valueClass = tone === 'good' ? 'text-success-deep' : tone === 'warn' ? 'text-accent' : tone === 'bad' ? 'text-error' : 'text-ink'
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <dt className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</dt>
      <dd className={'mt-1 text-xl font-semibold tabular-nums ' + valueClass}>{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

/* ---------- folder picker + create/rename/delete ---------- */
function FolderBar({
  folders,
  value,
  onChange,
  canEdit,
  onChanged,
  setError,
}: {
  folders: MerchFolder[]
  value: string
  onChange: (v: string) => void
  canEdit: boolean
  onChanged: () => Promise<void>
  setError: (m: string | null) => void
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<null | 'new' | 'rename' | 'delete'>(null)
  const current = folders.find((f) => f.id === value) ?? null

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setError(null)
    if (mode === 'new') {
      const { data, error } = await supabase.from('merch_folders').insert({ name: n }).select('id').single()
      if (error) return setError(errorMessage(error, 'Could not create the folder.'))
      await onChanged()
      onChange(data.id)
    } else if (mode === 'rename' && current) {
      const { error } = await supabase.from('merch_folders').update({ name: n }).eq('id', current.id)
      if (error) return setError(errorMessage(error, 'Could not rename the folder.'))
      await onChanged()
    }
    setMode(null)
    setName('')
  }

  async function remove() {
    if (!current) return
    const { error } = await supabase.from('merch_folders').delete().eq('id', current.id)
    setMode(null)
    if (error) return setError(errorMessage(error, 'Could not delete the folder.'))
    onChange('all')
    await onChanged()
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div>
        <label htmlFor="mf" className="text-sm font-medium">Folder (sale period)</label>
        <select
          id="mf"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block min-h-11 rounded-md border border-line bg-white px-3 py-2.5 text-base sm:py-2 sm:text-sm"
        >
          <option value="all">All items</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
          <option value="none">No folder</option>
        </select>
      </div>

      {canEdit && mode === null && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm">
          <button
            onClick={() => {
              setName('')
              setMode('new')
            }}
            className="py-1 font-semibold text-accent hover:underline"
          >
            New folder
          </button>
          {current && (
            <>
              <button
                onClick={() => {
                  setName(current.name)
                  setMode('rename')
                }}
                className="py-1 font-medium text-accent hover:underline"
              >
                Rename
              </button>
              <button onClick={() => setMode('delete')} className="py-1 text-slate-600 hover:text-accent hover:underline">
                Delete folder
              </button>
            </>
          )}
        </div>
      )}

      {(mode === 'new' || mode === 'rename') && (
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2 pb-1">
          <input
            aria-label="Folder name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. November 2026 batch"
            className="min-w-0 rounded-md border border-line px-3 py-2.5 text-base sm:py-2 sm:text-sm"
          />
          <button type="submit" className={subtleButtonClass}>{mode === 'new' ? 'Create' : 'Save'}</button>
          <button type="button" onClick={() => setMode(null)} className="py-2 text-sm text-slate-600 hover:underline">Cancel</button>
        </form>
      )}

      {mode === 'delete' && current && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm">
          <span className="text-slate-700">Delete "{current.name}"? Its items and orders are kept and move to "No folder".</span>
          <button onClick={() => void remove()} className="py-1 font-semibold text-accent hover:underline">Yes, delete</button>
          <button onClick={() => setMode(null)} className="py-1 text-slate-600 hover:underline">Cancel</button>
        </div>
      )}
    </div>
  )
}

/* ---------- where the item is in its life ---------- */
function StageSteps({ stage }: { stage: Stage }) {
  const idx = STAGES.indexOf(stage)
  return (
    <ol className="mt-4 grid grid-cols-4 border-y border-line py-2" aria-label="Sale stage">
      {STAGES.map((s, i) => (
        <li key={s} className="relative min-w-0 px-1 text-center" aria-current={i === idx ? 'step' : undefined}>
          {i > 0 && <span aria-hidden="true" className={'absolute left-0 top-3 h-px w-1/2 ' + (i <= idx ? 'bg-accent' : 'bg-line')} />}
          {i < STAGES.length - 1 && <span aria-hidden="true" className={'absolute right-0 top-3 h-px w-1/2 ' + (i < idx ? 'bg-accent' : 'bg-line')} />}
          <span
            className={
              'relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-bold ' +
              (i < idx ? 'border-accent bg-accent text-white' : i === idx ? 'border-accent bg-white text-accent' : 'border-line bg-bg text-muted')
            }
          >
            {i + 1}
          </span>
          <span className={'mt-1 block truncate text-[11px] ' + (i <= idx ? 'font-semibold text-ink' : 'text-slate-500')}>{STAGE_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  )
}

/* ---------- add an item ---------- */
function NewItemForm({
  folders,
  defaultFolder,
  onDone,
  onCancel,
}: {
  folders: MerchFolder[]
  defaultFolder: string
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Shirt')
  const [folder, setFolder] = useState(defaultFolder)
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [variants, setVariants] = useState('')
  const [stock, setStock] = useState('')
  const [deadline, setDeadline] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = Number(price)
    const c = cost === '' ? 0 : Number(cost)
    if (!name.trim()) return setError('Give the item a name.')
    if (!(p >= 0) || price === '') return setError('Enter the selling price.')
    if (stock.trim() !== '' && !(Number(stock) >= 0 && Number.isFinite(Number(stock)))) return setError('Stock must be a number, or leave it empty for no limit.')
    if (!(c >= 0)) return setError('The supplier cost must be a number.')
    let closes: string | null = null
    if (deadline) {
      const d = new Date(deadline)
      if (Number.isNaN(d.getTime())) return setError('The deadline is not valid.')
      closes = d.toISOString()
    }
    setBusy(true)
    setError(null)
    let imagePaths: string[] = []
    try {
      imagePaths = await uploadMerchPhotos(photos)
    } catch (err) {
      setBusy(false)
      return setError(errorMessage(err, 'Could not upload the photos.'))
    }
    const { data, error } = await supabase
      .from('merch_items')
      .insert({
        name: name.trim(),
        category,
        folder_id: folder || null,
        price: Math.round(p * 100) / 100,
        variants: parseVariants(variants),
        order_deadline: closes,
        stock_limit: stock.trim() === '' ? null : Math.max(0, Math.floor(Number(stock))),
        image_paths: imagePaths,
      })
      .select('id')
      .single()
    if (error) {
      await removeMerchPhotos(imagePaths)
      setBusy(false)
      return setError(errorMessage(error, 'Could not add the item.'))
    }
    const costResult = await supabase.from('merch_item_costs').insert({ item_id: data.id, unit_cost: Math.round(c * 100) / 100 })
    setBusy(false)
    if (costResult.error) return setError('The item was saved, but the supplier cost was not: ' + errorMessage(costResult.error, 'unknown error'))
    await onDone()
  }

  return (
    <form onSubmit={submit} className="mt-8 rounded-md border border-line bg-white p-4 sm:p-5">
      <h2 className="text-xl font-medium">New item</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="mi-name" className="text-sm font-medium">Name</label>
          <input id="mi-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Foundation Day shirt" className={inputClass} />
        </div>
        <div>
          <label htmlFor="mi-cat" className="text-sm font-medium">Category</label>
          <select id="mi-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            {MERCH_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mi-folder" className="text-sm font-medium">Folder</label>
          <select id="mi-folder" value={folder} onChange={(e) => setFolder(e.target.value)} className={inputClass}>
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="mi-var" className="text-sm font-medium">Sizes or types (optional)</label>
          <input id="mi-var" value={variants} onChange={(e) => setVariants(e.target.value)} placeholder="S, M, L, XL" className={inputClass} />
        </div>
        <div>
          <label htmlFor="mi-price" className="text-sm font-medium">Selling price (PHP)</label>
          <input id="mi-price" type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="mi-cost" className="text-sm font-medium">Supplier cost each (PHP, only you see this)</label>
          <input id="mi-cost" type="number" inputMode="decimal" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} />
        </div>
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <div>
            <label htmlFor="mi-dl" className="text-sm font-medium">Order deadline (optional)</label>
            <input id="mi-dl" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="mi-stock" className="text-sm font-medium">Stock limit (optional)</label>
            <input id="mi-stock" type="number" inputMode="numeric" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="No limit" className={inputClass} />
            <p className="mt-1 text-xs text-muted">Total pieces on offer. When it runs out, members can join a waitlist.</p>
          </div>
        </div>
        <div className="sm:col-span-2">
          <PhotoPicker id="mi-photos" files={photos} onFilesChange={setPhotos} />
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-md bg-soft px-3 py-2 text-sm text-accent">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto sm:min-w-40">
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? (photos.length ? 'Uploading photos…' : 'Saving…') : 'Add item'}</button>
        </div>
        <button type="button" onClick={onCancel} className="py-2 text-sm text-slate-600 hover:underline">Cancel</button>
      </div>
    </form>
  )
}

/* ---------- one item with its orders ---------- */
type Filter = 'all' | 'verify' | 'owing' | 'ready' | 'claimed' | 'cancelled'

function ItemSection({
  item,
  cost,
  orders,
  waitlist,
  payments,
  proofs,
  proofUrls,
  folders,
  people,
  names,
  canEdit,
  onChanged,
}: {
  item: MerchItem
  cost: number
  orders: MerchOrder[]
  waitlist: WaitlistRow[]
  payments: MerchPayment[]
  proofs: PaymentProof[]
  proofUrls: Record<string, string>
  folders: MerchFolder[]
  people: Person[]
  names: Record<string, string>
  canEdit: boolean
  onChanged: () => Promise<void>
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [costText, setCostText] = useState(String(cost))

  const live = orders.filter((o) => !o.cancelled_at)
  const qty = live.reduce((s, o) => s + o.quantity, 0)
  const claimedQty = live.filter((o) => o.claimed_at).reduce((s, o) => s + o.quantity, 0)
  const expected = live.reduce((s, o) => s + Math.round(orderTotal(o) * 100), 0) / 100
  const collected = live.reduce((s, o) => s + Math.round(o.amount_paid * 100), 0) / 100
  const refunds = orders.filter((o) => o.cancelled_at).reduce((s, o) => s + Math.round(o.amount_paid * 100), 0) / 100
  const pendingFor = (id: string) => proofs.some((x) => x.order_id === id && x.status === 'pending')

  const sheetMap = new Map<string, number>()
  for (const o of live) sheetMap.set(o.variant ?? 'All', (sheetMap.get(o.variant ?? 'All') ?? 0) + o.quantity)
  const sheetOrder = item.variants.length ? item.variants : ['All']
  const sheet = [...sheetMap.entries()].sort((a, b) => sheetOrder.indexOf(a[0]) - sheetOrder.indexOf(b[0]))

  const shown = orders.filter((o) => {
    if (filter === 'verify') return pendingFor(o.id)
    if (filter === 'owing') return !o.cancelled_at && orderBalance(o) > 0
    if (filter === 'ready') return isReady(o, item)
    if (filter === 'claimed') return !!o.claimed_at
    if (filter === 'cancelled') return !!o.cancelled_at
    return true
  })

  const idx = STAGES.indexOf(item.stage)
  const next = STAGES[idx + 1] as Stage | undefined
  const NEXT_LABEL: Record<Stage, string> = {
    open: '',
    ordered: 'Mark as ordered from supplier',
    arrived: 'Mark as arrived',
    closed: 'Close sales',
  }

  async function update(patch: Record<string, unknown>, fallback: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('merch_items').update(patch).eq('id', item.id)
    setBusy(false)
    if (error) return setError(errorMessage(error, fallback))
    await onChanged()
  }

  async function saveCost() {
    const c = Number(costText)
    if (!(c >= 0)) return setError('The supplier cost must be a number.')
    setError(null)
    const { error } = await supabase
      .from('merch_item_costs')
      .upsert({ item_id: item.id, unit_cost: Math.round(c * 100) / 100 }, { onConflict: 'item_id' })
    if (error) return setError(errorMessage(error, 'Could not save the cost.'))
    await onChanged()
  }

  return (
    <section aria-label={item.name} className="rounded-md border border-line bg-white p-4 sm:p-5">
      <div className="flex gap-4">
        <MerchPhoto paths={item.image_paths ?? []} category={item.category} name={item.name} className="h-20 w-20 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-xl font-medium break-words">{item.name}</h2>
            <span className="text-lg font-medium">{peso(item.price)}</span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {item.category}
            <Chip tone={item.stage === 'open' ? 'brand' : item.stage === 'arrived' ? 'green' : 'slate'}>{STAGE_LABEL[item.stage]}</Chip>
            {item.order_deadline && <span>Deadline {formatDateTime(item.order_deadline)}</span>}
          </p>
        </div>
      </div>

      <StageSteps stage={item.stage} />

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line py-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Pieces ordered</dt>
          <dd className="text-lg font-medium">{qty}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Collected</dt>
          <dd className="text-lg font-medium">{peso(collected)} <span className="text-sm font-normal text-slate-500">of {peso(expected)}</span></dd>
        </div>
        <div>
          <dt className="text-slate-500">Claimed</dt>
          <dd className="text-lg font-medium">{claimedQty} <span className="text-sm font-normal text-slate-500">of {qty}</span></dd>
        </div>
        <div>
          <dt className="text-slate-500">Refunds due</dt>
          <dd className={'text-lg font-medium ' + (refunds > 0 ? 'text-[#6b5320]' : '')}>{peso(refunds)}</dd>
        </div>
      </dl>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {next && (
            <button disabled={busy} onClick={() => void update({ stage: next }, 'Could not change the stage.')} className={subtleButtonClass + ' min-h-11'}>
              {NEXT_LABEL[next]}
            </button>
          )}
          {idx > 0 && (
            <button disabled={busy} onClick={() => void update({ stage: STAGES[idx - 1] }, 'Could not change the stage.')} className="min-h-11 px-2 py-1 text-sm text-slate-600 hover:underline">
              Go back to "{STAGE_LABEL[STAGES[idx - 1]]}"
            </button>
          )}
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Folder</span>
            <select
              aria-label={`Folder for ${item.name}`}
              value={item.folder_id ?? ''}
              disabled={busy}
              onChange={(e) => void update({ folder_id: e.target.value || null }, 'Could not move the item.')}
              className="min-h-11 rounded-md border border-line bg-white px-3 py-2 text-base sm:py-1 sm:text-sm"
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-accent">{error}</p>}

      {item.stock_limit !== null && item.stock_limit !== undefined && <StockLine item={item} orders={orders} />}
      {canEdit && <ItemTools item={item} hasOrders={orders.length > 0} onChanged={onChanged} />}
      {canEdit && waitlist.length > 0 && <WaitlistPanel item={item} waitlist={waitlist} names={names} orders={orders} onChanged={onChanged} />}

      <details className="mt-4 rounded-md border border-line bg-white px-4 py-3">
        <summary className="cursor-pointer py-1 text-sm font-semibold">Order sheet for the supplier</summary>
        {qty === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No orders yet.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="py-1 pr-4 font-semibold">{item.variants.length ? 'Size or type' : 'Item'}</th>
                <th className="py-1 font-semibold">Pieces</th>
              </tr>
            </thead>
            <tbody>
              {sheet.map(([v, n]) => (
                <tr key={v} className="border-b border-slate-100">
                  <td className="py-1 pr-4">{v === 'All' ? item.name : v}</td>
                  <td className="py-1 tabular-nums">{n}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 pr-4 font-semibold">Total</td>
                <td className="py-1 font-semibold tabular-nums">{qty}</td>
              </tr>
            </tbody>
          </table>
        )}
        {cost > 0 && qty > 0 && (
          <p className="mt-2 text-sm text-slate-600">
            Cost to pay the supplier: {peso(qty * cost)}. Expected profit: {peso(expected - qty * cost)}.
          </p>
        )}
        {canEdit && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={`cost-${item.id}`} className="text-xs text-slate-500">Supplier cost each (PHP, only you see this)</label>
              <input
                id={`cost-${item.id}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={costText}
                onChange={(e) => setCostText(e.target.value)}
                className="mt-1 block w-32 rounded-md border border-line px-2 py-2 text-base sm:py-1.5 sm:text-sm"
              />
            </div>
            <button type="button" onClick={() => void saveCost()} className={subtleButtonClass}>Save cost</button>
          </div>
        )}
      </details>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-medium">Orders ({orders.length})</h3>
        <select
          aria-label="Filter orders"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="rounded-md border border-line bg-white px-2 py-2 text-base sm:py-1.5 sm:text-sm"
        >
          <option value="all">All orders</option>
          <option value="verify">Needs verification</option>
          <option value="owing">Still owing</option>
          <option value="ready">Ready to claim</option>
          <option value="claimed">Claimed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No orders match.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
          {shown.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              item={item}
              payments={payments.filter((p) => p.order_id === o.id)}
              proofs={proofs.filter((p) => p.order_id === o.id)}
              proofUrls={proofUrls}
              canEdit={canEdit}
              names={names}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}

      {canEdit && <AddOrder item={item} people={people} onAdded={onChanged} />}
    </section>
  )
}

/* ---------- stock summary line ---------- */
function StockLine({ item, orders }: { item: MerchItem; orders: MerchOrder[] }) {
  const taken = orders.filter((o) => !o.cancelled_at).reduce((s, o) => s + o.quantity, 0)
  const limit = item.stock_limit ?? 0
  const left = Math.max(limit - taken, 0)
  return (
    <p className="mt-3 text-sm">
      <span className="font-semibold">
        {taken} of {limit} pieces ordered
      </span>
      <span className={left === 0 ? 'text-accent' : 'text-muted'}> · {left === 0 ? 'sold out' : `${left} left`}</span>
    </p>
  )
}

/* ---------- finance: the waitlist for one item ---------- */
function WaitlistPanel({
  item,
  waitlist,
  names,
  orders,
  onChanged,
}: {
  item: MerchItem
  waitlist: WaitlistRow[]
  names: Record<string, string>
  orders: MerchOrder[]
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const taken = orders.filter((o) => !o.cancelled_at).reduce((s, o) => s + o.quantity, 0)
  const left = Math.max((item.stock_limit ?? 0) - taken, 0)

  async function promote(w: WaitlistRow) {
    setBusy(w.id)
    setError(null)
    const { error } = await supabase.rpc('promote_waitlist', { p_id: w.id })
    setBusy(null)
    if (error) return setError(errorMessage(error, 'Could not place the order.'))
    await onChanged()
  }

  async function drop(w: WaitlistRow) {
    setBusy(w.id)
    const { error } = await supabase.from('merch_waitlist').delete().eq('id', w.id)
    setBusy(null)
    if (error) return setError(errorMessage(error, 'Could not remove the entry.'))
    await onChanged()
  }

  return (
    <section aria-label="Waitlist" className="mt-4 rounded-md border border-line bg-bg p-4">
      <h3 className="text-base font-semibold">Waitlist ({waitlist.length})</h3>
      <p className="mt-0.5 text-xs text-muted">
        In the order they asked.{' '}
        {left > 0
          ? `${left} ${left === 1 ? 'piece is' : 'pieces are'} free right now.`
          : 'No pieces are free, so nobody can be moved yet.'}
      </p>
      <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-white">
        {waitlist.map((w, i) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <span className="min-w-0 break-words">
              <span className="text-muted">{i + 1}.</span> <span className="font-semibold">{names[w.user_id] ?? 'Member'}</span>
              <span className="text-muted">
                {' '}· {w.quantity} × {w.variant ?? item.name}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <button disabled={busy === w.id || left < w.quantity} onClick={() => void promote(w)} className={subtleButtonClass}>
                {busy === w.id ? 'Working…' : 'Move to orders'}
              </button>
              <button disabled={busy === w.id} onClick={() => void drop(w)} className="min-h-11 px-2 text-muted underline underline-offset-2 hover:text-accent">
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-accent">
          {error}
        </p>
      )}
    </section>
  )
}

/* ---------- finance: photos, details and removal for one item ---------- */
function ItemTools({ item, hasOrders, onChanged }: { item: MerchItem; hasOrders: boolean; onChanged: () => Promise<void> }) {
  const [panel, setPanel] = useState<null | 'photos' | 'edit' | 'remove'>(null)
  const [saved, setSaved] = useState<string[]>(item.image_paths ?? [])
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState(item.category)
  const [price, setPrice] = useState(String(item.price))
  const [variants, setVariants] = useState(item.variants.join(', '))
  const [stock, setStock] = useState(item.stock_limit === null || item.stock_limit === undefined ? '' : String(item.stock_limit))
  const [deadline, setDeadline] = useState(item.order_deadline ? toLocalInput(item.order_deadline) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open(next: 'photos' | 'edit' | 'remove') {
    setError(null)
    if (next === 'photos') {
      setSaved(item.image_paths ?? [])
      setFiles([])
    }
    if (next === 'edit') {
      setName(item.name)
      setCategory(item.category)
      setPrice(String(item.price))
      setVariants(item.variants.join(', '))
      setStock(item.stock_limit === null || item.stock_limit === undefined ? '' : String(item.stock_limit))
      setDeadline(item.order_deadline ? toLocalInput(item.order_deadline) : '')
    }
    setPanel(panel === next ? null : next)
  }

  async function savePhotos() {
    setBusy(true)
    setError(null)
    let added: string[] = []
    try {
      added = await uploadMerchPhotos(files)
    } catch (err) {
      setBusy(false)
      return setError(errorMessage(err, 'Could not upload the photos.'))
    }
    const { error } = await supabase.from('merch_items').update({ image_paths: [...saved, ...added] }).eq('id', item.id)
    if (error) {
      await removeMerchPhotos(added)
      setBusy(false)
      return setError(errorMessage(error, 'Could not save the photos.'))
    }
    await removeMerchPhotos((item.image_paths ?? []).filter((p) => !saved.includes(p)))
    setBusy(false)
    setPanel(null)
    await onChanged()
  }

  async function saveDetails(e: FormEvent) {
    e.preventDefault()
    const p = Number(price)
    if (!name.trim()) return setError('Give the item a name.')
    if (!(p >= 0) || price === '') return setError('Enter the selling price.')
    if (stock.trim() !== '' && !(Number(stock) >= 0 && Number.isFinite(Number(stock)))) return setError('Stock must be a number, or leave it empty for no limit.')
    let closes: string | null = null
    if (deadline) {
      const d = new Date(deadline)
      if (Number.isNaN(d.getTime())) return setError('The deadline is not valid.')
      closes = d.toISOString()
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase
      .from('merch_items')
      .update({
        name: name.trim(),
        category,
        price: Math.round(p * 100) / 100,
        variants: parseVariants(variants),
        order_deadline: closes,
        stock_limit: stock.trim() === '' ? null : Math.max(0, Math.floor(Number(stock))),
      })
      .eq('id', item.id)
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not save the changes.'))
    setPanel(null)
    await onChanged()
  }

  async function removeItem() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('merch_items').delete().eq('id', item.id)
    if (error) {
      setBusy(false)
      return setError(errorMessage(error, 'Could not remove the item.'))
    }
    await removeMerchPhotos(item.image_paths ?? [])
    setBusy(false)
    await onChanged()
  }

  const btn = (id: 'photos' | 'edit' | 'remove', label: string) => (
    <button
      type="button"
      onClick={() => open(id)}
      aria-expanded={panel === id}
      className={'min-h-11 rounded-md border px-3 py-2 text-sm font-semibold ' + (panel === id ? 'border-accent bg-soft text-accent' : 'border-line bg-white text-ink hover:bg-bg')}
    >
      {label}
    </button>
  )

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {btn('photos', `Photos (${(item.image_paths ?? []).length})`)}
        {btn('edit', 'Edit details')}
        {btn('remove', 'Remove item')}
      </div>

      {panel === 'photos' && (
        <div className="mt-3 rounded-md border border-line bg-bg p-4">
          <PhotoPicker id={`ph-${item.id}`} saved={saved} files={files} onSavedChange={setSaved} onFilesChange={setFiles} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-auto sm:min-w-40">
              <button type="button" disabled={busy} onClick={() => void savePhotos()} className={buttonClass}>
                {busy ? 'Saving…' : 'Save photos'}
              </button>
            </div>
            <button type="button" onClick={() => setPanel(null)} className="py-2 text-sm text-muted hover:underline">Cancel</button>
          </div>
        </div>
      )}

      {panel === 'edit' && (
        <form onSubmit={saveDetails} className="mt-3 grid gap-3 rounded-md border border-line bg-bg p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`en-${item.id}`} className="text-sm font-medium">Name</label>
            <input id={`en-${item.id}`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`ec-${item.id}`} className="text-sm font-medium">Category</label>
            <select id={`ec-${item.id}`} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {MERCH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`ep-${item.id}`} className="text-sm font-medium">Selling price (PHP)</label>
            <input id={`ep-${item.id}`} type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
            <p className="mt-1 text-xs text-muted">Orders already placed keep the price they were made at.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`ev-${item.id}`} className="text-sm font-medium">Sizes or types</label>
            <input id={`ev-${item.id}`} value={variants} onChange={(e) => setVariants(e.target.value)} placeholder="S, M, L, XL" className={inputClass} />
          </div>
          <div>
            <label htmlFor={`ed-${item.id}`} className="text-sm font-medium">Order deadline (optional)</label>
            <input id={`ed-${item.id}`} type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`es-${item.id}`} className="text-sm font-medium">Stock limit (optional)</label>
            <input id={`es-${item.id}`} type="number" inputMode="numeric" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="No limit" className={inputClass} />
            <p className="mt-1 text-xs text-muted">Cancelled orders give their pieces back.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <div className="w-full sm:w-auto sm:min-w-40">
              <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
            <button type="button" onClick={() => setPanel(null)} className="py-2 text-sm text-muted hover:underline">Cancel</button>
          </div>
        </form>
      )}

      {panel === 'remove' && (
        <div className="mt-3 rounded-md border border-line bg-bg p-4 text-sm">
          {hasOrders ? (
            <p className="text-ink">
              This item has orders, so it cannot be removed. Remove or cancel its orders first, or move the sale to “Closed” to stop new orders.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-ink">Remove “{item.name}” and its photos for good?</span>
              <button type="button" disabled={busy} onClick={() => void removeItem()} className={dangerButtonClass}>
                {busy ? 'Removing…' : 'Yes, remove it'}
              </button>
              <button type="button" onClick={() => setPanel(null)} className="py-2 text-muted hover:underline">Keep it</button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-accent">{error}</p>}
    </div>
  )
}

/* ---------- finance adds an order for someone ---------- */
function AddOrder({ item, people, onAdded }: { item: MerchItem; people: Person[]; onAdded: () => Promise<void> }) {
  const [who, setWho] = useState('')
  const [guest, setGuest] = useState('')
  const [variant, setVariant] = useState('')
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = Math.floor(Number(qty))
    if (!who && !guest.trim()) return setError("Choose a member or type the buyer's name.")
    if (item.variants.length > 0 && !variant) return setError('Choose a size or type.')
    if (!(n >= 1 && n <= 50)) return setError('Quantity must be between 1 and 50.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('merch_orders').insert({
      item_id: item.id,
      user_id: who || null,
      buyer_name: who ? '' : guest.trim(),
      variant: item.variants.length > 0 ? variant : null,
      quantity: n,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error, 'Could not add the order.'))
    setWho('')
    setGuest('')
    setQty('1')
    await onAdded()
  }

  return (
    <details className="mt-4 rounded-lg border border-line bg-slate-50 px-4 py-3">
      <summary className="cursor-pointer py-1 text-sm font-semibold">Add an order for someone</summary>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`who-${item.id}`} className="text-sm font-medium">Member</label>
          <select id={`who-${item.id}`} value={who} onChange={(e) => setWho(e.target.value)} className={inputClass}>
            <option value="">Not a member…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</option>
            ))}
          </select>
        </div>
        {!who && (
          <div>
            <label htmlFor={`g-${item.id}`} className="text-sm font-medium">Buyer's name</label>
            <input id={`g-${item.id}`} value={guest} onChange={(e) => setGuest(e.target.value)} className={inputClass} />
          </div>
        )}
        {item.variants.length > 0 && (
          <div>
            <label htmlFor={`av-${item.id}`} className="text-sm font-medium">Size or type</label>
            <select id={`av-${item.id}`} value={variant} onChange={(e) => setVariant(e.target.value)} className={inputClass}>
              <option value="">Choose…</option>
              {item.variants.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor={`aq-${item.id}`} className="text-sm font-medium">Quantity</label>
          <input id={`aq-${item.id}`} type="number" min="1" max="50" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass} />
        </div>
        {error && <p role="alert" className="rounded-md bg-soft px-3 py-2 text-sm text-accent sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2 sm:max-w-48">
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Adding…' : 'Add order'}</button>
        </div>
      </form>
    </details>
  )
}

