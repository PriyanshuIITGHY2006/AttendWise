import { useAuth } from "../context/AuthContext"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"

export function Settings() {
  const { profile, signOut } = useAuth()

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <Card className="mt-6">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-neutral-500">Name</dt>
            <dd className="font-medium">{profile?.full_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Email</dt>
            <dd className="font-medium">{profile?.email}</dd>
          </div>
        </dl>
      </Card>
      <Button variant="secondary" onClick={signOut} className="mt-6 md:hidden">
        Sign out
      </Button>
    </div>
  )
}
