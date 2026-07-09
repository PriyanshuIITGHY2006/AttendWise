import { useState, type FormEvent } from "react"
import { Link, Navigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { Button } from "../components/ui/Button"
import { Input, Label } from "../components/ui/Input"
import { OAuthButtons } from "../components/auth/OAuthButtons"

const IITG_EMAIL = /@iitg\.ac\.in$/i

export function SignUp() {
  const { session, signUp } = useAuth()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!IITG_EMAIL.test(email)) {
      setError("Only @iitg.ac.in email addresses can sign up.")
      return
    }
    setSubmitting(true)
    setError(null)
    const { error } = await signUp(email, password, fullName)
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-lg font-semibold">Check your inbox</h1>
          <p className="mt-2 max-w-sm text-sm text-neutral-500">
            We sent a confirmation link to {email}. Confirm it, then sign in.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm font-medium underline">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center text-xl font-semibold tracking-tight">AttendWise</div>

        <OAuthButtons onError={setError} />

        <div className="my-5 flex items-center gap-3 text-xs text-neutral-400">
          <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          or
          <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@iitg.ac.in"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-neutral-900 hover:underline dark:text-neutral-100">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
