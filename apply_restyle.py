#!/usr/bin/env python3
"""
Applies the page-level restyle edits that are not whole-file replacements.

Usage (from the repo root, after copying the replacement files over):
    python apply_restyle.py            # patches ./src
    python apply_restyle.py path/to/repo

Each file is patched all-or-nothing. If any expected text is missing (because the
file changed since this script was written), that file is left untouched and listed
at the end, so nothing is half-edited.
"""
import pathlib
import sys

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
failures = []


def patch(rel, ops):
    p = ROOT / rel
    if not p.exists():
        failures.append(f'{rel}: file not found')
        return
    s = p.read_text(encoding='utf-8')
    try:
        for op in ops:
            s = op(s)
    except AssertionError as e:
        failures.append(f'{rel}: {e}')
        return
    p.write_text(s, encoding='utf-8')
    print('patched', rel)


def sub(old, new, count=1):
    def f(s):
        n = s.count(old)
        assert n == count, f'expected {count} match(es), found {n} for {old[:80]!r}'
        return s.replace(old, new)
    return f


def sub_any(old, new):
    def f(s):
        assert old in s, f'no match for {old[:80]!r}'
        return s.replace(old, new)
    return f


def between(start, end, new):
    """Replace from `start` up to (not including) `end`. `start` itself is replaced."""
    def f(s):
        assert s.count(start) == 1, f'start marker found {s.count(start)}x: {start[:80]!r}'
        i = s.index(start)
        j = s.find(end, i + len(start))
        assert j != -1, f'end marker not found after start: {end[:80]!r}'
        return s[:i] + new + s[j:]
    return f


def tail(start, new):
    def f(s):
        assert s.count(start) == 1, f'marker found {s.count(start)}x: {start[:80]!r}'
        return s[: s.index(start)] + new
    return f


NOTICE_PLAIN = "className={noticeClass + ' mt-4 block hover:bg-secondary'}"

# ---------------------------------------------------------------- Icons (ProductArt)
patch('src/components/Icons.tsx', [
    tail('const TILE: Record<string, string> = {', r'''/** A flat tile with a large icon, used where a product photo would go. */
export function ProductArt({
  category,
  className = 'aspect-[4/3] w-full',
}: {
  category: string
  className?: string
}) {
  const key = artKey(category)
  return (
    <div className={`flex items-center justify-center bg-secondary text-brand-700 ${className}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-[45%] w-[45%]"
      >
        {ART[key]}
      </svg>
    </div>
  )
}
'''),
])

# ---------------------------------------------------------------- AuthShell
patch('src/components/AuthShell.tsx', [
    sub('<div className="hidden bg-brand-900 p-12 text-white md:flex md:flex-col md:justify-between">',
        '<div className="hidden bg-card p-12 text-ink md:flex md:flex-col md:justify-between">'),
    sub('<div className="font-display text-2xl font-bold tracking-tight">KKB BULSU</div>',
        '<div className="font-display text-2xl font-bold tracking-tight text-brand-700">KKB BULSU</div>'),
    sub('<p className="text-sm text-white/60">Members only.', '<p className="text-sm text-mute">Members only.'),
])

# ---------------------------------------------------------------- Modal
patch('src/components/Modal.tsx', [
    sub('bg-black/40 sm:items-center sm:p-6', 'bg-black/50 sm:items-center sm:p-6'),
    sub('rounded-t-2xl bg-white p-5 pb-8 shadow-xl outline-none sm:max-w-xl sm:rounded-2xl sm:pb-5',
        'rounded-t-3xl bg-white p-5 pb-8 shadow-xl outline-none sm:max-w-xl sm:rounded-3xl sm:pb-5'),
])

# ---------------------------------------------------------------- Dashboard + extras (plain notices)
patch('src/pages/Dashboard.tsx', [
    sub("import DashboardExtras from '../components/DashboardExtras'",
        "import DashboardExtras from '../components/DashboardExtras'\nimport { noticeClass } from '../components/ui'"),
    sub('className="mt-8 block rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 hover:bg-amber-100"',
        "className={noticeClass + ' mt-8 block hover:bg-secondary'}"),
])

patch('src/components/DashboardExtras.tsx', [
    sub("import { formatDate, peso, todayISO } from '../lib/finance'",
        "import { formatDate, peso, todayISO } from '../lib/finance'\nimport { noticeClass } from './ui'"),
    sub('className="mt-4 block rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 hover:bg-amber-100"',
        NOTICE_PLAIN, count=2),
])

