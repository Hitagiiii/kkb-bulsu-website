import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import FullScreenMessage from '../components/FullScreenMessage'
import { subtleButtonClass } from '../components/ui'

const HELP_EMAIL = 'membership@kkbbulsu.org'

/** Shown to an approved member whose access an admin has paused. Their history is kept. */
export default function Deactivated() {
  const { session, profile, loading, signOut } = useAuth()
  if (loading) return <FullScreenMessage text="Loading…" />
  if (!session) return <Navigate to="/login" replace />
  if (!profile?.deactivated_at) return <Navigate to="/" replace />

  return (
    <AuthShell title="Your access is paused." subtitle="An admin has paused your KKB BULSU membership access. Your orders, attendance and records are kept.">
      <p className="text-sm text-muted">If this looks like a mistake, or you would like to rejoin, contact the membership officers.</p>
      <a href={`mailto:${HELP_EMAIL}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline">
        {HELP_EMAIL}
      </a>
      <div>
        <button onClick={() => void signOut()} className={subtleButtonClass + ' mt-6'}>
          Sign out
        </button>
      </div>
    </AuthShell>
  )
}
