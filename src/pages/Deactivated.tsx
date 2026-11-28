import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import FullScreenMessage from '../components/FullScreenMessage'
import Chip from '../components/Chip'
import { eyebrowClass, subtleButtonClass } from '../components/ui'

const HELP_EMAIL = 'membership@kkbbulsu.org'

/** Shown to an approved member whose access an admin has paused. Their history is kept. */
export default function Deactivated() {
  const { session, profile, loading, signOut } = useAuth()
  if (loading) return <FullScreenMessage text="Loading…" />
  if (!session) return <Navigate to="/login" replace />
  if (!profile?.deactivated_at) return <Navigate to="/" replace />

  return (
    <AuthShell title="Your access is paused." subtitle="An admin has paused your KKB BULSU membership access. Your orders, attendance and records are kept.">
      <div className="space-y-4">
        <div>
          <Chip tone="amber">Access paused</Chip>
        </div>
        <p className="text-sm leading-6 text-muted">If this looks like a mistake, or you would like to rejoin, contact the membership officers.</p>
        <div className="border-y border-border-subtle py-3">
          <p className={eyebrowClass}>Membership office</p>
          <a href={`mailto:${HELP_EMAIL}`} className="mt-0.5 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline">
            {HELP_EMAIL}
          </a>
        </div>
        <div>
          <button onClick={() => void signOut()} className={subtleButtonClass + ' w-full sm:w-auto'}>
            Sign out
          </button>
        </div>
      </div>
    </AuthShell>
  )
}
