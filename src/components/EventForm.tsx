import { useId, useState, type FormEvent } from 'react'
import { toLocalInput } from '../lib/announcements'
import { HOUR_MS, parseMeetingLink, type EventRow } from '../lib/events'
import LocationPicker from './LocationPicker'
import { buttonClass, inputClass } from './ui'

export interface EventValues {
  title: string
  description: string | null
  startsAt: string // ISO
  endsAt: string | null // ISO
  locationName: string | null
  latitude: number | null
  longitude: number | null
  meetingLink: string | null
}

export default function EventForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: EventRow | null
  submitLabel: string
  onSubmit: (values: EventValues) => Promise<string | null>
  onCancel: () => void
}) {
  const uid = useId()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [starts, setStarts] = useState(() =>
    toLocalInput(initial?.starts_at ?? new Date(Math.ceil(Date.now() / HOUR_MS) * HOUR_MS).toISOString()),
  )
  const [ends, setEnds] = useState(initial?.ends_at ? toLocalInput(initial.ends_at) : '')
  const [locationName, setLocationName] = useState(initial?.location_name ?? '')
  const [lat, setLat] = useState<number | null>(initial?.latitude ?? null)
  const [lng, setLng] = useState<number | null>(initial?.longitude ?? null)
  const [link, setLink] = useState(initial?.meeting_link ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return setError('Add a title for the event.')

    const startDate = new Date(starts)
    if (!starts || Number.isNaN(startDate.getTime())) return setError('Choose when the event starts.')

    let endsAt: string | null = null
    if (ends) {
      const endDate = new Date(ends)
      if (Number.isNaN(endDate.getTime())) return setError('The end time is not valid.')
      if (endDate < startDate) return setError('The event cannot end before it starts.')
      endsAt = endDate.toISOString()
    }

    const parsed = parseMeetingLink(link)
    if (!parsed.valid) return setError('The meeting link does not look like a web link. Paste the full link, for example https://meet.google.com/abc-defg-hij.')

    setBusy(true)
    setError(null)
    const message = await onSubmit({
      title: t,
      description: description.trim() || null,
      startsAt: startDate.toISOString(),
      endsAt,
      locationName: locationName.trim() || null,
      latitude: lat,
      longitude: lng,
      meetingLink: parsed.value,
    })
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <h2 className="font-display text-xl font-semibold">{initial ? 'Edit event' : 'New event'}</h2>

      <div>
        <label htmlFor={`${uid}-title`} className="text-sm font-medium">Title</label>
        <input id={`${uid}-title`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-start`} className="text-sm font-medium">Starts</label>
          <input id={`${uid}-start`} type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`${uid}-end`} className="text-sm font-medium">Ends (optional)</label>
          <input id={`${uid}-end`} type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor={`${uid}-where`} className="text-sm font-medium">Where (optional)</label>
        <input
          id={`${uid}-where`}
          value={locationName}
          maxLength={150}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder="e.g. BulSU Malolos, Room 204"
          className={inputClass}
        />
      </div>

      <div>
        <p className="text-sm font-medium">Map pin (optional)</p>
        <p className="mb-2 text-xs text-slate-500">Members get a Directions button that opens their maps app.</p>
        <LocationPicker
          lat={lat}
          lng={lng}
          onChange={(a, b) => {
            setLat(a)
            setLng(b)
          }}
          onPlaceName={(name) => {
            if (!locationName.trim()) setLocationName(name)
          }}
        />
      </div>

      <div>
        <label htmlFor={`${uid}-link`} className="text-sm font-medium">Online meeting link (optional)</label>
        <input
          id={`${uid}-link`}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          inputMode="url"
          placeholder="Paste a Google Meet or Zoom link"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">Members will see a Join button for this event.</p>
      </div>

      <div>
        <label htmlFor={`${uid}-desc`} className="text-sm font-medium">Details (optional)</label>
        <textarea
          id={`${uid}-desc`}
          value={description}
          maxLength={5000}
          rows={4}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass + ' min-h-24'}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto sm:min-w-48">
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? 'Saving…' : submitLabel}
          </button>
        </div>
        <button type="button" onClick={onCancel} className="py-2 text-sm text-slate-600 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  )
}
