import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) { setIsAdmin(false); setLoading(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setIsAdmin(data?.role === 'admin')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId])

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signOut = () => supabase.auth.signOut()

  return (
    <AuthCtx.Provider value={{ session, user: session?.user, isAdmin, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
