import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { errorMessage } from '../lib/finance'
import { eventState, timeUntil } from '../lib/announcements'
import {
  dayKey,
  formatDay,
  formatRange,
  formatTime,
  googleDirections,
  googleDirectionsByName,
  isOver,
  linkHost,
  wazeDirections,
  type EventRow,
} from '../lib/events'
import Chip from '../components/Chip'
import EventExtras from '../components/EventExtras'
import EventForm, { type EventValues } from '../components/EventForm'
import { CalendarIcon, ClockIcon, MapPinIcon, VideoIcon } from '../components/Icons'
import Linkify from '../components/Linkify'
import MapView from '../components/MapView'
import Modal from '../components/Modal'
import MonthCalendar from '../components/MonthCalendar'
import { buttonClass, subtleButtonClass } from '../components/ui'

type View = 'list' | 'calendar'
type Rsvp = 'going' | 'not_going'

function dayLabel(key: string, nowMs: number): string {
  if (key === dayKey(new Date(nowMs))) return 'Today'
  if (key === dayKey(new Date(nowMs + 24 * 60 * 60 * 1000))) return 'Tomorrow'
  return formatDay(key + 'T00:00:00')
}

export default function Events() {
  const { profile } = useAuth()
  const canEdit = hasRole(profile?.role, 'officer')

  const [events, setEvents] = useState<EventRow[]>([])
  const [rsvps, setRsvps] = useState<Record<string, Rsvp>>({})
  const [attended, setAttended] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('list')
  const [now, setNow] = useState(() => Date.now())
  const [openId, setOpenId] = useState<string | null>(null)
  const [formFor, setFormFor] = useState<'new' | string | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()))
  const [showPast, setShowPast] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('events').select('*').order('starts_at').limit(500)
    if (error) setError(error.message)
    else {
      setEvents((data ?? []) as EventRow[])
      setError(null)
    }
    setLoading(false)
  }, [])

  const loadMine = useCallback(async () => {
    if (!profile) return
    const [r, a] = await Promise.all([
      supabase.from('event_rsvps').select('event_id, status').eq('user_id', profile.id),
      supabase.from('event_attendance').select('event_id').eq('user_id', profile.id),
    ])
    setRsvps(
      Object.fromEntries(((r.data ?? []) as { event_id: string; status: Rsvp }[]).map((x) => [x.event_id, x.status])),
    )
    setAttended(new Set(((a.data ?? []) as { event_id: string }[]).map((x) => x.event_id)))
  }, [profile])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('events-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => void load())
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load])

  useEffect(() => {
    void loadMine()
  }, [loadMine])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const upcoming = events.filter((e) => !isOver(e, now))
  const past = events.filter((e) => isOver(e, now)).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  const next = upcoming[0] ?? null
  const rest = upcoming.slice(1)
  const dayEvents = events.filter((e) => dayKey(e.starts_at) === selectedDay)
  const opened = events.find((e) => e.id === openId) ?? null
  const editing = formFor && formFor !== 'new' ? (events.find((e) => e.id === formFor) ?? null) : null

  // group the rest of the upcoming events by day, in order
  const groups: { key: string; items: EventRow[] }[] = []
  for (const e of rest) {
    const key = dayKey(e.starts_at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(e)
    else groups.push({ key, items: [e] })
  }

  const closeDetail = () => {
    setOpenId(null)
    void loadMine()
  }

  async function saveEvent(v: EventValues, id: string | null): Promise<string | null> {
    const payload = {
      title: v.title,
      description: v.description,
      starts_at: v.startsAt,
      ends_at: v.endsAt,
      location_name: v.locationName,
      latitude: v.latitude,
      longitude: v.longitude,
      meeting_link: v.meetingLink,
    }
    const { error } = id
      ? await supabase.from('events').update(payload).eq('id', id)
      : await supabase.from('events').insert(payload)
    if (error) return errorMessage(error, 'Could not save the event.')
    setFormFor(null)
    await load()
    return null
  }

  async function deleteEvent(id: string) {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) return setError(errorMessage(error, 'Could not delete the event.'))
    setOpenId(null)
    await load()
  }

  const card = (e: EventRow) => (
    <li key={e.id}>
      <EventCard event={e} now={now} rsvp={rsvps[e.id]} attended={attended.has(e.id)} onOpen={() => setOpenId(e.id)} />
    </li>
  )

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Events</h1>
          <p className="mt-2 text-slate-600">What is happening, where, and who is going.</p>
        </div>
        {canEdit && (
          <button onClick={() => setFormFor('new')} className={buttonClass + ' sm:w-auto'}>
            Add an event
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div role="group" aria-label="View" className="mt-8 inline-flex rounded-full bg-card p-1">
        {(['list', 'calendar'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={
              'rounded-full px-5 py-2 text-sm font-medium transition-colors sm:py-1.5 ' +
              (view === v ? 'bg-ink text-white' : 'text-ink hover:bg-secondary')
            }
          >
            {v === 'list' ? 'List' : 'Calendar'}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mt-8 space-y-3" aria-label="Loading events">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      )}

      {!loading && view === 'list' && (
        <>
          {next ? (
            <NextUp event={next} now={now} rsvp={rsvps[next.id]} onOpen={() => setOpenId(next.id)} />
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <CalendarIcon size={36} className="mx-auto text-brand-700" />
              <p className="font-display mt-3 text-xl font-semibold">Nothing coming up</p>
              <p className="mt-1 text-sm text-slate-500">
                {canEdit ? 'Add the first event and members will see it here.' : 'New events will show up here.'}
              </p>
            </div>
          )}

          {groups.map((g) => (
            <section key={g.key} className="mt-8" aria-label={dayLabel(g.key, now)}>
              <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{dayLabel(g.key, now)}</h2>
              <ul className="mt-3 grid gap-4 sm:grid-cols-2">{g.items.map((e) => card(e))}</ul>
            </section>
          ))}

          {past.length > 0 && (
            <div className="mt-10">
              <button
                type="button"
                onClick={() => setShowPast((s) => !s)}
                aria-expanded={showPast}
                className="font-display py-1 text-lg font-semibold"
              >
                Past events ({past.length}) {showPast ? '(hide)' : '(show)'}
              </button>
              {showPast && <ul className="mt-3 grid gap-4 sm:grid-cols-2">{past.slice(0, 30).map((e) => card(e))}</ul>}
            </div>
          )}
        </>
      )}

      {!loading && view === 'calendar' && (
        <div className="mt-6">
          <MonthCalendar events={events} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenEvent={(id) => setOpenId(id)} />
          <section className="mt-6" aria-label="Events on the selected day">
            <h2 className="font-display text-lg font-semibold">{formatDay(selectedDay + 'T00:00:00')}</h2>
            {dayEvents.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No events on this day.</p>
            ) : (
              <ul className="mt-3 grid gap-4 sm:grid-cols-2">{dayEvents.map((e) => card(e))}</ul>
            )}
          </section>
        </div>
      )}

      {opened && !formFor && (
        <Modal label="Event details" onClose={closeDetail}>
          <EventDetail
            event={opened}
            now={now}
            canEdit={canEdit}
            onEdit={() => setFormFor(opened.id)}
            onDelete={() => void deleteEvent(opened.id)}
            onClose={closeDetail}
          />
        </Modal>
      )}

      {formFor && (formFor === 'new' || editing) && (
        <Modal label={formFor === 'new' ? 'New event' : 'Edit event'} onClose={() => setFormFor(null)} dismissOnBackdrop={false}>
          <EventForm
            initial={editing}
            submitLabel={editing ? 'Save changes' : 'Add event'}
            onSubmit={(v) => saveEvent(v, editing ? editing.id : null)}
            onCancel={() => setFormFor(null)}
          />
        </Modal>
      )}
    </div>
  )
}

/* ---------- cover tile: the "image" of an event card ---------- */
function EventCover({ iso, label, large = false }: { iso: string; label?: string; large?: boolean }) {
  const d = new Date(iso)
  return (
    <div className={'relative flex items-end bg-secondary p-4 ' + (large ? 'min-h-48 sm:min-h-full' : 'h-32')}>
      {label && (
        <span className="absolute top-3 left-3 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink">{label}</span>
      )}
      <div>
        <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">
          {d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short' })}
        </p>
        <p className={'font-display leading-none font-bold text-ink ' + (large ? 'text-7xl' : 'text-5xl')}>{d.getDate()}</p>
      </div>
    </div>
  )
}

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  )
}

/* ---------- the next event, shown big ---------- */
function NextUp({ event, now, rsvp, onOpen }: { event: EventRow; now: number; rsvp?: Rsvp; onOpen: () => void }) {
  const live = new Date(event.starts_at).getTime() <= now
  return (
    <section aria-label="Next event" className="mt-8 overflow-hidden rounded-3xl bg-card sm:grid sm:grid-cols-[2fr_3fr]">
      <EventCover iso={event.starts_at} label={live ? 'Happening now' : `Starts ${timeUntil(event.starts_at, now)}`} large />
      <div className="p-5 sm:p-7">
        <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">Next up</p>
        <h2 className="font-display mt-1 text-2xl leading-tight font-bold break-words sm:text-3xl">{event.title}</h2>
        <div className="mt-4 space-y-1.5 text-slate-700">
          <Meta icon={<ClockIcon size={16} />}>{formatRange(event.starts_at, event.ends_at)}</Meta>
          {event.location_name && <Meta icon={<MapPinIcon size={16} />}>{event.location_name}</Meta>}
          {event.meeting_link && <Meta icon={<VideoIcon size={16} />}>Online link available</Meta>}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onOpen} className={buttonClass + ' sm:w-auto'}>
            View details
          </button>
          {event.meeting_link && (
            <a href={event.meeting_link} target="_blank" rel="noopener noreferrer" className={subtleButtonClass}>
              Join online
            </a>
          )}
          {rsvp === 'going' && <Chip tone="green">You are going</Chip>}
        </div>
      </div>
    </section>
  )
}

