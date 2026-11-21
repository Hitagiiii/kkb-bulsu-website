import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import FullScreenMessage from '../components/FullScreenMessage'
import { buttonClass, inputClass } from '../components/ui'
import { supabase } from '../lib/supabase'

/** Opened from the link in the reset email. Supabase signs the person in with that link, then they pick a new password. */
export default function ResetPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <FullScreenMessage text="Loading…" />

  if (!session) {
    return (
      <AuthShell title="This link has expired." subtitle="Reset links only work once and for a short time.">
        <Link to="/forgot-password" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline">Send a new link</Link>
      </AuthShell>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8 || !/\d/.test(password)) return setError('Use a password with 8 or more characters, including a number.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    navigate('/', { replace: true })
  }

  return (
    <AuthShell title="Choose a new password." subtitle="You’ll stay signed in afterwards.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-semibold text-ink">New password</label>
          <input id="password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-muted">Use 8 or more characters, including a number.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-semibold text-ink">Confirm new password</label>
          <input id="confirm" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </div>
        {error && <p role="alert" className="border-l-4 border-brand-700 bg-soft px-3 py-2.5 text-sm text-brand-700">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </AuthShell>
  )
}
