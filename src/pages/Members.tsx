import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL, type Profile, type Role } from '../lib/types'
import { buttonClass, cardClass, dangerButtonClass, eyebrowClass, inputClass } from '../components/ui'

const ROLES: Role[] = ['member', 'officer', 'treasurer', 'admin']

type Tab = 'all' | 'pending' | 'officers'

/** "2024 010284 · CICT, BSIT 3A" from whatever the person gave on the form */
function detailLine(p: Profile): string {
  const bits = [
    p.student_no,
    [p.college, [p.program, p.year_section].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  ].filter(Boolean)
  return bits.join(' · ')
}

export default function Members() {
  const { profile: me } = useAuth()
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [declining, setDeclining] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setRows((data ?? []) as Profile[])
        setLoading(false)
      })
  }, [])

  async function update(id: string, patch: Partial<Pick<Profile, 'role' | 'approved'>>) {
    setError(null)
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) setError(error.message)
    else setRows((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  async function decline(id: string) {
    setError(null)
    const { error } = await supabase.rpc('decline_member', { p_id: id })
    setDeclining(null)
    if (error) return setError(error.message)
    setRows((prev) => prev.filter((p) => p.id !== id))
  }

  const q = search.trim().toLowerCase()
  const matches = (p: Profile) =>
    !q || [p.full_name, p.student_no, p.college, p.program].some((x) => (x ?? '').toLowerCase().includes(q))
  const pending = rows.filter((r) => !r.approved && matches(r))
  const approvedAll = rows.filter((r) => r.approved)
  const approved = approvedAll.filter((r) => matches(r) && (tab !== 'officers' || r.role !== 'member'))

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All members' },
    { id: 'pending', label: 'Pending approval' },
    { id: 'officers', label: 'Officers' },
  ]

  return (
    <div className="w-full">
      <header>
        <p className={eyebrowClass}>Admin workspace</p>
        <h1 className="font-display mt-1 text-[28px] leading-tight font-medium tracking-tight sm:text-[40px]">People make the org.</h1>
        <p className="mt-2 text-sm text-muted">Membership approvals and account access.</p>
      </header>

      {!loading && (
        <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div className="flex gap-1.5"><dt className="text-muted">Active</dt><dd className="font-semibold">{approvedAll.length}</dd></div>
          <div className="flex gap-1.5"><dt className="text-muted">Pending approval</dt><dd className="font-semibold text-accent">{rows.filter((r) => !r.approved).length}</dd></div>
        </dl>
      )}

      {error && (
        <p role="alert" className="mt-6 border-l-4 border-accent bg-soft px-3 py-2 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div role="group" aria-label="Filter members" className="flex gap-5 text-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                '-mb-px min-h-11 border-b-2 transition-colors ' +
                (tab === t.id ? 'border-accent font-semibold text-accent' : 'border-transparent text-muted hover:text-ink')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          aria-label="Search members"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, student no. or program…"
          className={inputClass + ' !mt-0 mb-2 sm:max-w-xs'}
        />
      </div>

      {loading && <p className="mt-6 text-sm text-muted">Loading members…</p>}

      {!loading && (
        <>
          {tab !== 'officers' && (
            <section className="mt-6" aria-label="Waiting for approval">
              <h2 className="text-xl font-medium">
                {pending.length} {pending.length === 1 ? 'application needs' : 'applications need'} review
              </h2>
              <p className="mt-1 text-sm text-muted">Verify university details before granting access.</p>
              {pending.length === 0 ? (
                <p className={cardClass + ' mt-3 px-4 py-6 text-sm text-muted'}>No one is waiting right now.</p>
              ) : (
                <ul className="mt-3 grid gap-3 md:grid-cols-2">
                  {pending.map((p) => (
                    <li key={p.id} className={cardClass + ' flex flex-wrap items-center justify-between gap-3 p-4'}>
                      <div className="min-w-0">
                        <p className="font-semibold break-words">{p.full_name || '(no name)'}</p>
                        <p className="text-xs break-words text-muted">{detailLine(p) || 'No university details provided'}</p>
                      </div>
                      {declining === p.id ? (
                        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="text-ink">Decline and delete this application?</span>
                          <button onClick={() => void decline(p.id)} className="min-h-11 font-semibold text-accent hover:underline">Yes, decline</button>
                          <button onClick={() => setDeclining(null)} className="min-h-11 text-muted hover:underline">Keep</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => void update(p.id, { approved: true })} className={buttonClass + ' !w-auto'}>
                            Approve
                          </button>
                          <button onClick={() => setDeclining(p.id)} className={dangerButtonClass}>
                            Decline
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab !== 'pending' && (
            <section className="mt-8" aria-label="Approved members">
              <h2 className="text-xl font-medium">
                {tab === 'officers' ? 'Officers' : 'Approved members'} <span className="text-base text-muted">({approved.length})</span>
              </h2>
              <div className={cardClass + ' mt-3 overflow-x-auto'}>
                <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-[11px] tracking-[0.08em] text-muted uppercase">
                      <th className="px-4 py-3 font-semibold">Name / Student no.</th>
                      <th className="px-4 py-3 font-semibold">College / Year</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approved.map((p) => (
                      <tr key={p.id} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-3">
                          <p className="font-semibold break-words">
                            {p.full_name || '(no name)'}
                            {p.id === me?.id && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}
                          </p>
                          <p className="text-xs text-muted">{p.student_no || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-muted">{[p.college, p.year_section].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`Role for ${p.full_name || 'member'}`}
                            value={p.role}
                            disabled={p.id === me?.id}
                            onChange={(e) => void update(p.id, { role: e.target.value as Role })}
                            className="min-h-10 rounded-md border border-line bg-white px-2 py-1.5 text-base disabled:opacity-60 sm:text-sm"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                    {approved.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-muted">No members match.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted">Role changes are restricted to admins.</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
