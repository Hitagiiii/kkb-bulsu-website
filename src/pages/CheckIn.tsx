import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/finance'
import { subtleButtonClass } from '../components/ui'

type State =
  | { status: 'working' }
  | { status: 'done'; title: string; already: boolean }
  | { status: 'error'; message: string }

/** Members land here after scanning an event's QR code with their phone camera. */
export default function CheckIn() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ status: 'working' })
  const ran = useRef(false)

  useEffect(() => {
    if (!token || ran.current) return
    ran.current = true
    supabase.rpc('check_in', { p_token: token }).then(({ data, error }) => {
      if (error) return setState({ status: 'error', message: errorMessage(error, 'Could not check you in.') })
      const r = data as { title: string; already: boolean }
      setState({ status: 'done', title: r.title, already: r.already })
    })
  }, [token])

  return (
    <div className="max-w-md">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-brand-700 uppercase">Event check-in</p>
      <h1 className="font-display mt-1 text-[28px] leading-tight font-medium tracking-tight sm:text-[40px]">Welcome in.</h1>

      {state.status === 'working' && <p className="mt-6 text-sm text-muted">Checking you in…</p>}

      {state.status === 'done' && (
        <div className="mt-6 rounded-xl border border-success-pale bg-success-pale p-5">
          <p className="text-xl font-medium text-success-deep">
            {state.already ? 'You were already checked in' : 'You are checked in'}
          </p>
          <p className="mt-1 break-words text-success-deep">{state.title}</p>
        </div>
      )}

      {state.status === 'error' && (
        <p role="alert" className="mt-6 rounded-md bg-soft px-3 py-3 text-sm text-brand-700">
          {state.message}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <Link to="/attendance" className={subtleButtonClass}>My attendance</Link>
        <Link to="/events" className={subtleButtonClass}>Events</Link>
      </div>
    </div>
  )
}