# ---------------------------------------------------------------- Events (image-first)
patch('src/pages/Events.tsx', [
    sub("import { CalendarIcon, ChevronRightIcon, ClockIcon, MapPinIcon, VideoIcon } from '../components/Icons'",
        "import { CalendarIcon, ClockIcon, MapPinIcon, VideoIcon } from '../components/Icons'"),
    sub('const card = (e: EventRow, i = 0) => (', 'const card = (e: EventRow) => ('),
    sub('<li key={e.id} className="animate-fade-up motion-reduce:animate-none" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>',
        '<li key={e.id}>'),
    sub('className="mt-8 inline-flex rounded-full border border-slate-300 bg-white p-1 shadow-sm"',
        'className="mt-8 inline-flex rounded-full bg-card p-1"'),
    sub("(view === v ? 'bg-brand-700 text-white shadow' : 'text-slate-700 hover:bg-slate-100')",
        "(view === v ? 'bg-ink text-white' : 'text-ink hover:bg-secondary')"),
    sub('<ul className="mt-3 space-y-3">{g.items.map((e, i) => card(e, i))}</ul>',
        '<ul className="mt-3 grid gap-4 sm:grid-cols-2">{g.items.map((e) => card(e))}</ul>'),
    sub('{showPast && <ul className="mt-3 space-y-3">{past.slice(0, 30).map((e, i) => card(e, i))}</ul>}',
        '{showPast && <ul className="mt-3 grid gap-4 sm:grid-cols-2">{past.slice(0, 30).map((e) => card(e))}</ul>}'),
    sub('<ul className="mt-3 space-y-3">{dayEvents.map((e, i) => card(e, i))}</ul>',
        '<ul className="mt-3 grid gap-4 sm:grid-cols-2">{dayEvents.map((e) => card(e))}</ul>'),

    between('/* ---------- date block ---------- */', 'function Meta(', r'''/* ---------- cover tile: the "image" of an event card ---------- */
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

'''),

    between('/* ---------- the next event, shown big ---------- */', '/* ---------- one event in a list ---------- */', r'''/* ---------- the next event, shown big ---------- */
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

'''),

    between('/* ---------- one event in a list ---------- */', '/* ---------- full details in a dialog ---------- */', r'''/* ---------- one event in a list ---------- */
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

'''),

    between('<div className="relative -mx-5 -mt-5 mb-5',
            '<a href={event.meeting_link} target="_blank" rel="noopener noreferrer" className={buttonClass',
            r'''<div className="relative -mx-5 -mt-5 mb-5">
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
        '''),
])

# ---------------------------------------------------------------- Announcements (image-first)
patch('src/pages/Announcements.tsx', [
    sub('<span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">',
        '<span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-ink">'),
    sub('<ul className="mt-8 divide-y divide-slate-200 border-y border-slate-200">',
        '<ul className="mt-8 space-y-6">'),
    sub("<li key={a.id} className={'py-6 ' + (a.pinned ? 'border-l-4 border-l-brand-700 pl-4' : '')}>",
        "<li key={a.id} className={'overflow-hidden rounded-md border border-hairline bg-white ' + (editingId === a.id ? 'p-4 sm:p-5' : '')}>"),
    between('<article>', '</article>', r'''<article>
                <Photos paths={a.image_paths ?? []} urls={urls} />
                <div className="p-4 sm:p-5">
                  {a.pinned && (
                    <span className="mb-2 inline-block rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-900">
                      Pinned
                    </span>
                  )}
                  <h2 className="font-display text-xl font-bold break-words">{a.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Posted {formatDateTime(a.created_at)} by {a.author_name || 'an officer'}
                    {a.updated_at && ' (edited)'}
                  </p>

                  {a.event_at && <EventLine iso={a.event_at} now={now} />}

                  <p className="mt-4 whitespace-pre-wrap break-words">
                    <Linkify text={a.body} />
                  </p>

                  {canPost && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {deletingId === a.id ? (
                        <>
                          <span className="text-slate-700">Delete this announcement for good?</span>
                          <button onClick={() => void remove(a)} className="py-1 font-semibold text-error hover:underline">
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
                          <button onClick={() => setDeletingId(a.id)} className="py-1 text-slate-600 hover:text-error hover:underline">
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              '''),
    between('/* ---------- photos on a posted announcement ---------- */',
            '/* ---------- preview of a photo picked but not yet uploaded ---------- */',
            r'''/* ---------- photos on a posted announcement (full-bleed, first in the card) ---------- */
function Photos({ paths, urls }: { paths: string[]; urls: Record<string, string> }) {
  if (paths.length === 0) return null
  const single = paths.length === 1
  return (
    <div className={'grid gap-0.5 bg-card ' + (single ? '' : paths.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
      {paths.map((p) =>
        urls[p] ? (
          <a key={p} href={urls[p]} target="_blank" rel="noreferrer" title="Open full size">
            <img
              src={urls[p]}
              alt="Photo attached to the announcement"
              loading="lazy"
              className={'w-full bg-secondary object-cover ' + (single ? 'max-h-[28rem]' : 'aspect-square')}
            />
          </a>
        ) : (
          <div key={p} className="aspect-square animate-pulse bg-secondary" />
        ),
      )}
    </div>
  )
}

'''),
])

