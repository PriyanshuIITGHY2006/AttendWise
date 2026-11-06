import { createClient } from '@supabase/supabase-js'

/** Public project settings. The publishable key is meant to ship in apps; row level security protects the data. */
export const SUPABASE_URL = 'https://jlueyxbqknnmcoesgnmg.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_Dynr916H7nm1M3YcjPfRMg_HP5OQuET'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'v2' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})
