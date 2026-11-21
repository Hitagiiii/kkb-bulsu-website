import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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
import { buttonClass, cardClass, eyebrowClass, inputClass, subtleButtonClass } from '../components/ui'
import PageHeader from '../components/PageHeader'

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
  const [filter, setFilter] = useState<'all' | 'pinned' | 'events'>('all')
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

  const shown = items.filter((a) => (filter === 'pinned' ? a.pinned : filter === 'events' ? !!a.event_at : true))
  const counts = { all: items.length, pinned: items.filter((a) => a.pinned).length, events: items.filter((a) => a.event_at).length }
  const dontMiss = items.filter((a) => a.pinned || (a.event_at && eventState(a.event_at, now) !== 'past')).slice(0, 3)
  const byMonth = new Map<string, number>()
  for (const a of items) {
    const k = new Date(a.created_at).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1)
  }
  const TABS: { id: typeof filter; label: string }[] = [
    { id: 'all', label: 'All posts' },
    { id: 'pinned', label: 'Pinned' },
    { id: 'events', label: 'Events' },
  ]

  return (
    <div className="w-full">
      <PageHeader
        eyebrow="The community board"
        title="What’s happening."
        subtitle="News, stories and the things you need to know."
        action={
          canPost && !composing ? (
            <button onClick={() => setComposing(true)} className={buttonClass + ' min-h-11'}>
              New announcement
            </button>
          ) : undefined
        }
      />

      {error && (
        <p role="alert" className="mt-4 border-l-4 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">
          {error}
        </p>
      )}

      {canPost && composing && (
        <div className={cardClass + ' mt-6 p-4 sm:p-6'}>
          <p className={eyebrowClass}>Officer workspace</p>
          <h2 className="mt-1 text-xl font-medium">Write to your community.</h2>
          <p className="mt-1 text-sm text-muted">Announcements are visible to approved members only.</p>
          <AnnouncementForm
            initial={{ title: '', body: '', pinned: false, eventAt: null, imagePaths: [] }}
            urls={urls}
            submitLabel="Publish announcement"
            onSubmit={create}
            onCancel={() => setComposing(false)}
            authorName={profile?.full_name}
          />
        </div>
      )}

      <div role="group" aria-label="Filter posts" className="mt-6 flex gap-5 border-b border-line text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={filter === t.id}
            onClick={() => setFilter(t.id)}
            className={
              '-mb-px border-b-2 py-2.5 transition-colors ' +
              (filter === t.id ? 'border-brand-700 font-semibold text-brand-700' : 'border-transparent text-muted hover:text-ink')
            }
          >
            {t.label} <span className="text-xs">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div>
          {loading && <p className="text-sm text-muted">Loading announcements…</p>}

          {!loading && shown.length === 0 && (
            <div className={cardClass + ' px-4 py-10 text-center'}>
              <p className="text-base font-semibold text-ink">
                {items.length === 0 ? 'Nothing has been posted yet.' : 'No posts in this tab.'}
              </p>
              <p className="mt-1 text-sm text-muted">
                {canPost && items.length === 0 ? 'Write the first announcement to get the board going.' : 'Check back soon.'}
              </p>
            </div>
          )}

          <ul className="space-y-4">
            {shown.map((a) => (
              <li key={a.id}>
                {editingId === a.id ? (
                  <div className={cardClass + ' p-4 sm:p-6'}>
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
                      authorName={a.author_name}
                    />
                  </div>
                ) : (
                  <article className={cardClass + ' overflow-hidden'}>
                    <Photos paths={a.image_paths ?? []} urls={urls} />
                    <div className="p-4 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0 flex-1">
                          <p className={eyebrowClass}>
                            {a.pinned ? 'Pinned / Official update' : a.event_at ? 'Event / Announcement' : 'Community'}
                            <span className="text-muted"> · {formatDateTime(a.created_at).split(',')[0]}</span>
                          </p>
                          <h2 className="mt-1 text-xl font-semibold break-words sm:text-2xl">{a.title}</h2>
                          <p className="mt-1 text-xs text-muted">
                            {a.author_name || 'An officer'} · {formatDateTime(a.created_at)}
                            {a.updated_at && ' · Edited'}
                          </p>
                        </div>
                        {canPost && (
                          <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 text-xs sm:text-sm">
                            {deletingId === a.id ? (
                              <>
                                <span className="text-ink">Delete permanently?</span>
                                <button onClick={() => void remove(a)} className="min-h-11 font-semibold text-brand-700 underline underline-offset-2">Yes, delete</button>
                                <button onClick={() => setDeletingId(null)} className="min-h-11 text-muted underline underline-offset-2">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => void togglePin(a)} className="min-h-11 text-brand-700 hover:underline">{a.pinned ? 'Unpin' : 'Pin'}</button>
                                <button
                                  onClick={() => {
                                    setEditingId(a.id)
                                    setDeletingId(null)
                                  }}
                                  className="min-h-11 text-brand-700 hover:underline"
                                >Edit</button>
                                <button onClick={() => setDeletingId(a.id)} className="min-h-11 text-muted hover:text-brand-700 hover:underline">Delete</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {a.event_at && <EventLine iso={a.event_at} now={now} />}

                      <p className="mt-3 text-sm leading-6 break-words whitespace-pre-wrap text-ink">
                        <Linkify text={a.body} />
                      </p>
                      {a.event_at && eventState(a.event_at, now) !== 'past' && (
                        <Link to="/events" className={subtleButtonClass + ' mt-4'}>
                          Open event
                        </Link>
                      )}
                    </div>
                  </article>
                )}
              </li>
            ))}
          </ul>
        </div>

        <aside className="space-y-6">
          {dontMiss.length > 0 && (
            <section className={cardClass + ' p-4'} aria-label="Don't miss">
              <p className="text-sm font-semibold text-ink">Don’t miss</p>
              <ol className="mt-3 space-y-3">
                {dontMiss.map((a, i) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <span className="text-xs font-semibold text-brand-700">{String(i + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 break-words text-ink">{a.title}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {byMonth.size > 0 && (
            <section className={cardClass + ' p-4'} aria-label="Browse by month">
              <p className="text-sm font-semibold text-ink">Browse by month</p>
              <ul className="mt-3 space-y-2 text-sm">
                {[...byMonth.entries()].map(([month, n]) => (
                  <li key={month} className="flex justify-between gap-2 text-muted">
                    <span>{month}</span>
                    <span>{n} {n === 1 ? 'post' : 'posts'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

/* ---------- event date line ---------- */
function EventLine({ iso, now }: { iso: string; now: number }) {
  const state = eventState(iso, now)
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
      <span className="rounded-md bg-soft px-2 py-1 font-semibold text-brand-700">Event</span>
      <span className="text-muted">{formatEventTime(iso)}</span>
      {state === 'soon' && (
        <span className="rounded-md bg-accent-100 px-2 py-1 text-xs font-semibold text-accent-700">Starts {timeUntil(iso, now)}</span>
      )}
      {state === 'later' && <span className="text-muted">{timeUntil(iso, now)}</span>}
      {state === 'past' && <span className="text-muted">Already happened</span>}
    </p>
  )
}

/* ---------- photos on a posted announcement ---------- */
function Photos({ paths, urls }: { paths: string[]; urls: Record<string, string> }) {
  if (paths.length === 0) return null
  const single = paths.length === 1
  return (
    <div className={'grid gap-px bg-line ' + (single ? 'grid-cols-1' : paths.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
      {paths.map((p) =>
        urls[p] ? (
          <a key={p} href={urls[p]} target="_blank" rel="noreferrer" title="Open full size">
            <img
              src={urls[p]}
              alt="Photo attached to the announcement"
              loading="lazy"
              className={'w-full bg-sand object-cover ' + (single ? 'aspect-[16/9] max-h-[28rem]' : 'aspect-square')}
            />
          </a>
        ) : (
          <div key={p} className={'bg-sand ' + (single ? 'aspect-[16/9]' : 'aspect-square')} />
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
        <img src={src} alt="New photo preview" className="h-24 w-24 border border-line object-cover" />
      ) : (
        <div className="h-24 w-24 bg-sand" />
      )}
      <button type="button" onClick={onRemove} className="mt-1 min-h-11 py-2 text-xs text-umber underline underline-offset-2 hover:text-error">
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
  authorName,
}: {
  initial: { title: string; body: string; pinned: boolean; eventAt: string | null; imagePaths: string[] }
  urls: Record<string, string>
  submitLabel: string
  onSubmit: (values: FormValues) => Promise<string | null>
  onCancel: () => void
  authorName?: string
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
    <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
    <form onSubmit={submit} className="space-y-4">
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
        <p className="mt-1 text-xs text-muted">Links like https://meet.google.com/... become clickable.</p>
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
            <button type="button" onClick={() => setEventLocal('')} className="mt-1 min-h-11 py-2 text-sm text-umber underline underline-offset-2">
              Clear
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
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
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={room <= 0}
          onChange={(e) => {
            pickFiles(e.target.files)
            e.target.value = ''
          }}
          className="mt-1 block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:border-0 file:bg-sand file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-sand disabled:opacity-60"
        />
        {note && <p className="mt-1 text-xs text-accent-700">{note}</p>}

        {total > 0 && (
          <ul className="mt-3 flex flex-wrap gap-3">
            {keepPaths.map((p) => (
              <li key={p} className="w-24">
                {urls[p] ? (
                  <img src={urls[p]} alt="Saved photo" className="h-24 w-24 border border-line object-cover" />
                ) : (
                  <div className="h-24 w-24 bg-sand" />
                )}
                <button
                  type="button"
                  onClick={() => setKeepPaths((prev) => prev.filter((x) => x !== p))}
                  className="mt-1 min-h-11 py-2 text-xs text-umber underline underline-offset-2 hover:text-error"
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

      <label className="flex min-h-11 items-center gap-2 py-1 text-sm">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-accent" />
        Pin to the top
      </label>

      {error && (
        <p role="alert" className="border-l-4 border-brand-700 bg-soft px-3 py-2 text-sm text-brand-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto sm:min-w-48">
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? (newFiles.length ? 'Uploading photos…' : 'Saving…') : submitLabel}
          </button>
        </div>
        <button type="button" onClick={onCancel} className="min-h-11 px-2 py-2 text-sm text-muted underline underline-offset-2">
          Cancel
        </button>
      </div>
    </form>

    <aside aria-label="Member preview" className="rounded-md border border-line bg-paper p-4 lg:sticky lg:top-6">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Member preview</p>
      <div className="mt-3 rounded-md border border-line bg-white p-4">
        <p className={eyebrowClass}>{pinned ? 'Pinned / Official update' : 'Community'}</p>
        <p className="mt-1 text-lg font-semibold break-words text-ink">{title.trim() || 'Your title appears here'}</p>
        <p className="mt-1 text-xs text-muted">{authorName || 'An officer'} · Visible after publishing</p>
        <p className="mt-3 line-clamp-4 text-sm break-words whitespace-pre-wrap text-ink">
          {body.trim() || 'Your message appears here.'}
        </p>
      </div>
    </aside>
    </div>
  )
}