# ---------------------------------------------------------------- Merch (image-first)
patch('src/pages/Merch.tsx', [
    sub('{available.map((item, i) => (', '{available.map((item) => ('),
    sub('<li key={item.id} className="animate-fade-up motion-reduce:animate-none" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>',
        '<li key={item.id}>'),
    sub('className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none"',
        'className="overflow-hidden rounded-md border border-hairline bg-white"'),
    sub('<ProductArt category={item.category} />', '<ProductArt category={item.category} className="aspect-[4/3] w-full" />'),
    sub('<span className="font-display absolute top-3 right-3 rounded-full bg-white px-3 py-1 text-lg font-semibold text-brand-900 shadow">',
        '<span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-ink">'),
    sub('<span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white backdrop-blur">',
        '<span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink">'),
    sub('peer-checked:border-brand-700 peer-checked:bg-brand-700 peer-checked:text-white',
        'peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white'),
    sub('peer-checked:hover:bg-brand-700', 'peer-checked:hover:bg-ink'),
    sub("? 'border-brand-700 bg-brand-700 text-white'", "? 'border-ink bg-ink text-white'"),
    sub('<p className="mt-1.5 text-sm font-medium text-amber-800">Balance', '<p className="mt-1.5 text-sm font-medium text-brand-700">Balance'),
])

# ---------------------------------------------------------------- Merch manage + order rows
patch('src/pages/MerchManage.tsx', [
    sub("import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'",
        "import { buttonClass, inputClass, noticeClass, subtleButtonClass } from '../components/ui'"),
    sub('className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"',
        "className={noticeClass + ' mt-6'}"),
])

patch('src/components/OrderRow.tsx', [
    sub("(p.status === 'pending' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50')",
        "(p.status === 'pending' ? 'border-ink bg-white' : 'border-hairline bg-card')"),
])

# ---------------------------------------------------------------- GCash card (flat, no gradient or circle)
patch('src/components/PaymentInfoCard.tsx', [
    sub("'relative overflow-hidden rounded-2xl p-5 shadow-sm sm:p-6 ' +", "'rounded-md p-5 sm:p-6 ' +"),
    sub("(dark ? 'bg-linear-to-br from-brand-900 via-brand-800 to-brand-700 text-white' : 'border border-slate-200 bg-white')",
        "(dark ? 'bg-card text-ink' : 'border border-hairline bg-white')"),
    sub('{dark && <span aria-hidden="true" className="absolute -top-14 -right-10 h-44 w-44 rounded-full bg-white/10" />}', ''),
    sub("const lightBtn = 'rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/25'",
        "const lightBtn = 'rounded-md bg-secondary px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-secondary-pressed'"),
    sub("className={'text-xs font-semibold tracking-wide uppercase ' + (dark ? 'text-gold-400' : 'text-brand-700')}",
        'className="text-xs font-semibold tracking-wide text-brand-700 uppercase"'),
    sub('font-display text-3xl font-semibold tracking-wide text-gold-400', 'font-display text-3xl font-bold tracking-wide text-brand-700'),
    sub('<p className="mt-1 text-sm text-white/80">Account name:', '<p className="mt-1 text-sm text-slate-600">Account name:'),
    sub('whitespace-pre-wrap text-white/85', 'whitespace-pre-wrap text-slate-700'),
    sub('<p className="relative mt-3 text-sm text-white/75">', '<p className="relative mt-3 text-sm text-slate-600">'),
    sub('justify-self-start rounded-xl bg-white p-2 shadow', 'justify-self-start rounded-md border border-hairline bg-white p-2'),
])

