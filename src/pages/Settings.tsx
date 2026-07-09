import { useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { getGlobalNotificationSettings, updateGlobalNotificationSettings } from "../features/notifications/api"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"

const LEAD_TIME_OPTIONS = [5, 10, 15, 30, 60]

export function Settings() {
  const { user, profile, signOut } = useAuth()
  const [muted, setMuted] = useState(false)
  const [leadTime, setLeadTime] = useState(15)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    getGlobalNotificationSettings(user.id).then((s) => {
      setMuted(s.muted)
      setLeadTime(s.lead_time_minutes)
      setLoaded(true)
    })
  }, [user])

  async function toggleMuted() {
    if (!user) return
    const next = !muted
    setMuted(next)
    await updateGlobalNotificationSettings(user.id, { muted: next })
  }

  async function changeLeadTime(minutes: number) {
    if (!user) return
    setLeadTime(minutes)
    await updateGlobalNotificationSettings(user.id, { lead_time_minutes: minutes })
  }

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

      {loaded && (
        <Card className="mt-6">
          <h2 className="font-medium">Notifications</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Class reminders, attendance warnings, and quiz nudges (native app only).
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm">All notifications</span>
            <button
              type="button"
              onClick={toggleMuted}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${muted ? "bg-neutral-300 dark:bg-neutral-700" : "bg-indigo-600"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${muted ? "left-0.5" : "left-[22px]"}`}
              />
            </button>
          </div>
          {!muted && (
            <div className="mt-4">
              <p className="text-sm text-neutral-500">Remind me before class starts</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LEAD_TIME_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => changeLeadTime(minutes)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      leadTime === minutes
                        ? "bg-indigo-600 text-white"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                    }`}
                  >
                    {minutes} min
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Button variant="secondary" onClick={signOut} className="mt-6 md:hidden">
        Sign out
      </Button>
    </div>
  )
}
