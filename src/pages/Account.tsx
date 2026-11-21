import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'
import { buttonClass, cardClass, inputClass } from '../components/ui'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL } from '../lib/types'

const COLLEGES = ['CAFA', 'CAL', 'CBA', 'CCJE', 'CHTM', 'CICT', 'CIT', 'CN', 'COE', 'COED', 'CS', 'CSSP', 'Other']

export default function Account() {
  const { profile, session, refreshProfile } = useAuth()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [studentNo, setStudentNo] = useState(profile?.student_no ?? '')
  const [college, setCollege] = useState(profile?.college ?? '')
  const [program, setProgram] = useState(profile?.program ?? '')
  const [yearSection, setYearSection] = useState(profile?.year_section ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null)

  if (!profile) return null

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (!fullName.trim()) return setError('Your name cannot be empty.')
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        student_no: studentNo.trim() || null,
        college: college || null,
        program: program.trim() || null,
        year_section: yearSection.trim() || null,
      })
      .eq('id', profile!.id)
    setSaving(false)
    if (error) return setError(error.message)
    await refreshProfile()
    setSaved(true)
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setPwMessage(null)
    if (password.length < 8 || !/\d/.test(password)) return setPwMessage({ ok: false, text: 'Use 8 or more characters, including a number.' })
    if (password !== confirm) return setPwMessage({ ok: false, text: 'The two passwords do not match.' })
    setPwBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setPwBusy(false)
    if (error) return setPwMessage({ ok: false, text: error.message })
    setPassword('')
    setConfirm('')
    setPwMessage({ ok: true, text: 'Password changed.' })
  }

  return (
    <div className="w-full">
      <PageHeader eyebrow="Account settings" title="Your details." subtitle={`${ROLE_LABEL[profile.role]} · ${session?.user.email ?? ''}`} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <form onSubmit={saveProfile} className={cardClass + ' space-y-4 p-4 sm:p-6'}>
          <h2 className="text-xl font-medium">Membership details</h2>
          <p className="text-sm text-muted">Officers use these to verify you. Your role and approval can only be changed by an admin.</p>
          <div>
            <label htmlFor="acc-name" className="block text-sm font-semibold">Full name</label>
            <input id="acc-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className={inputClass} />
          </div>
          <div>
            <label htmlFor="acc-email" className="block text-sm font-semibold">University email</label>
            <input id="acc-email" value={session?.user.email ?? ''} disabled className={inputClass + ' bg-paper text-muted'} />
          </div>
          <div>
            <label htmlFor="acc-sn" className="block text-sm font-semibold">Student number</label>
            <input id="acc-sn" value={studentNo} onChange={(e) => setStudentNo(e.target.value)} inputMode="numeric" className={inputClass} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="acc-col" className="block text-sm font-semibold">College</label>
              <select id="acc-col" value={college} onChange={(e) => setCollege(e.target.value)} className={inputClass}>
                <option value="">Choose…</option>
                {COLLEGES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="acc-prog" className="block text-sm font-semibold">Program</label>
              <input id="acc-prog" value={program} onChange={(e) => setProgram(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="acc-ys" className="block text-sm font-semibold">Year & section</label>
            <input id="acc-ys" value={yearSection} onChange={(e) => setYearSection(e.target.value)} placeholder="3rd year · BSIT 3A" className={inputClass} />
          </div>
          {error && <p role="alert" className="border-l-4 border-brand-700 bg-soft px-3 py-2.5 text-sm text-brand-700">{error}</p>}
          {saved && <p role="status" className="rounded-md bg-success-pale px-3 py-2.5 text-sm text-success-deep">Saved.</p>}
          <button type="submit" disabled={saving} className={buttonClass + ' sm:w-auto'}>{saving ? 'Saving…' : 'Save changes'}</button>
        </form>

        <form onSubmit={changePassword} className={cardClass + ' space-y-4 p-4 sm:p-6'}>
          <h2 className="text-xl font-medium">Password</h2>
          <div>
            <label htmlFor="acc-pw" className="block text-sm font-semibold">New password</label>
            <input id="acc-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            <p className="mt-1 text-xs text-muted">Use 8 or more characters, including a number.</p>
          </div>
          <div>
            <label htmlFor="acc-pw2" className="block text-sm font-semibold">Confirm new password</label>
            <input id="acc-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </div>
          {pwMessage && (
            <p role={pwMessage.ok ? 'status' : 'alert'} className={pwMessage.ok ? 'rounded-md bg-success-pale px-3 py-2.5 text-sm text-success-deep' : 'border-l-4 border-brand-700 bg-soft px-3 py-2.5 text-sm text-brand-700'}>
              {pwMessage.text}
            </p>
          )}
          <button type="submit" disabled={pwBusy} className={buttonClass + ' sm:w-auto'}>{pwBusy ? 'Saving…' : 'Change password'}</button>
        </form>
      </div>
    </div>
  )
}