# ---------------------------------------------------------------- Budget detail (flat, dense)
patch('src/pages/BudgetDetail.tsx', [
    sub("const CAT_COLORS = ['bg-brand-800', 'bg-gold-400', 'bg-brand-600', 'bg-slate-500', 'bg-amber-600', 'bg-rose-400', 'bg-slate-300']",
        "const CAT_COLORS = ['bg-brand-800', 'bg-ink', 'bg-brand-600', 'bg-slate-500', 'bg-brand-100', 'bg-slate-400', 'bg-slate-300']"),
    sub("import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'",
        "import { buttonClass, inputClass, noticeClass, subtleButtonClass } from '../components/ui'"),
    between('<section aria-label="Budget summary" className="mt-6">', '<BudgetFolderPicker budgetId={budget.id} />', r'''<section aria-label="Budget summary" className="mt-5">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-4">
            <div className="bg-white p-3">
              <dt className="text-xs text-slate-500">{over ? 'Over budget by' : 'Money left'}</dt>
              <dd className={'font-display mt-0.5 text-2xl font-bold tabular-nums break-words ' + (over ? 'text-error' : 'text-ink')}>
                {peso(Math.abs(left))}
              </dd>
            </div>
            <div className="bg-white p-3">
              <dt className="text-xs text-slate-500">Total budget</dt>
              <dd className="font-display mt-0.5 text-2xl font-semibold tabular-nums break-words">{peso(budget.total_budget)}</dd>
              {canEdit && <ChangeTotal budget={budget} onChanged={load} />}
            </div>
            <div className="bg-white p-3">
              <dt className="text-xs text-slate-500">Spent</dt>
              <dd className="font-display mt-0.5 text-2xl font-semibold tabular-nums break-words">{peso(spent)}</dd>
            </div>
            <div className="bg-white p-3">
              <dt className="text-xs text-slate-500">Receipts missing</dt>
              <dd className={'font-display mt-0.5 text-2xl font-semibold ' + (missingCount > 0 ? 'text-brand-700' : 'text-ink')}>
                {missingCount}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
              <div className={'h-full rounded-full ' + (over ? 'bg-error' : 'bg-brand-700')} style={{ width: `${pct}%` }} />
            </div>
            <p className="shrink-0 text-xs text-slate-500 tabular-nums">{Math.round(pct)}% used</p>
          </div>

          {categories.length > 0 && spentCents > 0 && (
            <div className="mt-4 border-t border-hairline pt-3">
              <h3 className="text-sm font-semibold">Where the money went</h3>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label="Spending by category">
                {categories.map(([cat, cents], i) => (
                  <span
                    key={cat}
                    className={CAT_COLORS[Math.min(i, CAT_COLORS.length - 1)]}
                    style={{ width: `${(cents / spentCents) * 100}%` }}
                    title={`${cat}: ${peso(cents / 100)}`}
                  />
                ))}
              </div>
              <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {categories.map(([cat, cents], i) => (
                  <li key={cat} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={'h-2.5 w-2.5 shrink-0 rounded-full ' + CAT_COLORS[Math.min(i, CAT_COLORS.length - 1)]} />
                      <span className="truncate">{cat}</span>
                    </span>
                    <span className="tabular-nums text-slate-600">{peso(cents / 100)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        '''),
    sub('className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"',
        "className={noticeClass + ' mt-4 flex flex-wrap items-center justify-between gap-2'}"),
    sub('border-amber-500 bg-amber-50', 'border-ash bg-card', count=3),
    sub('text-amber-900', 'text-slate-700', count=3),
    sub('leading-tight font-semibold text-amber-800', 'leading-tight font-semibold text-slate-600'),
])

# ---------------------------------------------------------------- Dense pages: tighter rows
patch('src/pages/Members.tsx', [
    sub('className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"',
        'className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"', count=2),
])
patch('src/pages/Tasks.tsx', [
    sub('<li key={t.id} className="py-4">', '<li key={t.id} className="py-3">'),
])

# ---------------------------------------------------------------- QR poster: same font and brand color
patch('src/lib/qrPoster.ts', [
    sub_any('Figtree, Arial, sans-serif', 'Inter, Arial, sans-serif'),
    sub("ctx.fillStyle = '#4e0f1b'", "ctx.fillStyle = '#8a1c2e'"),
])

print()
if failures:
    print('NOT patched (file left unchanged):')
    for f in failures:
        print('  -', f)
    sys.exit(1)
print('All patches applied.')
