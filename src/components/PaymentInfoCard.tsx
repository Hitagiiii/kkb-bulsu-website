import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { compressImage, errorMessage } from '../lib/finance'
import { signedUrlsFor } from '../lib/storage'
import type { PaymentSettings } from '../lib/merch'
import { buttonClass, inputClass } from './ui'
const BUCKET = 'payment-info'

/** GCash payment details. Everyone can read them; the finance role can edit. */
export default function PaymentInfoCard({ editable = false }: { editable?: boolean }) {
  const { profile } = useAuth()
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('payment_settings')
      .select('gcash_number, gcash_name, instructions, qr_path')
      .eq('id', 1)
      .maybeSingle()
    const s = (data as PaymentSettings | null) ?? null
    setSettings(s)
    if (s?.qr_path) {
      const map = await signedUrlsFor(BUCKET, [s.qr_path])
      setQrUrl(map[s.qr_path] ?? null)
    } else {
      setQrUrl(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const hasInfo = !!(settings?.gcash_number || settings?.gcash_name || settings?.instructions || settings?.qr_path)
  if (!hasInfo && !editable) return null

  async function copyNumber() {
    if (!settings?.gcash_number) return
    try {
      await navigator.clipboard.writeText(settings.gcash_number)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // some browsers block clipboard access; the number is still on screen
    }
  }

  const dark = !(editing && editable)
  const lightBtn = 'min-h-11 rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper'

  return (
    <section
      aria-label="How to pay"
      className={
        'rounded-md border border-line bg-white p-4 sm:p-5 ' +
        (dark ? '' : 'ring-1 ring-soft')
      }
    >
      
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-700 uppercase">GCash / Send money</p>
          <h2 className="text-xl font-medium">How to pay</h2>
        </div>
        {editable && !editing && (
          <button onClick={() => setEditing(true)} className={lightBtn}>
            {hasInfo ? 'Edit payment details' : 'Add payment details'}
          </button>
        )}
      </div>

      {editing && editable ? (
        <PaymentForm
          settings={settings}
          profileId={profile?.id ?? null}
          onDone={async () => {
            setEditing(false)
            await load()
          }}
          onCancel={() => setEditing(false)}
        />
      ) : hasInfo ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          {qrUrl && (
            <a href={qrUrl} target="_blank" rel="noreferrer" title="Open full size to save it" className="justify-self-start border border-line bg-white p-2">
              <img src={qrUrl} alt="GCash QR code" className="h-40 w-40 object-contain" />
            </a>
          )}
          <div className="min-w-0">
            {settings?.gcash_number && (
              <p className="flex flex-wrap items-center gap-3">
                <span className="text-3xl font-medium tracking-wide text-brand-700 tabular-nums">{settings.gcash_number}</span>
                <button type="button" onClick={() => void copyNumber()} className={lightBtn}>
                  {copied ? 'Copied' : 'Copy number'}
                </button>
              </p>
            )}
            {settings?.gcash_name && <p className="mt-1 text-sm text-umber">Account name: {settings.gcash_name}</p>}
            {settings?.instructions && (
              <p className="mt-3 text-sm break-words whitespace-pre-wrap text-ink">{settings.instructions}</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-umber">
          Members will see these details when they order. Add your GCash number, a QR image, or both.
        </p>
      )}
    </section>
  )
}

function PaymentForm({
  settings,
  profileId,
  onDone,
  onCancel,
}: {
  settings: PaymentSettings | null
  profileId: string | null
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [number, setNumber] = useState(settings?.gcash_number ?? '')
  const [accountName, setAccountName] = useState(settings?.gcash_name ?? '')
  const [instructions, setInstructions] = useState(settings?.instructions ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [removeQr, setRemoveQr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    let newPath: string | null = null
    try {
      const oldPath = settings?.qr_path ?? null
      let qrPath = removeQr ? null : oldPath
      if (file) {
        const blob = await compressImage(file)
        newPath = `${crypto.randomUUID()}.jpg`
        const up = await supabase.storage.from(BUCKET).upload(newPath, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        qrPath = newPath
      }
      const { error } = await supabase.from('payment_settings').upsert(
        {
          id: 1,
          gcash_number: number.trim() || null,
          gcash_name: accountName.trim() || null,
          instructions: instructions.trim() || null,
          qr_path: qrPath,
          updated_by: profileId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      if (error) throw error
      if (oldPath && oldPath !== qrPath) await supabase.storage.from(BUCKET).remove([oldPath])
      await onDone()
    } catch (err) {
      if (newPath) await supabase.storage.from(BUCKET).remove([newPath])
      setError(errorMessage(err, 'Could not save the payment details.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pi-num" className="text-sm font-medium">GCash number</label>
          <input id="pi-num" inputMode="tel" value={number} maxLength={30} onChange={(e) => setNumber(e.target.value)} placeholder="09XX XXX XXXX" className={inputClass} />
        </div>
        <div>
          <label htmlFor="pi-name" className="text-sm font-medium">Account name</label>
          <input id="pi-name" value={accountName} maxLength={80} onChange={(e) => setAccountName(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="pi-ins" className="text-sm font-medium">Instructions (optional)</label>
        <textarea
          id="pi-ins"
          rows={3}
          value={instructions}
          maxLength={1000}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Put your full name in the message, then send a screenshot here after paying."
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="pi-qr" className="text-sm font-medium">QR image (optional)</label>
        <input
          id="pi-qr"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full min-h-11 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sand file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-sand-pressed"
        />
        {settings?.qr_path && !file && (
          <label className="mt-2 flex min-h-11 items-center gap-2 py-1 text-sm">
            <input type="checkbox" checked={removeQr} onChange={(e) => setRemoveQr(e.target.checked)} />
            Remove the current QR image
          </label>
        )}
      </div>
      {error && <p role="alert" className="rounded-md bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto sm:min-w-40">
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save details'}</button>
        </div>
        <button type="button" onClick={onCancel} className="min-h-11 px-2 py-2 text-sm text-umber hover:underline">Cancel</button>
      </div>
    </form>
  )
}

