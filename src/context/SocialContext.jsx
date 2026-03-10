import { createContext, useContext } from 'react'
import { useSocial } from '../hooks/useSocial'
import { useAuthContext } from './AuthContext'

const SocialContext = createContext(null)

export function SocialProvider({ children }) {
  const { user } = useAuthContext()
  const social = useSocial(user)
  return <SocialContext.Provider value={social}>{children}</SocialContext.Provider>
}

export function useSocialContext() {
  return useContext(SocialContext)
}
