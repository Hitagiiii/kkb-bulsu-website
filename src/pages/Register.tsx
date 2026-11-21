import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import { buttonClass, inputClass } from '../components/ui'

const COLLEGES = ['CAFA', 'CAL', 'CBA', 'CCJE', 'CHTM', 'CICT', 'CIT', 'CN', 'COE', 'COED', 'CS', 'CSSP', 'Other']
const YEARS = ['1st year', '2nd year', '3rd year', '4th year', '5th year']

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export default function Register() {
  const { session, loading, signUp } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [studentNo, setStudentNo] = useState('')
  const [college, setCollege] = useState('')
  const [program, setProgram] = useState('')
  const [year, setYear] = useState('')
  const [section, setSection] = useState('')
  const [password, setPassword] = useState('')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8 || !/\d/.test(password)) return setError('Use a password with 8 or more characters, including a number.')
    if (!agree) return setError('Please agree to the membership guidelines and privacy notice.')

    setBusy(true)
    const result = await signUp(email.trim(), password, fullName.trim(), {
      studentNo: studentNo.trim(),
      college,
      program: program.trim(),
      yearSection: [year, section.trim()].filter(Boolean).join(' · '),
    })
    setBusy(false)

    if (result.error) return setError(result.error)
    if (result.needsConfirm) return setCheckEmail(true)
    navigate('/pending', { replace: true })
  }

  if (checkEmail) {
    return (
      <AuthShell title="Check your email." subtitle={`We sent a confirmation link to ${email}.`}>
        <p className="text-sm text-muted">Open the link, then sign in. An officer will approve your account after that.</p>
        <Link to="/login" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline">
          Go to sign in
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Make yourself at home." subtitle="Apply for membership using your BulSU email.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field id="name" label="Full name">
          <input id="name" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </Field>
        <Field id="email" label="University email">
          <input id="email" type="email" required autoComplete="email" placeholder="name@bulsu.edu.ph" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field id="studentNo" label="Student number">
          <input id="studentNo" required inputMode="numeric" placeholder="2024 010284" value={studentNo} onChange={(e) => setStudentNo(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="college" label="College">
            <select id="college" required value={college} onChange={(e) => setCollege(e.target.value)} className={inputClass}>
              <option value="">Choose…</option>
              {COLLEGES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field id="program" label="Program">
            <input id="program" required placeholder="BS Information Technology" value={program} onChange={(e) => setProgram(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="year" label="Year">
            <select id="year" required value={year} onChange={(e) => setYear(e.target.value)} className={inputClass}>
              <option value="">Choose…</option>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </Field>
          <Field id="section" label="Section">
            <input id="section" required placeholder="BSIT 3A" value={section} onChange={(e) => setSection(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field id="password" label="Password" hint="Use 8 or more characters, including a number.">
          <input id="password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
          I agree to the membership guidelines and privacy notice.
        </label>
        {error && (
          <p role="alert" className="border-l-4 border-brand-700 bg-soft px-3 py-2.5 text-sm text-brand-700">{error}</p>
        )}
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? 'Submitting…' : 'Submit membership application'}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Already a member?{' '}
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
