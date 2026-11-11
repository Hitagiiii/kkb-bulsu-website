import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { AuthContext, type AuthState } from './AuthContext'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileFor, setProfileFor] = useState<string | null>(null)

  // 1. Track the login session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  // 2. Load the profile (role + approval) for the logged-in user
  const fetchProfile = useCallback(async (id: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    setProfile((data as Profile | null) ?? null)
    setProfileFor(id)
  }, [])

  useEffect(() => {
    if (userId) void fetchProfile(userId)
  }, [userId, fetchProfile])

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile: userId && profileFor === userId ? profile : null,
      loading: !sessionLoaded || (!!userId && profileFor !== userId),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error?.message ?? null
      },
      signUp: async (email, password, fullName) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        return { error: error?.message ?? null, needsConfirm: !error && !data.session }
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },
      refreshProfile: async () => {
        if (userId) await fetchProfile(userId)
      },
    }),
    [session, userId, profile, profileFor, sessionLoaded, fetchProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
