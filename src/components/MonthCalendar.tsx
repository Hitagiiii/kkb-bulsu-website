import { useMemo, useState } from 'react'
import { dayKey, formatTime, type EventRow } from '../lib/events'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const navButton =
  'min-h-11 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-paper sm:min-h-10'

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
    <div className="overflow-hidden rounded-md border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-3 sm:px-4">
        <h2 className="text-lg font-medium sm:text-xl">
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

      <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-xs font-semibold text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
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
                'min-h-14 border-b border-r border-line sm:min-h-24 ' +
                (isSelected ? 'bg-soft ' : '') +
                (inMonth ? '' : 'bg-paper text-umber')
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
                className={
                  'flex min-h-11 w-full items-center gap-1 px-2 py-2 text-left text-sm font-semibold ' +
                  (isToday ? 'text-brand-700' : 'text-ink')
                }
              >
                <span className={isToday ? 'border-b-2 border-brand-700' : ''}>{date.getDate()}</span>
                {dayEvents.length > 0 && (
                  <span className="text-xs font-medium text-muted">({dayEvents.length})</span>
                )}
              </button>

              <div className="hidden space-y-1 px-1 pb-1 sm:block">
                {dayEvents.slice(0, 2).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpenEvent(e.id)}
                    className="flex min-h-11 w-full items-center truncate rounded-md border border-line bg-white px-2 text-left text-xs font-medium text-ink hover:bg-soft"
                  >
                    <span className="truncate">{formatTime(e.starts_at)} {e.title}</span>
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay(key)}
                    className="min-h-11 w-full px-2 text-left text-xs font-semibold text-brand-700 hover:underline"
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
