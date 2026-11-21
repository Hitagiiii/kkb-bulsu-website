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
import EventExtras from '../components/EventExtras'
import EventForm, { type EventValues } from '../components/EventForm'
import { CalendarIcon, ClockIcon, MapPinIcon } from '../components/Icons'
import Linkify from '../components/Linkify'
import MapView from '../components/MapView'
import Modal from '../components/Modal'
import MonthCalendar from '../components/MonthCalendar'
import { buttonClass, eyebrowClass, subtleButtonClass } from '../components/ui'
import PageHeader from '../components/PageHeader'

type View = 'list' | 'calendar' | 'rsvps'
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDetailId, setMobileDetailId] = useState<string | null>(null)
  const [formFor, setFormFor] = useState<'new' | string | null>(null)
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()))
  const [showPast, setShowPast] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

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

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const onChange = () => setIsDesktop(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const upcoming = events.filter((e) => !isOver(e, now))
  const past = events.filter((e) => isOver(e, now)).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  const next = upcoming[0] ?? null
  const rest = upcoming.slice(1)
  const dayEvents = events.filter((e) => dayKey(e.starts_at) === selectedDay)
  const selected = events.find((e) => e.id === selectedId) ?? null
  const mobileOpened = events.find((e) => e.id === mobileDetailId) ?? null
  const editing = formFor && formFor !== 'new' ? (events.find((e) => e.id === formFor) ?? null) : null

  const groups: { key: string; items: EventRow[] }[] = []
  for (const e of rest) {
    const key = dayKey(e.starts_at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(e)
    else groups.push({ key, items: [e] })
  }

  function selectEvent(id: string) {
    setSelectedId(id)
    setMobileDetailId(id)
  }

  function closeMobileDetail() {
    setMobileDetailId(null)
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
    setSelectedId(null)
    setMobileDetailId(null)
    await load()
  }

  const card = (e: EventRow) => (
    <li key={e.id}>
      <EventCard
        event={e}
        now={now}
        rsvp={rsvps[e.id]}
        attended={attended.has(e.id)}
        selected={selectedId === e.id}
        onOpen={() => selectEvent(e.id)}
      />
    </li>
  )

  return (
    <div className="w-full">
      <PageHeader
        eyebrow="Show up. Belong."
        title="Good things ahead."
        subtitle="Gatherings, service and everything in between."
        action={
          canEdit ? (
            <button type="button" onClick={() => setFormFor('new')} className={buttonClass + ' min-h-11 sm:w-auto'}>
              Add an event
            </button>
          ) : undefined
        }
      />

      {error && (
        <p role="alert" className="mt-6 border-l-4 border-brand-700 bg-soft px-3 py-3 text-sm text-brand-700">
          {error}
        </p>
      )}

      <div className="mt-6 grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0">
          <div role="group" aria-label="View" className="flex gap-5 border-b border-line text-sm">
            {(['list', 'calendar', 'rsvps'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={
                  '-mb-px min-h-11 border-b-2 transition-colors ' +
                  (view === v ? 'border-brand-700 font-semibold text-brand-700' : 'border-transparent text-muted hover:text-ink')
                }
              >
                {v === 'list' ? 'List' : v === 'calendar' ? 'Month' : 'My RSVPs'}
              </button>
            ))}
          </div>

          {loading && (
            <div className="mt-6 space-y-3" aria-label="Loading events">
              {[0, 1, 2].map((n) => (
                <div key={n} className="h-20 border border-line bg-card" />
              ))}
            </div>
          )}

          {!loading && view === 'list' && (
            <>
              {next ? (
                <NextUp
                  event={next}
                  now={now}
                  rsvp={rsvps[next.id]}
                  selected={selectedId === next.id}
                  onOpen={() => selectEvent(next.id)}
                />
              ) : (
                <div className="mt-6 rounded-md border border-dashed border-line bg-white px-6 py-10 text-center">
                  <CalendarIcon size={36} className="mx-auto text-brand-700" />
                  <p className="mt-3 text-xl font-medium">Nothing coming up</p>
                  <p className="mt-1 text-sm text-muted">
                    {canEdit ? 'Add the first event and members will see it here.' : 'New events will show up here.'}
                  </p>
                </div>
              )}

              {groups.map((g) => (
                <section key={g.key} className="mt-8" aria-label={dayLabel(g.key, now)}>
                  <h2 className={eyebrowClass + ' !text-muted'}>{dayLabel(g.key, now)}</h2>
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                    {g.items.map((e) => card(e))}
                  </ul>
                </section>
              ))}

              {past.length > 0 && (
                <section className="mt-8 border-t border-line pt-5">
                  <button
                    type="button"
                    onClick={() => setShowPast((s) => !s)}
                    aria-expanded={showPast}
                    className="flex min-h-11 w-full items-center justify-between gap-4 text-left"
                  >
                    <span className="text-lg font-medium">Past events ({past.length})</span>
                    <span className="text-sm font-medium text-muted">{showPast ? 'Hide' : 'Show'}</span>
                  </button>
                  {showPast && (
                    <ul className="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                      {past.slice(0, 30).map((e) => card(e))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}

          {!loading && view === 'rsvps' && (
            <section className="mt-6" aria-label="Events I said I am going to">
              {(() => {
                const mine = upcoming.filter((e) => rsvps[e.id] === 'going')
                return mine.length === 0 ? (
                  <div className="rounded-md border border-dashed border-line bg-white px-6 py-10 text-center">
                    <p className="text-xl font-medium">No RSVPs yet</p>
                    <p className="mt-1 text-sm text-muted">Open an event and press “I’m going” to save your seat.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">{mine.map((e) => card(e))}</ul>
                )
              })()}
            </section>
          )}

          {!loading && view === 'calendar' && (
            <div className="mt-6">
              <MonthCalendar
                events={events}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                onOpenEvent={selectEvent}
              />
              <section className="mt-6" aria-label="Events on the selected day">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-lg font-medium">{formatDay(selectedDay + 'T00:00:00')}</h2>
                  <span className="text-sm text-muted">{dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}</span>
                </div>
                {dayEvents.length === 0 ? (
                  <p className="mt-2 rounded-md border border-dashed border-line bg-white px-4 py-5 text-sm text-muted">
                    No events on this day.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                    {dayEvents.map((e) => card(e))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </main>

        {isDesktop && (
          <aside className="md:sticky md:top-6" aria-label="Event details">
            {selected ? (
              <EventDetail
                event={selected}
                now={now}
                canEdit={canEdit}
                onEdit={() => setFormFor(selected.id)}
                onDelete={() => void deleteEvent(selected.id)}
              />
            ) : (
              <div className="rounded-md border border-line bg-white p-5">
                <p className="text-lg font-medium">Event details</p>
                <p className="mt-2 text-sm text-muted">Select an event to see its time, place, links, RSVP and attendance information.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {!isDesktop && mobileOpened && !formFor && (
        <Modal label="Event details" onClose={closeMobileDetail}>
          <EventDetail
            event={mobileOpened}
            now={now}
            canEdit={canEdit}
            onEdit={() => setFormFor(mobileOpened.id)}
            onDelete={() => void deleteEvent(mobileOpened.id)}
            onClose={closeMobileDetail}
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

/* ---------- flat event placeholder ---------- */
function EventCover({ iso, label }: { iso: string; label?: string }) {
  const d = new Date(iso)
  return (
    <div className="flex min-w-20 flex-col justify-center bg-soft px-3 py-3 sm:min-w-24 sm:px-4">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-700 uppercase">
        {d.toLocaleDateString('en-PH', { month: 'short' })}
      </p>
      <p className="text-3xl leading-none font-medium text-ink">{d.getDate()}</p>
      {label && <p className="mt-1.5 text-[11px] font-medium text-muted">{label}</p>}
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

/* ---------- compact next-up row ---------- */
function NextUp({
  event,
  now,
  rsvp,
  selected,
  onOpen,
}: {
  event: EventRow
  now: number
  rsvp?: Rsvp
  selected: boolean
  onOpen: () => void
}) {
  const live = new Date(event.starts_at).getTime() <= now
  return (
    <section aria-label="Next event" className="mt-6 overflow-hidden rounded-md border border-line bg-white">
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        className="flex min-h-20 w-full items-stretch text-left hover:bg-paper"
      >
        <EventCover iso={event.starts_at} label={live ? 'Now' : `Next · ${timeUntil(event.starts_at, now)}`} />
        <span className="min-w-0 flex-1 p-3 sm:p-4">
          <span className={eyebrowClass + ' block'}>Next up</span>
          <span className="mt-0.5 block break-words text-base font-semibold sm:text-lg">{event.title}</span>
          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-umber sm:text-sm">
            <span>{formatRange(event.starts_at, event.ends_at)}</span>
            {event.location_name && <span>{event.location_name}</span>}
            {event.meeting_link && <span>Online</span>}
          </span>
        </span>
      </button>
      {rsvp === 'going' && <p className="border-t border-line px-3 py-2 text-xs font-semibold text-brand-700 sm:px-4">You are going</p>}
    </section>
  )
}

/* ---------- one event in a list ---------- */
function EventCard({
  event,
  now,
  rsvp,
  attended,
  selected,
  onOpen,
}: {
  event: EventRow
  now: number
  rsvp?: Rsvp
  attended: boolean
  selected: boolean
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
      aria-pressed={selected}
      className={
        'flex min-h-20 w-full items-stretch text-left hover:bg-paper ' +
        (over ? 'opacity-70 ' : '') +
        (selected ? 'bg-paper' : 'bg-white')
      }
    >
      <EventCover iso={event.starts_at} label={timeLabel} />
      <span className="min-w-0 flex-1 p-3 sm:p-4">
        <span className="block break-words text-base font-semibold">{event.title}</span>
        {event.location_name && (
          <span className="mt-1 block text-sm text-umber">
            <Meta icon={<MapPinIcon size={15} />}>{event.location_name}</Meta>
          </span>
        )}
        {(soon || attended || rsvp || event.meeting_link || hasPin) && (
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-umber">
            {soon && <span className="text-brand-700">Starts {timeUntil(event.starts_at, now)}</span>}
            {attended && <span>Checked in</span>}
            {!attended && rsvp === 'going' && <span className="text-brand-700">You are going</span>}
            {!attended && rsvp === 'not_going' && <span>Not going</span>}
            {event.meeting_link && <span>Online</span>}
            {hasPin && <span>On the map</span>}
          </span>
        )}
      </span>
    </button>
  )
}

/* ---------- event details: persistent pane on desktop, sheet/modal on mobile ---------- */
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
  onClose?: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const hasPin = event.latitude != null && event.longitude != null
  const over = isOver(event, now)
  const soon = !over && eventState(event.starts_at, now) === 'soon'

  return (
    <div className="rounded-md border border-line bg-white p-4 sm:p-5">
      {onClose && (
        <div className="mb-4 flex justify-end md:hidden">
          <button type="button" onClick={onClose} className={subtleButtonClass + ' min-h-11'}>
            Close
          </button>
        </div>
      )}

      <div className="border-b border-line pb-4">
        <p className={eyebrowClass}>
          {soon ? `Starts ${timeUntil(event.starts_at, now)}` : over ? 'Already happened' : 'Event details'}
        </p>
        <h2 className="mt-1 text-2xl leading-tight font-medium break-words">{event.title}</h2>
        <div className="mt-3 space-y-2 text-ink">
          <Meta icon={<ClockIcon size={16} />}>{formatRange(event.starts_at, event.ends_at)}</Meta>
          {event.location_name && <Meta icon={<MapPinIcon size={16} />}>{event.location_name}</Meta>}
        </div>
      </div>

      {event.meeting_link && (
        <div className="mt-4">
          <a href={event.meeting_link} target="_blank" rel="noopener noreferrer" className={buttonClass + ' min-h-11 sm:w-auto'}>
            Join online meeting ({linkHost(event.meeting_link)})
          </a>
        </div>
      )}

      {(event.location_name || hasPin) && (
        <div className="mt-5">
          {hasPin && (
            <>
              <MapView lat={event.latitude} lng={event.longitude} className="h-52 w-full border border-line" />
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={googleDirections(event.latitude!, event.longitude!)} target="_blank" rel="noopener noreferrer" className={subtleButtonClass + ' min-h-11'}>
                  Directions in Google Maps
                </a>
                <a href={wazeDirections(event.latitude!, event.longitude!)} target="_blank" rel="noopener noreferrer" className={subtleButtonClass + ' min-h-11'}>
                  Directions in Waze
                </a>
              </div>
            </>
          )}
          {!hasPin && event.location_name && (
            <a href={googleDirectionsByName(event.location_name)} target="_blank" rel="noopener noreferrer" className={subtleButtonClass + ' min-h-11'}>
              Find it in Google Maps
            </a>
          )}
        </div>
      )}

      {event.description && (
        <p className="mt-5 break-words whitespace-pre-wrap text-sm leading-6">
          <Linkify text={event.description} />
        </p>
      )}

      <EventExtras event={event} canEdit={canEdit} over={over} />

      {canEdit && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
          {confirming ? (
            <>
              <span className="text-ink">Delete this event for good?</span>
              <button type="button" onClick={onDelete} className="min-h-11 px-2 font-semibold text-brand-700 hover:underline">
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="min-h-11 px-2 text-umber hover:underline">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onEdit} className="min-h-11 px-2 font-medium text-brand-700 hover:underline">
                Edit
              </button>
              <button type="button" onClick={() => setConfirming(true)} className="min-h-11 px-2 text-umber hover:text-brand-700 hover:underline">
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
