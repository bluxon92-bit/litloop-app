import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = 'https://danknyhumorgkvidrdve.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhbmtueWh1bW9yZ2t2aWRyZHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTMzMzksImV4cCI6MjA4ODM2OTMzOX0.uTbNT_MBipxNCJckFI2JFACvftdtSy3M-YRQuJVDziU'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  db: { schema: 'staging' }
})