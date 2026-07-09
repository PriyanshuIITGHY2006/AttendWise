import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import type { Tables } from "../types/database"

type Profile = Tables<"profiles">

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: Profile | null
  hasMaterialAccess: boolean
  loading: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signInWithMicrosoft: () => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [hasMaterialAccess, setHasMaterialAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setHasMaterialAccess(false)
      return
    }
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data))
    supabase.rpc("am_i_material_allowed").then(({ data }) => setHasMaterialAccess(!!data))
  }, [session?.user])

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return { error: error?.message ?? null }
  }

  async function signInWithMicrosoft() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
        scopes: "email openid profile",
        // Nudges the Microsoft login screen toward the IITG tenant; the
        // database trigger is what actually enforces the @iitg.ac.in
        // restriction, this is just a UX shortcut.
        queryParams: { domain_hint: "iitg.ac.in" },
      },
    })
    return { error: error?.message ?? null }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
        // Google Workspace accounts can be nudged toward a specific domain;
        // the database trigger is what actually enforces @iitg.ac.in.
        queryParams: { hd: "iitg.ac.in" },
      },
    })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        hasMaterialAccess,
        loading,
        signInWithPassword,
        signUp,
        signInWithMicrosoft,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
