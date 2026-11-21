import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole, ROLE_LABEL, type Role } from '../lib/types'
import { errorMessage } from '../lib/finance'
import { formatDateTime } from '../lib/announcements'
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'
import Chip from '../components/Chip'
import PageHeader from '../components/PageHeader'

const BUCKET = 'documents'
const MAX_BYTES = 10 * 1024 * 1024
const CATEGORIES = ['Constitution', 'Minutes', 'Forms', 'Financial', 'Templates', 'Other']
const ACCESS: { value: Role; label: string }[] = [
  { value: 'member', label: 'All approved members' },
  { value: 'officer', label: 'Officers and above' },
  { value: 'treasurer', label: 'Treasurer and admin' },
  { value: 'admin', label: 'Admin only' },
]

interface DocRow {
  id: string
  title: string
  description: string | null
  category: string
  storage_path: string
  file_name: string
  file_size: number | null
  min_role: Role
  uploaded_name: string
  created_at: string
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Documents() {
  const { profile } = useAuth()
  const canUpload = hasRole(profile?.role, 'officer')
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(500)
    if (error) setError(error.message)
    else {
      setDocs((data ?? []) as DocRow[])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function download(d: DocRow) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 120, { download: d.file_name })
    if (error || !data) return setError(errorMessage(error, 'Could not open the file.'))
    window.location.assign(data.signedUrl)
  }

  async function remove(d: DocRow) {
    const { error } = await supabase.from('documents').delete().eq('id', d.id)
    if (error) return setError(errorMessage(error, 'Could not delete the document.'))
    await supabase.storage.from(BUCKET).remove([d.storage_path])
    setDeleting(null)
    await load()
  }

  const q = search.trim().toLowerCase()
  const shown = docs.filter(
    (d) =>
      (category === 'all' || d.category === category) &&
      (!q || d.title.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q) || d.file_name.toLowerCase().includes(q)),
  )

  return (
    <div className="w-full">
      <PageHeader
        eyebrow="The shared shelf"
        title="What you need, in one place."
        subtitle="Official resources for KKB BULSU members."
        action={canUpload && !adding ? (
          <button onClick={() => setAdding(true)} className={subtleButtonClass + ' min-h-11'}>Upload a file</button>
        ) : undefined}
      />

      {error && <p role="alert" className="mt-6 border-l-2 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}

      {canUpload && adding && (
        <UploadForm
          onDone={async () => {
            setAdding(false)
            await load()
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-b border-line pb-3">
        <input
          aria-label="Search documents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-base sm:text-sm"
        />
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="min-h-11 rounded-md border border-line bg-white px-2 py-2 text-base sm:text-sm"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading && <p className="mt-6 text-sm text-muted">Loading documents…</p>}
      {!loading && shown.length === 0 && (
        <p className="mt-5 rounded-md border border-line bg-white px-4 py-6 text-sm text-muted">
          {docs.length === 0 ? (canUpload ? 'No files yet. Upload the first one above.' : 'No files yet.') : 'No files match.'}
        </p>
      )}

      <ul className="mt-5 divide-y divide-line border-y border-line bg-white" aria-label="Documents">
        {shown.map((d) => (
          <li key={d.id} className="px-4 py-4 sm:px-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-semibold break-words text-ink">{d.title}</p>
                  <Chip>{d.category}</Chip>
                  {d.min_role !== 'member' && <Chip tone="amber">{ROLE_LABEL[d.min_role]} and above</Chip>}
                </div>
                {d.description && <p className="mt-1 text-sm leading-5 break-words text-umber">{d.description}</p>}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="break-all">{d.file_name}</span>
                  {d.file_size ? <span>{formatSize(d.file_size)}</span> : null}
                  <span>Added {formatDateTime(d.created_at)}</span>
                  {d.uploaded_name && <span>by {d.uploaded_name}</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <button onClick={() => void download(d)} className={subtleButtonClass + ' min-h-11'}>Download</button>
                {canUpload && (deleting === d.id ? (
                  <>
                    <span className="text-sm text-ink">Delete this file?</span>
                    <button onClick={() => void remove(d)} className="min-h-11 font-semibold text-brand-700 hover:underline">Yes</button>
                    <button onClick={() => setDeleting(null)} className="min-h-11 text-umber hover:underline">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setDeleting(d.id)} className="min-h-11 text-sm text-umber hover:text-brand-700 hover:underline">Delete</button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function UploadForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Forms')
  const [access, setAccess] = useState<Role>('member')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError('Choose a file first.')
    if (file.size > MAX_BYTES) return setError('The file is larger than 10 MB.')
    const t = title.trim() || file.name
    setBusy(true)
    setError(null)
    const path = `${crypto.randomUUID()}/${file.name.replace(/[^\w.-]+/g, '_')}`
    try {
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (up.error) throw up.error
      const { error } = await supabase.from('documents').insert({
        title: t,
        description: description.trim() || null,
        category,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        min_role: access,
      })
      if (error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw error
      }
      await onDone()
    } catch (err) {
      setError(errorMessage(err, 'Could not upload the file.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-md border border-line bg-white p-4 sm:p-6">
      <h2 className="text-xl font-medium">Upload a file</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="d-file" className="text-sm font-medium">File (up to 10 MB)</label>
          <input
            id="d-file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-paper file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-sand"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="d-title" className="text-sm font-medium">Title</label>
          <input id="d-title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the file name" className={inputClass} />
        </div>
        <div>
          <label htmlFor="d-cat" className="text-sm font-medium">Category</label>
          <select id="d-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="d-acc" className="text-sm font-medium">Who can open it</label>
          <select id="d-acc" value={access} onChange={(e) => setAccess(e.target.value as Role)} className={inputClass}>
            {ACCESS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="d-desc" className="text-sm font-medium">Description (optional)</label>
          <textarea id="d-desc" rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>
      </div>
      {error && <p role="alert" className="mt-4 border-l-2 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto sm:min-w-40">
          <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
        <button type="button" onClick={onCancel} className="py-2 text-sm text-umber hover:underline">Cancel</button>
      </div>
    </form>
  )
}

