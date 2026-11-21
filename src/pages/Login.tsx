import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import { buttonClass, cardClass, inputClass, subtleButtonClass } from '../components/ui'

export default function Login() {
  const { session, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && session) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const message = await signIn(email.trim(), password)
    setBusy(false)
    if (message) {
      setError(
        message.toLowerCase().includes('invalid login')
          ? 'Wrong email or password. Check both and try again.'
          : message,
      )
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <AuthShell
      title="Welcome back."
      subtitle="Sign in to your campus community."
      aside={
        <>
          <div className={cardClass + ' mt-8 p-5'}>
            <p className="text-sm font-semibold text-ink">New around here?</p>
            <p className="mt-1 text-sm text-muted">Join the community to see events, announcements and members-only merch.</p>
            <Link to="/register" className={subtleButtonClass + ' mt-4 w-full'}>
              Create an account
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">Access is limited to approved KKB BULSU members.</p>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-ink">University email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="name@bulsu.edu.ph"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="block text-sm font-semibold text-ink">Password</label>
            <Link to="/forgot-password" className="text-xs font-semibold text-brand-700 hover:underline">Forgot password?</Link>
          </div>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        {error && (
          <p role="alert" className="border-l-4 border-brand-700 bg-soft px-3 py-2.5 text-sm text-brand-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}
