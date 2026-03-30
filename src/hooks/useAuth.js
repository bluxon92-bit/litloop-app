import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { Capacitor } from '@capacitor/core'

export function useAuth() {
  const [user, setUser]       = useState(null)
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
    const redirectTo = Capacitor.isNativePlatform()
      ? 'litloop://login-callback'
      : window.location.origin
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo })
    return { error }
  }

  return { user, loading, signUp, signIn, signOut, resetPassword }
}