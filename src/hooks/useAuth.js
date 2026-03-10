import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signUp(email, password) {
    const { error } = await sb.auth.signUp({ email, password })
    return { error }
  }

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await sb.auth.signOut()
  }

  async function resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
    return { error }
  }

  return { user, loading, signUp, signIn, signOut, resetPassword }
}