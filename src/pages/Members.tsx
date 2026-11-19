import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL, type Profile, type Role } from '../lib/types'
import { subtleButtonClass } from '../components/ui'

const ROLES: Role[] = ['member', 'officer', 'treasurer', 'admin']

export default function Members() {
  const { profile: me } = useAuth()
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

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

  const q = search.trim().toLowerCase()
  const pending = rows.filter((r) => !r.approved && (!q || (r.full_name ?? '').toLowerCase().includes(q)))
  const approved = rows.filter((r) => r.approved && (!q || (r.full_name ?? '').toLowerCase().includes(q)))

  return (
    <div className="max-w-4xl">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Members</h1>
        <p className="mt-1 text-sm text-slate-600">Approve new sign-ups and choose what each person can do.</p>
      </header>

      {error && (
        <p role="alert" className="mt-6 border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4">
        <input aria-label="Search members" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members" className="min-h-11 w-full rounded-none border border-slate-300 bg-white px-3 py-2 text-base sm:max-w-sm sm:text-sm" />
      </div>
      {loading && <p className="mt-6 text-sm text-slate-500">Loading members…</p>}

      {!loading && (
        <>
          <section className="mt-6">
            <h2 className="font-display text-base font-semibold">Waiting for approval <span className="font-normal text-slate-500">({pending.length})</span></h2>
            {pending.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No one is waiting right now.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
                {pending.map((p) => (
                  <li key={p.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                    <span className="font-medium">{p.full_name || '(no name)'}</span>
                    <button onClick={() => void update(p.id, { approved: true })} className={subtleButtonClass + ' min-h-11'}>
                      Approve
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-7">
            <h2 className="font-display text-base font-semibold">Approved members <span className="font-normal text-slate-500">({approved.length})</span></h2>
            <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
              {approved.map((p) => (
                <li key={p.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                  <span className="font-medium">
                    {p.full_name || '(no name)'}
                    {p.id === me?.id && <span className="ml-2 text-sm font-normal text-slate-500">(you)</span>}
                  </span>
                  <select
                    aria-label={`Role for ${p.full_name || 'member'}`}
                    value={p.role}
                    disabled={p.id === me?.id}
                    onChange={(e) => void update(p.id, { role: e.target.value as Role })}
                    className="min-h-11 rounded-none border border-slate-300 bg-white px-2 py-2 text-base disabled:opacity-60 sm:text-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

