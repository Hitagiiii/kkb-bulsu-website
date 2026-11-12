import { useMemo, useState } from 'react'
import { dayKey, formatTime, type EventRow } from '../lib/events'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const navButton =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:py-1.5'

export default function MonthCalendar({
  events,
  selectedDay,
  onSelectDay,
  onOpenEvent,
}: {
  events: EventRow[]
  selectedDay: string
  onSelectDay: (key: string) => void
  onOpenEvent: (id: string) => void
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const byDay = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const e of events) {
      const key = dayKey(e.starts_at)
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return map
  }, [events])

  const todayKey = dayKey(new Date())
  const gridStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - cursor.getDay())
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  )

  function move(delta: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">
          {cursor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => move(-1)} aria-label="Previous month" className={navButton}>
            Prev
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date()
              setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
              onSelectDay(dayKey(d))
            }}
            className={navButton}
          >
            Today
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Next month" className={navButton}>
            Next
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 text-center text-xs font-medium text-slate-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-r border-b border-slate-200 bg-white">
        {cells.map((date) => {
          const key = dayKey(date)
          const inMonth = date.getMonth() === cursor.getMonth()
          const dayEvents = byDay.get(key) ?? []
          const isToday = key === todayKey
          const isSelected = key === selectedDay
          return (
            <div
              key={key}
              className={
                'min-h-14 border-t border-l border-slate-200 sm:min-h-24 ' +
                (isSelected ? 'bg-brand-50 ' : '') +
                (inMonth ? '' : 'bg-slate-50 text-slate-400')
              }
            >
              <button
                type="button"
                onClick={() => onSelectDay(key)}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric' })}, ${
                  dayEvents.length === 0 ? 'no events' : `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`
                }`}
                className="block w-full p-1 text-left"
              >
                <span
                  className={
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium sm:text-sm ' +
                    (isToday ? 'bg-brand-700 text-white' : '')
                  }
                >
                  {date.getDate()}
                </span>
              </button>

              {/* phones: dots only. The day's events are listed under the calendar. */}
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 px-1.5 pb-1.5 sm:hidden" aria-hidden="true">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-brand-700" />
                  ))}
                </div>
              )}

              {/* larger screens: titles */}
              <div className="hidden space-y-0.5 px-1 pb-1 sm:block">
                {dayEvents.slice(0, 2).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpenEvent(e.id)}
                    className="block w-full truncate rounded bg-brand-100 px-1.5 py-0.5 text-left text-xs text-brand-900 hover:bg-brand-600 hover:text-white"
                  >
                    {formatTime(e.starts_at)} {e.title}
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay(key)}
                    className="block w-full px-1.5 text-left text-xs text-slate-600 hover:underline"
                  >
                    +{dayEvents.length - 2} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
