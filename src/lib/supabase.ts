import { createClient } from "@supabase/supabase-js"
import type { Database } from "../types/database"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables",
  )
}

// PKCE (not implicit) so the native app can exchange the deep-link callback's
// "code" param for a session -- see AuthContext's appUrlOpen handler.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: "pkce" },
})
