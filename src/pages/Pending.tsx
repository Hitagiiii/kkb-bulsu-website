import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import FullScreenMessage from '../components/FullScreenMessage'
import { subtleButtonClass } from '../components/ui'

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

  return (
    <AuthShell
      title="Waiting for approval"
      subtitle={`You're signed in as ${session.user.email}. An officer needs to approve your account.`}
    >
      <p className="text-sm text-slate-600">
        Once you're approved, refresh this page or press the button below.
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={() => void check()} disabled={checking} className={subtleButtonClass}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <button onClick={() => void signOut()} className={subtleButtonClass}>
          Sign out
        </button>
      </div>
    </AuthShell>
  )
}
