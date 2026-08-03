import { useEffect, useState } from "react"
import { useAuth } from "../context/AuthContext"
import {
  getGlobalNotificationSettings,
  updateGlobalNotificationSettings,
  DEFAULT_PREFS,
  type NotificationPrefs,
} from "../features/notifications/api"
import { regenerateAllCourses } from "../features/courses/api"
import { supabase } from "../lib/supabase"
import { getStoredTheme, setTheme, type Theme } from "../lib/theme"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"

const THEME_OPTIONS: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
]

const LEAD_TIME_OPTIONS = [5, 10, 15, 30, 60]

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-indigo-600" : "bg-neutral-300 dark:bg-neutral-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  )
}

function ToggleRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string
  hint?: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="text-sm">{label}</span>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      </div>
      <Toggle on={on} onClick={onToggle} />
    </div>
  )
}

// DB stores time as "HH:MM:SS"; the native <input type=time> wants "HH:MM".
const toInput = (t: string | null) => (t ? t.slice(0, 5) : "")

export function Settings() {
  const { user, profile, signOut } = useAuth()
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const [loaded, setLoaded] = useState(false)
  const [firstYear, setFirstYear] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [resyncMsg, setResyncMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    getGlobalNotificationSettings(user.id).then((s) => {
      setPrefs(s)
      setLoaded(true)
    })
  }, [user])

  useEffect(() => {
    if (profile) setFirstYear(profile.is_first_year_ug)
  }, [profile])

  // Optimistic: reflect the change instantly, then persist. Every control on
  // this page routes through here so behaviour stays consistent.
  function update(patch: Partial<NotificationPrefs>) {
    if (!user) return
    setPrefs((p) => ({ ...p, ...patch }))
    void updateGlobalNotificationSettings(user.id, patch)
  }

  function toggleQuietHours() {
    if (prefs.quiet_start && prefs.quiet_end) {
      update({ quiet_start: null, quiet_end: null })
    } else {
      update({ quiet_start: "22:00", quiet_end: "07:00" })
    }
  }

  // First-year UG students get two extra Saturday classes from the institute's
  // day-order swaps, so flipping this has to rebuild the generated sessions.
  async function toggleFirstYear() {
    if (!user) return
    const next = !firstYear
    setFirstYear(next)
    setResyncing(true)
    setResyncMsg(null)
    await supabase.from("profiles").update({ is_first_year_ug: next }).eq("id", user.id)
    const count = await regenerateAllCourses(user.id)
    setResyncing(false)
    setResyncMsg(`Rebuilt the schedule for ${count} course${count === 1 ? "" : "s"}.`)
  }

  async function resyncCalendar() {
    if (!user) return
    setResyncing(true)
    setResyncMsg(null)
    const count = await regenerateAllCourses(user.id)
    setResyncing(false)
    setResyncMsg(`Re-synced ${count} course${count === 1 ? "" : "s"} with the academic calendar.`)
  }

  const quietOn = !!(prefs.quiet_start && prefs.quiet_end)

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
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

      <Card className="mt-6">
        <h2 className="font-medium">Appearance</h2>
        <p className="mt-1 text-sm text-neutral-500">Choose your theme.</p>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setThemeState(o.id)
                setTheme(o.id)
              }}
              className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                theme === o.id
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>

      {loaded && (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Notifications</h2>
              <p className="mt-1 text-sm text-neutral-500">Reminders and nudges (native app only).</p>
            </div>
            <Toggle on={!prefs.muted} onClick={() => update({ muted: !prefs.muted })} />
          </div>

          {!prefs.muted && (
            <div className="mt-5 space-y-5">
              {/* Voice */}
              <div>
                <p className="text-sm font-medium">Voice</p>
                <p className="text-xs text-neutral-500">How the messages talk to you.</p>
                <div className="mt-2 flex gap-1.5">
                  {(
                    [
                      { key: "roast", label: "Bunkmate 😏" },
                      { key: "kuchupuchu", label: "Kuchupuchu 🥺" },
                      { key: "plain", label: "Plain" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => update({ humor_level: opt.key })}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        prefs.humor_level === opt.key
                          ? "bg-indigo-600 text-white"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                {/* Class reminders + lead time */}
                <ToggleRow
                  label="Class reminders"
                  hint="A heads-up before each class, with Present/Absent buttons."
                  on={prefs.class_reminders}
                  onToggle={() => update({ class_reminders: !prefs.class_reminders })}
                />
                {prefs.class_reminders && (
                  <div className="pl-0.5">
                    <p className="text-xs text-neutral-500">Remind me this long before class</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {LEAD_TIME_OPTIONS.map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() => update({ lead_time_minutes: minutes })}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            prefs.lead_time_minutes === minutes
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

                <ToggleRow
                  label="Quiz & exam reminders"
                  hint="A nudge the day before something is due."
                  on={prefs.quiz_reminders}
                  onToggle={() => update({ quiz_reminders: !prefs.quiz_reminders })}
                />
                <ToggleRow
                  label="Attendance warnings"
                  hint="When a course drops to risky or no-margin."
                  on={prefs.threshold_alerts}
                  onToggle={() => update({ threshold_alerts: !prefs.threshold_alerts })}
                />
                <ToggleRow
                  label="Unmarked-class nudges"
                  hint="A reminder when past classes are still unmarked."
                  on={prefs.unmarked_nudges}
                  onToggle={() => update({ unmarked_nudges: !prefs.unmarked_nudges })}
                />
                <ToggleRow
                  label="Planned-skip reminders"
                  hint="A last-call the day before a class you planned to skip."
                  on={prefs.planned_skip_reminders}
                  onToggle={() => update({ planned_skip_reminders: !prefs.planned_skip_reminders })}
                />
              </div>

              {/* Daily digest */}
              <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <ToggleRow
                  label="Morning digest"
                  hint="A once-a-day nudge to check today's classes."
                  on={prefs.daily_digest}
                  onToggle={() => update({ daily_digest: !prefs.daily_digest })}
                />
                {prefs.daily_digest && (
                  <label className="mt-3 flex items-center justify-between gap-3 pl-0.5 text-sm">
                    <span className="text-neutral-500">Time</span>
                    <input
                      type="time"
                      value={toInput(prefs.daily_digest_time)}
                      onChange={(e) => update({ daily_digest_time: e.target.value })}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                    />
                  </label>
                )}
              </div>

              {/* Quiet hours */}
              <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <ToggleRow
                  label="Quiet hours"
                  hint="Silence reminders that would fire during this window."
                  on={quietOn}
                  onToggle={toggleQuietHours}
                />
                {quietOn && (
                  <div className="mt-3 flex items-center gap-2 pl-0.5 text-sm">
                    <input
                      type="time"
                      value={toInput(prefs.quiet_start)}
                      onChange={(e) => update({ quiet_start: e.target.value })}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800"
                    />
                    <span className="text-neutral-500">to</span>
                    <input
                      type="time"
                      value={toInput(prefs.quiet_end)}
                      onChange={(e) => update({ quiet_end: e.target.value })}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-800"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="font-medium">Schedule &amp; calendar</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Classes follow the institute academic calendar — holidays, exam weeks, and day-order swaps (e.g. a Thursday that runs the
          Wednesday timetable) are handled automatically.
        </p>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <span className="text-sm">First-year UG student</span>
            <p className="text-xs text-neutral-500">Adds the two extra Saturday classes the calendar assigns to first-years.</p>
          </div>
          <Toggle on={firstYear} onClick={toggleFirstYear} disabled={resyncing} />
        </div>

        <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <Button variant="secondary" onClick={resyncCalendar} disabled={resyncing}>
            {resyncing ? "Re-syncing…" : "Re-sync with academic calendar"}
          </Button>
          <p className="mt-2 text-xs text-neutral-500">
            Rebuilds upcoming classes from the latest calendar. Your marked attendance is never changed.
          </p>
          {resyncMsg && <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">{resyncMsg}</p>}
        </div>
      </Card>

      <Button variant="secondary" onClick={signOut} className="mt-6 md:hidden">
        Sign out
      </Button>
    </div>
  )
}
