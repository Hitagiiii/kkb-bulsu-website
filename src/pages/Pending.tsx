import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import FullScreenMessage from '../components/FullScreenMessage'
import { cardClass, eyebrowClass, subtleButtonClass } from '../components/ui'
import { CheckIcon } from '../components/Icons'

const HELP_EMAIL = 'membership@kkbbulsu.org'

export default function Pending() {
  const { session, profile, loading, refreshProfile, signOut } = useAuth()
  const [checking, setChecking] = useState(false)

  if (loading) return <FullScreenMessage text="Loading…" />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.approved) return <Navigate to="/" replace />

  async function check() {
    setChecking(true)
    await refreshProfile()
    setChecking(false)
  }

  const submitted = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const year = profile?.created_at ? new Date(profile.created_at).getFullYear() : new Date().getFullYear()
  const reference = profile ? `KKB-${year}-${profile.id.slice(0, 4).toUpperCase()}` : null
  const details = [
    profile?.student_no,
    [profile?.college, profile?.year_section].filter(Boolean).join(', ') || null,
  ].filter(Boolean)

  const steps: { label: string; state: 'done' | 'current' | 'todo' }[] = [
    { label: 'Application submitted', state: 'done' },
    { label: 'Officer review', state: 'current' },
    { label: 'Membership activated', state: 'todo' },
  ]

  return (
    <AuthShell
      title="You’re on the list."
      subtitle="Your application is waiting for an officer’s approval. We’ll email you when you’re in."
    >
      <section className={cardClass + ' p-5'} aria-label="Application received">
        <p className={eyebrowClass}>Application received</p>
        <p className="mt-2 text-xl font-medium text-ink">{profile?.full_name || session.user.email}</p>
        {details.length > 0 && <p className="mt-2 text-sm text-muted">{details.join(' · ')}</p>}
        {submitted && <p className="mt-3 text-sm text-muted">Submitted {submitted}</p>}
        {reference && <p className="text-sm text-muted">Reference {reference}</p>}

        <ol className="mt-4 space-y-1.5 text-sm">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center justify-between gap-3">
              <span className={s.state === 'todo' ? 'text-muted' : 'text-ink'}>
                {i + 1} {s.label}
              </span>
              {s.state === 'done' && <CheckIcon size={14} className="text-brand-700" />}
              {s.state === 'current' && <span className="text-xs font-semibold text-brand-700">In progress</span>}
            </li>
          ))}
        </ol>
      </section>

      <h2 className="mt-8 text-base font-semibold text-ink">What happens next</h2>
      <p className="mt-2 text-sm text-muted">
        An officer will verify your university details. Reviews usually take 1–2 school days.
      </p>
      <button onClick={() => void check()} disabled={checking} className={subtleButtonClass + ' mt-4 w-full'}>
        {checking ? 'Checking…' : 'Check application status'}
      </button>

      <p className="mt-6 text-xs text-brand-700">
        Need to correct something?
        <br />
        <a href={`mailto:${HELP_EMAIL}`} className="hover:underline">Contact {HELP_EMAIL}</a>
      </p>
      <button onClick={() => void signOut()} className="mt-4 text-sm text-muted hover:text-ink hover:underline">
        Sign out
      </button>
    </AuthShell>
  )
}
