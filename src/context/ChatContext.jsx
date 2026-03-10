import { createContext, useContext } from 'react'
import { useChat } from '../hooks/useChat'
import { useAuthContext } from './AuthContext'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const { user } = useAuthContext()
  const chat = useChat(user)
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>
}

export function useChatContext() {
  return useContext(ChatContext)
}