/* ---------- one event in a list ---------- */
function EventCard({
  event,
  now,
  rsvp,
  attended,
  onOpen,
}: {
  event: EventRow
  now: number
  rsvp?: Rsvp
  attended: boolean
  onOpen: () => void
}) {
  const over = isOver(event, now)
  const soon = !over && eventState(event.starts_at, now) === 'soon'
  const hasPin = event.latitude != null && event.longitude != null
  const timeLabel = formatTime(event.starts_at) + (event.ends_at ? ` to ${formatTime(event.ends_at)}` : '')

  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        'block w-full overflow-hidden rounded-md border border-hairline bg-white text-left transition-colors hover:border-ash ' +
        (over ? 'opacity-75' : '')
      }
    >
      <EventCover iso={event.starts_at} label={timeLabel} />
      <span className="block p-4">
        <span className="font-display block text-lg font-bold break-words">{event.title}</span>
        {event.location_name && (
          <span className="mt-1 flex text-slate-600">
            <Meta icon={<MapPinIcon size={15} />}>{event.location_name}</Meta>
          </span>
        )}
        {(soon || attended || rsvp || event.meeting_link || hasPin) && (
          <span className="mt-3 flex flex-wrap gap-1.5">
            {soon && <Chip tone="amber">Starts {timeUntil(event.starts_at, now)}</Chip>}
            {attended && <Chip tone="green">Checked in</Chip>}
            {!attended && rsvp === 'going' && <Chip tone="green">You are going</Chip>}
            {!attended && rsvp === 'not_going' && <Chip>Not going</Chip>}
            {event.meeting_link && <Chip tone="brand">Online</Chip>}
            {hasPin && <Chip>On the map</Chip>}
          </span>
        )}
      </span>
    </button>
  )
}

