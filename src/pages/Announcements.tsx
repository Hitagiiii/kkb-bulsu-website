import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { compressImage, errorMessage } from '../lib/finance'
import { signedUrlsFor } from '../lib/storage'
import {
  eventState,
  formatDateTime,
  formatEventTime,
  timeUntil,
  toLocalInput,
  type Announcement,
} from '../lib/announcements'
import Linkify from '../components/Linkify'
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'

const BUCKET = 'announcement-images'
const MAX_IMAGES = 3

interface FormValues {
  title: string
  body: string
  pinned: boolean
  eventAt: string | null // ISO
  keepPaths: string[] // photos already saved that stay
  newFiles: File[] // photos to upload
}

/** Upload photos; if one fails, remove the ones already uploaded. */
async function uploadImages(files: File[]): Promise<string[]> {
  const uploaded: string[] = []
  try {
    for (const file of files) {
      const blob = await compressImage(file)
      const path = `${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      uploaded.push(path)
    }
    return uploaded
  } catch (err) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
    throw err
  }
}

export default function Announcements() {
  const { profile } = useAuth()
  const canPost = hasRole(profile?.role, 'officer')

  const [items, setItems] = useState<Announcement[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const urlCache = useRef<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const list = (data ?? []) as Announcement[]
    setItems(list)
    const missing = list.flatMap((a) => a.image_paths ?? []).filter((p) => !urlCache.current[p])
    if (missing.length) Object.assign(urlCache.current, await signedUrlsFor(BUCKET, missing))
    setUrls({ ...urlCache.current })
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('announcements-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => void load())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  // keep "starts in 3 hours" fresh while the page stays open
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  async function create(v: FormValues): Promise<string | null> {
    let uploaded: string[] = []
    try {
      uploaded = await uploadImages(v.newFiles)
      const { error } = await supabase.from('announcements').insert({
        title: v.title,
        body: v.body,
        pinned: v.pinned,
        event_at: v.eventAt,
        image_paths: uploaded,
      })
      if (error) throw error
    } catch (err) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
      return errorMessage(err, 'Could not post the announcement.')
    }
    setComposing(false)
    await load()
    return null
  }

  async function save(a: Announcement, v: FormValues): Promise<string | null> {
    let uploaded: string[] = []
    try {
      uploaded = await uploadImages(v.newFiles)
      const { error } = await supabase
        .from('announcements')
        .update({
          title: v.title,
          body: v.body,
          pinned: v.pinned,
          event_at: v.eventAt,
          image_paths: [...v.keepPaths, ...uploaded],
        })
        .eq('id', a.id)
      if (error) throw error
    } catch (err) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
      return errorMessage(err, 'Could not save your changes.')
    }
    const removed = (a.image_paths ?? []).filter((p) => !v.keepPaths.includes(p))
    if (removed.length) await supabase.storage.from(BUCKET).remove(removed)
    setEditingId(null)
    await load()
    return null
  }

  async function togglePin(a: Announcement) {
    const { error } = await supabase.from('announcements').update({ pinned: !a.pinned }).eq('id', a.id)
    if (error) setError(errorMessage(error, 'Could not change the pin.'))
    else await load()
  }

  async function remove(a: Announcement) {
    const { error } = await supabase.from('announcements').delete().eq('id', a.id)
    if (error) return setError(errorMessage(error, 'Could not delete the announcement.'))
    if (a.image_paths?.length) await supabase.storage.from(BUCKET).remove(a.image_paths)
    setDeletingId(null)
    await load()
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Announcements</h1>
          <p className="mt-2 text-slate-600">News and notices from the officers.</p>
        </div>
        {canPost && !composing && (
          <button onClick={() => setComposing(true)} className={subtleButtonClass}>
            Write an announcement
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {canPost && composing && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="font-display text-xl font-semibold">New announcement</h2>
          <AnnouncementForm
            initial={{ title: '', body: '', pinned: false, eventAt: null, imagePaths: [] }}
            urls={urls}
            submitLabel="Post announcement"
            onSubmit={create}
            onCancel={() => setComposing(false)}
          />
        </div>
      )}

      {loading && <p className="mt-10 text-sm text-slate-500">Loading announcements…</p>}

      {!loading && items.length === 0 && (
        <p className="mt-10 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          {canPost ? 'Nothing posted yet. Write the first announcement above.' : 'Nothing has been posted yet.'}
        </p>
      )}

      <ul className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
        {items.map((a) => (
          <li key={a.id} className={'py-6 ' + (a.pinned ? 'border-l-4 border-l-brand-700 pl-4' : '')}>
            {editingId === a.id ? (
              <AnnouncementForm
                initial={{
                  title: a.title,
                  body: a.body,
                  pinned: a.pinned,
                  eventAt: a.event_at,
                  imagePaths: a.image_paths ?? [],
                }}
                urls={urls}
                submitLabel="Save changes"
                onSubmit={(v) => save(a, v)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <article>
                {a.pinned && <p className="text-xs font-semibold text-brand-700">Pinned</p>}
                <h2 className="font-display text-xl font-semibold break-words">{a.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Posted {formatDateTime(a.created_at)} by {a.author_name || 'an officer'}
                  {a.updated_at && ' (edited)'}
                </p>

                {a.event_at && <EventLine iso={a.event_at} now={now} />}

                <p className="mt-4 whitespace-pre-wrap break-words">
                  <Linkify text={a.body} />
                </p>

                <Photos paths={a.image_paths ?? []} urls={urls} />

                {canPost && (
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {deletingId === a.id ? (
                      <>
                        <span className="text-slate-700">Delete this announcement for good?</span>
                        <button onClick={() => void remove(a)} className="py-1 font-semibold text-red-700 hover:underline">
                          Yes, delete
                        </button>
                        <button onClick={() => setDeletingId(null)} className="py-1 text-slate-600 hover:underline">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => void togglePin(a)} className="py-1 font-medium text-brand-700 hover:underline">
                          {a.pinned ? 'Unpin' : 'Pin to top'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(a.id)
                            setDeletingId(null)
                          }}
                          className="py-1 font-medium text-brand-700 hover:underline"
                        >
                          Edit
                        </button>
                        <button onClick={() => setDeletingId(a.id)} className="py-1 text-slate-600 hover:text-red-700 hover:underline">
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </article>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- event date line ---------- */
function EventLine({ iso, now }: { iso: string; now: number }) {
  const state = eventState(iso, now)
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-brand-50 px-3 py-2 text-sm">
      <span className="font-semibold text-brand-800">Event</span>
      <span>{formatEventTime(iso)}</span>
      {state === 'soon' && (
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">
          Starts {timeUntil(iso, now)}
        </span>
      )}
      {state === 'later' && <span className="text-slate-500">{timeUntil(iso, now)}</span>}
      {state === 'past' && <span className="text-slate-500">Already happened</span>}
    </p>
  )
}

/* ---------- photos on a posted announcement ---------- */
function Photos({ paths, urls }: { paths: string[]; urls: Record<string, string> }) {
  if (paths.length === 0) return null
  const single = paths.length === 1
  return (
    <div className={'mt-4 grid gap-2 ' + (single ? '' : paths.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {paths.map((p) =>
        urls[p] ? (
          <a key={p} href={urls[p]} target="_blank" rel="noreferrer" title="Open full size">
            <img
              src={urls[p]}
              alt="Photo attached to the announcement"
              loading="lazy"
              className={
                'w-full rounded-lg border border-slate-200 bg-slate-100 ' +
                (single ? 'max-h-96 object-contain' : 'aspect-square object-cover')
              }
            />
          </a>
        ) : (
          <div key={p} className="aspect-square animate-pulse rounded-lg bg-slate-100" />
        ),
      )}
    </div>
  )
}

/* ---------- preview of a photo picked but not yet uploaded ---------- */
function NewPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let cancelled = false
    const reader = new FileReader()
    reader.onload = () => {
      if (!cancelled) setSrc(String(reader.result))
    }
    reader.readAsDataURL(file)
    return () => {
      cancelled = true
    }
  }, [file])

  return (
    <li className="w-24">
      {src ? (
        <img src={src} alt="New photo preview" className="h-24 w-24 rounded-lg border border-slate-200 object-cover" />
      ) : (
        <div className="h-24 w-24 animate-pulse rounded-lg bg-slate-100" />
      )}
      <button type="button" onClick={onRemove} className="mt-1 py-1 text-xs text-slate-600 hover:text-red-700 hover:underline">
        Remove
      </button>
    </li>
  )
}

/* ---------- create / edit form ---------- */
function AnnouncementForm({
  initial,
  urls,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { title: string; body: string; pinned: boolean; eventAt: string | null; imagePaths: string[] }
  urls: Record<string, string>
  submitLabel: string
  onSubmit: (values: FormValues) => Promise<string | null>
  onCancel: () => void
}) {
  const uid = useId()
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [pinned, setPinned] = useState(initial.pinned)
  const [eventLocal, setEventLocal] = useState(initial.eventAt ? toLocalInput(initial.eventAt) : '')
  const [keepPaths, setKeepPaths] = useState<string[]>(initial.imagePaths)
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = keepPaths.length + newFiles.length
  const room = MAX_IMAGES - total

  function pickFiles(list: FileList | null) {
    const images = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
    const accepted = images.slice(0, Math.max(room, 0))
    setNewFiles((prev) => [...prev, ...accepted])
    setNote(
      images.length > accepted.length
        ? `Only ${MAX_IMAGES} photos fit in one announcement, so ${images.length - accepted.length} were skipped.`
        : null,
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    const b = body.trim()
    if (!t) return setError('Add a title.')
    if (!b) return setError('Write the announcement text.')

    let eventAt: string | null = null
    if (eventLocal) {
      const d = new Date(eventLocal)
      if (Number.isNaN(d.getTime())) return setError('The event date is not valid.')
      eventAt = d.toISOString()
    }

    setBusy(true)
    setError(null)
    const message = await onSubmit({ title: t, body: b, pinned, eventAt, keepPaths, newFiles })
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <label htmlFor={`${uid}-title`} className="text-sm font-medium">Title</label>
        <input
          id={`${uid}-title`}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${uid}-body`} className="text-sm font-medium">Message</label>
        <textarea
          id={`${uid}-body`}
          value={body}
          maxLength={5000}
          rows={6}
          onChange={(e) => setBody(e.target.value)}
          className={inputClass + ' min-h-32'}
        />
        <p className="mt-1 text-xs text-slate-500">Links like https://meet.google.com/... become clickable.</p>
      </div>

      <div>
        <label htmlFor={`${uid}-event`} className="text-sm font-medium">Event date and time (optional)</label>
        <div className="flex items-center gap-3">
          <input
            id={`${uid}-event`}
            type="datetime-local"
            value={eventLocal}
            onChange={(e) => setEventLocal(e.target.value)}
            className={inputClass + ' sm:max-w-xs'}
          />
          {eventLocal && (
            <button type="button" onClick={() => setEventLocal('')} className="mt-1 py-2 text-sm text-slate-600 hover:underline">
              Clear
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Members see a reminder when the event is within 24 hours.
        </p>
      </div>

      <div>
        <label htmlFor={`${uid}-photos`} className="text-sm font-medium">
          Photos ({total} of {MAX_IMAGES})
        </label>
        <input
          id={`${uid}-photos`}
          type="file"
          accept="image/*"
          multiple
          disabled={room <= 0}
          onChange={(e) => {
            pickFiles(e.target.files)
            e.target.value = ''
          }}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-slate-200 disabled:opacity-60"
        />
        {note && <p className="mt-1 text-xs text-amber-800">{note}</p>}

        {total > 0 && (
          <ul className="mt-3 flex flex-wrap gap-3">
            {keepPaths.map((p) => (
              <li key={p} className="w-24">
                {urls[p] ? (
                  <img src={urls[p]} alt="Saved photo" className="h-24 w-24 rounded-lg border border-slate-200 object-cover" />
                ) : (
                  <div className="h-24 w-24 animate-pulse rounded-lg bg-slate-100" />
                )}
                <button
                  type="button"
                  onClick={() => setKeepPaths((prev) => prev.filter((x) => x !== p))}
                  className="mt-1 py-1 text-xs text-slate-600 hover:text-red-700 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
            {newFiles.map((f, i) => (
              <NewPreview
                key={`${f.name}-${f.size}-${i}`}
                file={f}
                onRemove={() => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </ul>
        )}
      </div>

      <label className="flex items-center gap-2 py-1 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Pin to the top
      </label>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto sm:min-w-48">
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? (newFiles.length ? 'Uploading photos…' : 'Saving…') : submitLabel}
          </button>
        </div>
        <button type="button" onClick={onCancel} className="py-2 text-sm text-slate-600 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  )
}
