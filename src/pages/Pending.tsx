import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import FullScreenMessage from '../components/FullScreenMessage'
import { subtleButtonClass } from '../components/ui'

export default function Pending() {
  const { session, profile, loading, signOut } = useAuth()

  if (loading) return <FullScreenMessage text="Loading…" />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.approved) return <Navigate to="/" replace />




  return (
    <div className="min-h-screen bg-bg px-4 py-6 sm:px-6 md:flex md:items-center md:justify-center md:py-8">
      <main className="mx-auto w-full max-w-sm rounded-md border border-border bg-surface p-5 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-brand-700 font-num text-lg font-semibold text-white">KKB</span>
        <h1 className="font-display mt-2 text-2xl font-semibold tracking-tight text-ink">Application received</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">An officer will review your account. You will get access once it is approved</p>
        <button onClick={() => void signOut()} className={subtleButtonClass + ' mt-5 w-full min-h-11'}>
          Sign out
        </button>
      </main>
    </div>
  )
}
