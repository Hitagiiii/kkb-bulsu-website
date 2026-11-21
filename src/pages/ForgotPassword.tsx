import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { buttonClass, inputClass } from '../components/ui'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${(import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) return setError(error.message)
    setSent(true)
  }

  if (sent) {
    return (
      <AuthShell title="Check your email." subtitle={`If ${email} belongs to a member, a reset link is on its way.`}>
        <p className="text-sm text-muted">Open the link on this device, choose a new password, then sign in. The link works for a limited time.</p>
        <Link to="/login" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline">Back to sign in</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your university email and we’ll send you a link to choose a new one.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-ink">University email</label>
          <input id="email" type="email" required autoComplete="email" placeholder="name@bulsu.edu.ph" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        {error && <p role="alert" className="border-l-4 border-brand-700 bg-soft px-3 py-2.5 text-sm text-brand-700">{error}</p>}
        <button type="submit" disabled={busy} className={buttonClass}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
      <Link to="/login" className="mt-6 inline-flex min-h-11 items-center text-sm text-muted hover:text-ink hover:underline">Back to sign in</Link>
    </AuthShell>
  )
}
