import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { hasRole } from '../lib/types'
import { errorMessage } from '../lib/finance'
import { formatDateTime, timeUntil } from '../lib/announcements'
import { isClosed, MAX_OPTIONS, MIN_OPTIONS, type Poll, type PollOption } from '../lib/polls'
import { buttonClass, inputClass, subtleButtonClass } from '../components/ui'

function friendly(err: unknown, fallback: string): string {
  const message = errorMessage(err, fallback)
  return message.includes('row-level security')
    ? 'Voting is closed for this poll, or your account is not allowed to vote.'
    : message
}

export default function Polls() {
  const { profile } = useAuth()
  const canManage = hasRole(profile?.role, 'officer')

  const [polls, setPolls] = useState<Poll[]>([])
  const [options, setOptions] = useState<Record<string, PollOption[]>>({})
  const [myVotes, setMyVotes] = useState<Record<string, string>>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    const { data: pollRows, error: pollError } = await supabase
      .from('polls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (pollError) {
      setError(pollError.message)
      setLoading(false)
      return
    }
    const list = (pollRows ?? []) as Poll[]
    setPolls(list)

    if (list.length === 0) {
      setOptions({})
      setMyVotes({})
      setCounts({})
      setError(null)
      setLoading(false)
      return
    }

    const ids = list.map((p) => p.id)
    const [o, v, r] = await Promise.all([
      supabase.from('poll_options').select('*').in('poll_id', ids).order('position'),
      supabase.from('poll_votes').select('poll_id, option_id').in('poll_id', ids),
      supabase.rpc('get_poll_results'),
    ])
    const firstError = o.error ?? v.error ?? r.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const byPoll: Record<string, PollOption[]> = {}
    for (const opt of (o.data ?? []) as PollOption[]) (byPoll[opt.poll_id] ??= []).push(opt)
    setOptions(byPoll)

    const mine: Record<string, string> = {}
    for (const row of (v.data ?? []) as { poll_id: string; option_id: string }[]) mine[row.poll_id] = row.option_id
    setMyVotes(mine)

    const tally: Record<string, number> = {}
    for (const row of (r.data ?? []) as { option_id: string; votes: number | string }[]) {
      tally[row.option_id] = Number(row.votes)
    }
    setCounts(tally)

    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel('polls-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_options' }, () => void load())
      .subscribe()
    // Votes are private, so other people's votes are not pushed live. Refresh the totals now and then.
    const timer = window.setInterval(() => void load(), 15_000)
    return () => {
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  async function createPoll(question: string, labels: string[], closesAt: string | null): Promise<string | null> {
    const { error } = await supabase.rpc('create_poll', {
      p_question: question,
      p_options: labels,
      p_closes_at: closesAt,
    })
    if (error) return errorMessage(error, 'Could not create the poll.')
    setCreating(false)
    await load()
    return null
  }

  async function vote(poll: Poll, optionId: string): Promise<string | null> {
    if (!profile) return 'You need to be signed in to vote.'
    const { error } = myVotes[poll.id]
      ? await supabase.from('poll_votes').update({ option_id: optionId }).eq('poll_id', poll.id).eq('user_id', profile.id)
      : await supabase.from('poll_votes').insert({ poll_id: poll.id, option_id: optionId })
    if (error) return friendly(error, 'Could not record your vote.')
    await load()
    return null
  }

  async function closeNow(poll: Poll) {
    const { error } = await supabase.from('polls').update({ closes_at: new Date().toISOString() }).eq('id', poll.id)
    if (error) setError(errorMessage(error, 'Could not close the poll.'))
    else await load()
  }

  async function remove(poll: Poll) {
    const { error } = await supabase.from('polls').delete().eq('id', poll.id)
    if (error) setError(errorMessage(error, 'Could not delete the poll.'))
    else await load()
  }

  const open = polls.filter((p) => !isClosed(p, now))
  const closed = polls.filter((p) => isClosed(p, now))

  function renderList(list: Poll[]) {
    return (
      <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
        {list.map((p) => (
          <li key={p.id} className="py-6">
            <PollCard
              poll={p}
              options={options[p.id] ?? []}
              myVote={myVotes[p.id] ?? null}
              counts={counts}
              now={now}
              canManage={canManage}
              onVote={(optionId) => vote(p, optionId)}
              onClose={() => closeNow(p)}
              onDelete={() => remove(p)}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Polls</h1>
          <p className="mt-2 text-slate-600">Vote on organization decisions. Votes are anonymous.</p>
        </div>
        {canManage && !creating && (
          <button onClick={() => setCreating(true)} className={subtleButtonClass}>
            Create a poll
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {canManage && creating && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="font-display text-xl font-semibold">New poll</h2>
          <PollForm onSubmit={createPoll} onCancel={() => setCreating(false)} />
        </div>
      )}

      {loading && <p className="mt-10 text-sm text-slate-500">Loading polls…</p>}

      {!loading && polls.length === 0 && (
        <p className="mt-10 rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
          {canManage ? 'No polls yet. Create the first one above.' : 'No polls yet.'}
        </p>
      )}

      {open.length > 0 && (
        <section className="mt-10" aria-label="Open polls">
          <h2 className="font-display text-xl font-semibold">Open polls ({open.length})</h2>
          {renderList(open)}
        </section>
      )}

      {closed.length > 0 && (
        <section className="mt-10" aria-label="Closed polls">
          <h2 className="font-display text-xl font-semibold">Closed polls ({closed.length})</h2>
          {renderList(closed)}
        </section>
      )}
    </div>
  )
}

/* ---------- one poll ---------- */
function PollCard({
  poll,
  options,
  myVote,
  counts,
  now,
  canManage,
  onVote,
  onClose,
  onDelete,
}: {
  poll: Poll
  options: PollOption[]
  myVote: string | null
  counts: Record<string, number>
  now: number
  canManage: boolean
  onVote: (optionId: string) => Promise<string | null>
  onClose: () => void
  onDelete: () => void
}) {
  const closed = isClosed(poll, now)
  const [choice, setChoice] = useState<string | null>(myVote)
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)

  const total = options.reduce((sum, o) => sum + (counts[o.id] ?? 0), 0)
  const top = Math.max(0, ...options.map((o) => counts[o.id] ?? 0))
  const showResults = closed || (myVote !== null && !changing)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!choice) return setError('Pick an option first.')
    setBusy(true)
    setError(null)
    const message = await onVote(choice)
    setBusy(false)
    if (message) return setError(message)
    setChanging(false)
  }

  return (
    <article>
      <h3 className="font-display text-xl font-semibold break-words">{poll.question}</h3>
      <p className="mt-1 text-sm text-slate-500">
        Posted {formatDateTime(poll.created_at)}.{' '}
        {closed
          ? `Closed ${formatDateTime(poll.closes_at!)}.`
          : poll.closes_at
            ? `Closes ${formatDateTime(poll.closes_at)} (${timeUntil(poll.closes_at, now)}).`
            : 'Open until an officer closes it.'}
      </p>

      {showResults ? (
        <div className="mt-4">
          <ul className="space-y-3">
            {options.map((o) => {
              const n = counts[o.id] ?? 0
              const pct = total > 0 ? Math.round((n / total) * 100) : 0
              const winner = closed && total > 0 && n === top
              return (
                <li key={o.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={'break-words ' + (winner ? 'font-semibold' : '')}>
                      {o.label}
                      {myVote === o.id && <span className="ml-2 text-xs font-semibold text-brand-700">Your vote</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {n} ({pct}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <div
                      className={'h-full rounded-full ' + (winner || !closed ? 'bg-brand-700' : 'bg-slate-400')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-sm text-slate-500">
            {total} {total === 1 ? 'vote' : 'votes'}
            {closed && myVote === null && ' (you did not vote)'}
          </p>
          {!closed && myVote !== null && (
            <button
              onClick={() => {
                setChoice(myVote)
                setChanging(true)
              }}
              className="mt-2 py-1 text-sm font-medium text-brand-700 hover:underline"
            >
              Change my vote
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4">
          <fieldset>
            <legend className="sr-only">{poll.question}</legend>
            <div className="space-y-2">
              {options.map((o) => (
                <label
                  key={o.id}
                  className={
                    'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3 text-sm transition-colors ' +
                    (choice === o.id ? 'border-brand-700 bg-brand-50' : 'border-slate-300 bg-white hover:border-slate-400')
                  }
                >
                  <input
                    type="radio"
                    name={poll.id}
                    value={o.id}
                    checked={choice === o.id}
                    onChange={() => setChoice(o.id)}
                  />
                  <span className="break-words">{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-auto sm:min-w-40">
              <button type="submit" disabled={busy || !choice} className={buttonClass}>
                {busy ? 'Saving…' : changing ? 'Save my vote' : 'Vote'}
              </button>
            </div>
            {changing && (
              <button type="button" onClick={() => setChanging(false)} className="py-2 text-sm text-slate-600 hover:underline">
                Cancel
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">Results appear after you vote. Your vote is anonymous.</p>
        </form>
      )}

      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {confirmingDelete ? (
            <>
              <span className="text-slate-700">Delete this poll and all its votes?</span>
              <button onClick={onDelete} className="py-1 font-semibold text-red-700 hover:underline">
                Yes, delete
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="py-1 text-slate-600 hover:underline">
                Cancel
              </button>
            </>
          ) : confirmingClose ? (
            <>
              <span className="text-slate-700">Close voting now?</span>
              <button
                onClick={() => {
                  setConfirmingClose(false)
                  onClose()
                }}
                className="py-1 font-semibold text-brand-700 hover:underline"
              >
                Yes, close it
              </button>
              <button onClick={() => setConfirmingClose(false)} className="py-1 text-slate-600 hover:underline">
                Cancel
              </button>
            </>
          ) : (
            <>
              {!closed && (
                <button onClick={() => setConfirmingClose(true)} className="py-1 font-medium text-brand-700 hover:underline">
                  Close poll now
                </button>
              )}
              <button onClick={() => setConfirmingDelete(true)} className="py-1 text-slate-600 hover:text-red-700 hover:underline">
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </article>
  )
}

/* ---------- create form ---------- */
function PollForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (question: string, labels: string[], closesAt: string | null) => Promise<string | null>
  onCancel: () => void
}) {
  const uid = useId()
  const nextId = useRef(3)
  const [question, setQuestion] = useState('')
  const [choices, setChoices] = useState([
    { id: 1, text: '' },
    { id: 2, text: '' },
  ])
  const [closes, setCloses] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q) return setError('Write the question.')

    const labels = choices.map((c) => c.text.trim()).filter(Boolean)
    if (labels.length < MIN_OPTIONS) return setError(`Add at least ${MIN_OPTIONS} options.`)
    if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
      return setError('Two options are the same. Make each one different.')
    }

    let closesAt: string | null = null
    if (closes) {
      const d = new Date(closes)
      if (Number.isNaN(d.getTime())) return setError('The closing time is not valid.')
      if (d.getTime() <= Date.now()) return setError('The closing time must be in the future.')
      closesAt = d.toISOString()
    }

    setBusy(true)
    setError(null)
    const message = await onSubmit(q, labels, closesAt)
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <label htmlFor={`${uid}-q`} className="text-sm font-medium">Question</label>
        <input
          id={`${uid}-q`}
          value={question}
          maxLength={300}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Which day works best for the general assembly?"
          className={inputClass}
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Options ({choices.length} of {MAX_OPTIONS})</legend>
        <ul className="mt-1 space-y-2">
          {choices.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2">
              <input
                aria-label={`Option ${i + 1}`}
                value={c.text}
                maxLength={120}
                onChange={(e) =>
                  setChoices((prev) => prev.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))
                }
                placeholder={`Option ${i + 1}`}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-base sm:py-2 sm:text-sm"
              />
              {choices.length > MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => setChoices((prev) => prev.filter((x) => x.id !== c.id))}
                  aria-label={`Remove option ${i + 1}`}
                  className="rounded-md px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {choices.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => setChoices((prev) => [...prev, { id: nextId.current++, text: '' }])}
            className="mt-2 py-1 text-sm font-medium text-brand-700 hover:underline"
          >
            Add another option
          </button>
        )}
      </fieldset>

      <div>
        <label htmlFor={`${uid}-close`} className="text-sm font-medium">Closes at (optional)</label>
        <div className="flex items-center gap-3">
          <input
            id={`${uid}-close`}
            type="datetime-local"
            value={closes}
            onChange={(e) => setCloses(e.target.value)}
            className={inputClass + ' sm:max-w-xs'}
          />
          {closes && (
            <button type="button" onClick={() => setCloses('')} className="mt-1 py-2 text-sm text-slate-600 hover:underline">
              Clear
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">Leave it empty to keep the poll open until you close it yourself.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto sm:min-w-40">
          <button type="submit" disabled={busy} className={buttonClass}>
            {busy ? 'Creating…' : 'Create poll'}
          </button>
        </div>
        <button type="button" onClick={onCancel} className="py-2 text-sm text-slate-600 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  )
}
