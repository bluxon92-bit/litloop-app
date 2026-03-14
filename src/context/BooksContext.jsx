import { createContext, useContext } from 'react'
import { useBooks } from '../hooks/useBooks'
import { useAuthContext } from './AuthContext'

const BooksContext = createContext(null)

export function BooksProvider({ children }) {
  const { user } = useAuthContext()
  const books = useBooks(user)
  return <BooksContext.Provider value={books}>{children}</BooksContext.Provider>
}

export function useBooksContext() {
  return useContext(BooksContext)
}

// Convenience re-export of the update fn for CoverImage consumers
export { BooksContext }