/* ---------- full details in a dialog ---------- */
function EventDetail({
  event,
  now,
  canEdit,
  onEdit,
  onDelete,
  onClose,
}: {
  event: EventRow
  now: number
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const hasPin = event.latitude != null && event.longitude != null
  const over = isOver(event, now)
  const soon = !over && eventState(event.starts_at, now) === 'soon'

  return (
    <div>
      <div className="relative -mx-5 -mt-5 mb-5">
        <EventCover
          iso={event.starts_at}
          label={soon ? `Starts ${timeUntil(event.starts_at, now)}` : over ? 'Already happened' : undefined}
          large
        />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 rounded-full bg-white px-4 py-2 text-sm font-bold text-ink hover:bg-card"
        >
          Close
        </button>
      </div>
      <h2 className="font-display text-2xl leading-tight font-bold break-words">{event.title}</h2>
      <div className="mt-3 mb-5 space-y-1.5 text-slate-700">
        <Meta icon={<ClockIcon size={16} />}>{formatRange(event.starts_at, event.ends_at)}</Meta>
        {event.location_name && <Meta icon={<MapPinIcon size={16} />}>{event.location_name}</Meta>}
      </div>

      {event.meeting_link && (
        <a href={event.meeting_link} target="_blank" rel="noopener noreferrer" className={buttonClass + ' sm:w-auto'}>
          Join online meeting ({linkHost(event.meeting_link)})
        </a>
      )}

      {(event.location_name || hasPin) && (
        <div className="mt-5">
          {hasPin && (
            <>
              <MapView lat={event.latitude} lng={event.longitude} className="h-56 w-full rounded-2xl border border-slate-200" />
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={googleDirections(event.latitude!, event.longitude!)} target="_blank" rel="noopener noreferrer" className={subtleButtonClass}>
                  Directions in Google Maps
                </a>
                <a href={wazeDirections(event.latitude!, event.longitude!)} target="_blank" rel="noopener noreferrer" className={subtleButtonClass}>
                  Directions in Waze
                </a>
              </div>
            </>
          )}
          {!hasPin && event.location_name && (
            <a href={googleDirectionsByName(event.location_name)} target="_blank" rel="noopener noreferrer" className={subtleButtonClass}>
              Find it in Google Maps
            </a>
          )}
        </div>
      )}

      {event.description && (
        <p className="mt-5 break-words whitespace-pre-wrap">
          <Linkify text={event.description} />
        </p>
      )}

      <EventExtras event={event} canEdit={canEdit} over={over} />

      {canEdit && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-4 text-sm">
          {confirming ? (
            <>
              <span className="text-slate-700">Delete this event for good?</span>
              <button onClick={onDelete} className="py-1 font-semibold text-red-700 hover:underline">
                Yes, delete
              </button>
              <button onClick={() => setConfirming(false)} className="py-1 text-slate-600 hover:underline">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={onEdit} className="py-1 font-medium text-brand-700 hover:underline">
                Edit
              </button>
              <button onClick={() => setConfirming(true)} className="py-1 text-slate-600 hover:text-red-700 hover:underline">
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
