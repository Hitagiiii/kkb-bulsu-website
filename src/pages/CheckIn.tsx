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
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Event check-in</h1>

      {state.status === 'working' && <p className="mt-6 text-sm text-slate-500">Checking you in…</p>}

      {state.status === 'done' && (
        <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5">
          <p className="font-display text-xl font-semibold text-emerald-900">
            {state.already ? 'You were already checked in' : 'You are checked in'}
          </p>
          <p className="mt-1 break-words text-emerald-900">{state.title}</p>
        </div>
      )}

      {state.status === 'error' && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-3 text-sm text-red-700">
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
