import { useCallback, useEffect, useState } from 'react'
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
import EventForm, { type EventValues } from '../components/EventForm'
import Linkify from '../components/Linkify'
import MapView from '../components/MapView'
import Modal from '../components/Modal'
import MonthCalendar from '../components/MonthCalendar'
import { buttonClass, subtleButtonClass } from '../components/ui'

type View = 'list' | 'calendar'

export default function Events() {
  const { profile } = useAuth()
  const canEdit = hasRole(profile?.role, 'officer')

  const [events, setEvents] = useState<EventRow[]>([])
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
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const upcoming = events.filter((e) => !isOver(e, now))
  const past = events.filter((e) => isOver(e, now)).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  const dayEvents = events.filter((e) => dayKey(e.starts_at) === selectedDay)
  const opened = events.find((e) => e.id === openId) ?? null
  const editing = formFor && formFor !== 'new' ? (events.find((e) => e.id === formFor) ?? null) : null

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

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Events</h1>
          <p className="mt-2 text-slate-600">Meetings and activities, with maps and online links.</p>
        </div>
        {canEdit && (
          <button onClick={() => setFormFor('new')} className={subtleButtonClass}>
            Add an event
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div role="group" aria-label="View" className="mt-8 inline-flex rounded-md border border-slate-300 bg-white p-0.5">
        {(['list', 'calendar'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={
              'rounded px-4 py-2 text-sm font-medium transition-colors sm:py-1.5 ' +
              (view === v ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100')
            }
          >
            {v === 'list' ? 'List' : 'Calendar'}
          </button>
        ))}
      </div>

      {loading && <p className="mt-8 text-sm text-slate-500">Loading events…</p>}

      {!loading && view === 'list' && (
        <>
          {upcoming.length === 0 ? (
            <p className="mt-6 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
              {canEdit ? 'No upcoming events. Add the first one above.' : 'No upcoming events yet.'}
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <EventItem event={e} now={now} onOpen={() => setOpenId(e.id)} />
                </li>
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowPast((s) => !s)}
                aria-expanded={showPast}
                className="font-display py-1 text-lg font-semibold"
              >
                Past events ({past.length}) {showPast ? '(hide)' : '(show)'}
              </button>
              {showPast && (
                <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                  {past.slice(0, 30).map((e) => (
                    <li key={e.id}>
                      <EventItem event={e} now={now} onOpen={() => setOpenId(e.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {!loading && view === 'calendar' && (
        <div className="mt-6">
          <MonthCalendar
            events={events}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onOpenEvent={(id) => setOpenId(id)}
          />
          <section className="mt-6" aria-label="Events on the selected day">
            <h2 className="font-display text-lg font-semibold">{formatDay(selectedDay + 'T00:00:00')}</h2>
            {dayEvents.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No events on this day.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
                {dayEvents.map((e) => (
                  <li key={e.id}>
                    <EventItem event={e} now={now} onOpen={() => setOpenId(e.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {opened && !formFor && (
        <Modal label="Event details" onClose={() => setOpenId(null)}>
          <EventDetail
            event={opened}
            now={now}
            canEdit={canEdit}
            onEdit={() => setFormFor(opened.id)}
            onDelete={() => void deleteEvent(opened.id)}
            onClose={() => setOpenId(null)}
          />
        </Modal>
      )}

      {formFor && (formFor === 'new' || editing) && (
        <Modal
          label={formFor === 'new' ? 'New event' : 'Edit event'}
          onClose={() => setFormFor(null)}
          dismissOnBackdrop={false}
        >
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

/* ---------- one row in a list ---------- */
function EventItem({ event, now, onOpen }: { event: EventRow; now: number; onOpen: () => void }) {
  const start = new Date(event.starts_at)
  const over = isOver(event, now)
  const soon = !over && eventState(event.starts_at, now) === 'soon'
  const hasPin = event.latitude != null && event.longitude != null

  return (
    <button
      type="button"
      onClick={onOpen}
      className={'flex w-full items-start gap-4 py-4 text-left transition-colors hover:bg-slate-50 ' + (over ? 'opacity-70' : '')}
    >
      <span className="w-12 shrink-0 text-center">
        <span className="block text-xs font-semibold text-brand-700">
          {start.toLocaleDateString('en-PH', { month: 'short' })}
        </span>
        <span className="font-display block text-2xl leading-none font-semibold">{start.getDate()}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-display block text-lg font-semibold break-words">{event.title}</span>
        <span className="block text-sm text-slate-600">
          {formatTime(event.starts_at)}
          {event.ends_at && ` to ${formatTime(event.ends_at)}`}
        </span>
        {event.location_name && <span className="block text-sm break-words text-slate-500">{event.location_name}</span>}
        {(soon || event.meeting_link || hasPin) && (
          <span className="mt-1.5 flex flex-wrap gap-2">
            {soon && (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">
                Starts {timeUntil(event.starts_at, now)}
              </span>
            )}
            {event.meeting_link && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-900">Online link</span>
            )}
            {hasPin && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">On the map</span>
            )}
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
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold break-words">{event.title}</h2>
        <button onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          Close
        </button>
      </div>

      <p className="mt-2 text-sm">{formatRange(event.starts_at, event.ends_at)}</p>
      {soon && (
        <p className="mt-2 inline-block rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">
          Starts {timeUntil(event.starts_at, now)}
        </p>
      )}
      {over && <p className="mt-2 text-xs text-slate-500">This event has already happened.</p>}

      {event.meeting_link && (
        <a
          href={event.meeting_link}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass + ' mt-5 sm:w-auto'}
        >
          Join online meeting ({linkHost(event.meeting_link)})
        </a>
      )}

      {(event.location_name || hasPin) && (
        <div className="mt-5">
          <p className="text-sm text-slate-500">Where</p>
          {event.location_name && <p className="break-words">{event.location_name}</p>}

          {hasPin && (
            <>
              <MapView
                lat={event.latitude}
                lng={event.longitude}
                className="mt-3 h-56 w-full rounded-lg border border-slate-200"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={googleDirections(event.latitude!, event.longitude!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={subtleButtonClass}
                >
                  Directions in Google Maps
                </a>
                <a
                  href={wazeDirections(event.latitude!, event.longitude!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={subtleButtonClass}
                >
                  Directions in Waze
                </a>
              </div>
            </>
          )}

          {!hasPin && event.location_name && (
            <a
              href={googleDirectionsByName(event.location_name)}
              target="_blank"
              rel="noopener noreferrer"
              className={subtleButtonClass + ' mt-3'}
            >
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
