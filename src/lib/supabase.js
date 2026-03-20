import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.SUPABASE_URL
const SUPABASE_ANON = import.meta.env.SUPABASE_ANON

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  db: { schema: 'public' }
})