import { useEffect, useState, useCallback, useMemo } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { listTodaySessions, markAttendance, listCourses, listUnmarkedPastSessions, getAllCourseStats, EMPTY_COURSE_STATS, listUpcomingPlannedSkips, listUpcomingClassesForNotify } from "../features/courses/api"
import { listUpcomingEvents, type CourseEvent } from "../features/events/api"
import { computeBunkSafety, computeSkipVerdict, type SkipVerdict } from "../features/attendance/bunkSafety"
import { unmarkedNudge } from "../features/notifications/copy"
import { getGlobalNotificationSettings } from "../features/notifications/api"
import { syncScheduledNotifications, notifyThresholdIfChanged, notifyUnmarkedIfNeeded } from "../features/notifications/schedule"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"
import { tapFeedback } from "../lib/haptics"

type TodaySession = Awaited<ReturnType<typeof listTodaySessions>>[number]
type UpcomingEvent = CourseEvent & { courses: { name: string; color: string } | null }
type UnmarkedSession = Awaited<ReturnType<typeof listUnmarkedPastSessions>>[number]

const EVENT_TYPE_LABELS: Record<CourseEvent["event_type"], string> = {
  quiz: "Quiz",
  assignment: "Assignment",
  exam: "Exam",
  other: "Other",
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function fmtCountdown(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 1) return "now"
  if (min < 60) return `in ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `in ${h}h ${m}m` : `in ${h}h`
}

// PostgREST may type a to-one embed as an object or a single-element array;
// normalise to the room string either way.
function roomOf(s: { course_schedule?: { room: string | null } | { room: string | null }[] | null }): string | null {
  const cs = s.course_schedule
  if (!cs) return null
  return (Array.isArray(cs) ? cs[0]?.room : cs.room) ?? null
}

export function Dashboard() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<TodaySession[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([])
  const [unmarked, setUnmarked] = useState<UnmarkedSession[]>([])
  const [showUnmarked, setShowUnmarked] = useState(false)
  const [courseCount, setCourseCount] = useState<number | null>(null)
  const [verdicts, setVerdicts] = useState<Record<string, SkipVerdict>>({})
  const [loading, setLoading] = useState(true)
  const [statusMenu, setStatusMenu] = useState<string | null>(null) // session id whose extra-status menu is open
  const [now, setNow] = useState(() => Date.now())

  // Tick every 30s so the "next class" countdown stays live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Close the per-card status menu on any outside click.
  useEffect(() => {
    if (!statusMenu) return
    const close = () => setStatusMenu(null)
    // Defer so the opening click doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("click", close), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener("click", close)
    }
  }, [statusMenu])

  // The next class today that hasn't started yet (sessions are start-time sorted).
  const nextClass = useMemo(() => {
    for (const s of sessions) {
      const start = new Date(`${s.session_date}T${s.start_time}`).getTime()
      if (start > now) return { session: s, start }
    }
    return null
  }, [sessions, now])

  // Fetches fresh data and updates state -- used both for the initial load
  // and for silent refreshes after marking attendance. Never toggles the
  // page-level `loading` flag itself, so a refresh updates in place instead
  // of blanking the whole page back to a loading state.
  const fetchData = useCallback(async () => {
    if (!user) return null
    // All course stats come from one bulk RPC now, shared by the verdicts below
    // and the notification sync -- no per-course stats waterfall on either.
    const [today, courses, events, unmarkedPast, statsMap] = await Promise.all([
      listTodaySessions(user.id, todayISO()),
      listCourses(user.id),
      listUpcomingEvents(user.id),
      listUnmarkedPastSessions(),
      getAllCourseStats(),
    ])
    setSessions(today)
    setCourseCount(courses.length)
    setUpcoming((events as UpcomingEvent[]).slice(0, 6))
    setUnmarked(unmarkedPast)

    // one verdict per course among today's still-unmarked sessions, so each
    // card can show "safe to skip" without navigating to the day-off planner
    const unmarkedToday = today.filter((s) => !s.attendance_records?.[0])
    const byCourse = new Map<string, TodaySession[]>()
    for (const s of unmarkedToday) {
      if (!byCourse.has(s.course_id)) byCourse.set(s.course_id, [])
      byCourse.get(s.course_id)!.push(s)
    }
    const verdictEntries = [...byCourse.entries()].map(([courseId, courseSessions]) => {
      const course = courseSessions[0].courses
      const stats = statsMap.get(courseId) ?? EMPTY_COURSE_STATS
      const verdict = computeSkipVerdict(
        {
          attended: stats.attended,
          absent: stats.absent,
          remainingSessions: stats.remainingSessions,
          thresholdPercent: course.attendance_threshold,
          strictNoSkip: course.strict_no_skip,
          alreadyPlannedSkips: stats.plannedFutureSkips,
        },
        courseSessions.length,
      )
      return [courseId, verdict] as const
    })
    setVerdicts(Object.fromEntries(verdictEntries))
    return { today, courses, events: events as UpcomingEvent[], unmarkedPast, statsMap }
  }, [user])

  // Notification scheduling only needs to run once per app open, not after
  // every attendance tap -- it's a handful of extra DB queries plus native
  // bridge calls, which made every button press feel sluggish when it ran
  // on every refresh.
  const syncNotifications = useCallback(
    async (data: NonNullable<Awaited<ReturnType<typeof fetchData>>>) => {
      if (!user) return
      const prefs = await getGlobalNotificationSettings(user.id)
      // Fetch a rolling week of unmarked classes so reminders are queued ahead
      // and fire in the background even without reopening the app. Skipped when
      // muted or class reminders are off, to avoid a needless query.
      const [plannedSkips, upcomingClasses] = await Promise.all([
        prefs.muted || !prefs.planned_skip_reminders ? Promise.resolve([]) : listUpcomingPlannedSkips(user.id),
        prefs.muted || !prefs.class_reminders ? Promise.resolve([]) : listUpcomingClassesForNotify(user.id, 7),
      ])
      // The engine itself no-ops when muted (after clearing pending), so we
      // still call it while muted to flush anything previously scheduled.
      await syncScheduledNotifications({
        upcomingClasses,
        upcomingEvents: data.events.map((ev) => ({
          id: ev.id,
          title: ev.title,
          courseName: ev.courses?.name ?? "",
          eventDateISO: ev.event_date,
        })),
        plannedSkips,
        prefs,
        userId: user.id,
      })
      if (prefs.muted) return
      await notifyUnmarkedIfNeeded(data.unmarkedPast.length, prefs)
      await Promise.all(
        data.courses.map(async (course) => {
          const stats = data.statsMap.get(course.id) ?? EMPTY_COURSE_STATS
          const safety = computeBunkSafety({
            attended: stats.attended,
            absent: stats.absent,
            remainingSessions: stats.remainingSessions,
            thresholdPercent: course.attendance_threshold,
          })
          await notifyThresholdIfChanged(course.id, course.name, safety.currentPercent, safety.status, prefs)
        }),
      )
    },
    [user],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchData().then((data) => {
      if (cancelled) return
      setLoading(false)
      if (data) syncNotifications(data)
    })
    return () => {
      cancelled = true
    }
  }, [fetchData, syncNotifications])

  async function mark(sessionId: string, status: "present" | "absent" | "on_duty" | "cancelled") {
    if (!user) return
    tapFeedback()
    setStatusMenu(null)
    await markAttendance(sessionId, user.id, status)
    fetchData()
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>

  if (courseCount === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <Card className="mt-6">
          <p className="text-sm text-neutral-500">
            No courses yet.{" "}
            <Link to="/courses" className="font-medium text-indigo-600 underline dark:text-indigo-400">
              Add your first course
            </Link>{" "}
            to start tracking attendance.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <Link
          to="/insights"
          className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Insights
        </Link>
      </div>

      {nextClass && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Next class</p>
            <p className="mt-0.5 flex items-center gap-2 font-medium">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: nextClass.session.courses.color }} />
              <span className="truncate">{nextClass.session.courses.name}</span>
            </p>
            <p className="mt-0.5 truncate text-sm text-neutral-500">
              {nextClass.session.start_time.slice(0, 5)}
              {roomOf(nextClass.session) ? ` · Room ${roomOf(nextClass.session)}` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-indigo-700 shadow-sm dark:bg-neutral-900 dark:text-indigo-300">
            {fmtCountdown(nextClass.start - now)}
          </span>
        </div>
      )}

      {unmarked.length > 0 && (
        <Card className="mt-6 bg-amber-50 dark:bg-amber-500/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {unmarkedNudge(unmarked.length, `unmarked-${user?.id ?? ""}-${todayISO()}`)}
            </p>
            <button
              type="button"
              onClick={() => setShowUnmarked((v) => !v)}
              className="shrink-0 text-sm font-medium text-amber-800 hover:underline dark:text-amber-300"
            >
              {showUnmarked ? "Hide" : "Mark now"}
            </button>
          </div>
          {showUnmarked && (
            <div className="mt-3 space-y-2 border-t border-amber-200 pt-3 dark:border-amber-500/20">
              {unmarked.map((s) => (
                <div
                  key={s.session_id}
                  className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.course_color }} />
                    <span className="truncate font-medium">{s.course_name}</span>
                    <span className="shrink-0 text-neutral-500">
                      {new Date(s.session_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="flex gap-2 sm:shrink-0">
                    <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => mark(s.session_id, "absent")}>
                      Absent
                    </Button>
                    <Button className="flex-1 sm:flex-none" onClick={() => mark(s.session_id, "present")}>
                      Present
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {sessions.length === 0 ? (
            <Card>
              <p className="text-sm text-neutral-500">No classes scheduled today.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {sessions.map((s, i) => {
                const myRecord = s.attendance_records?.[0]
                const verdict = verdicts[s.course_id]
                return (
                  <Card
                    key={s.id}
                    index={i}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.courses.color }} />
                        <span className="truncate font-medium">{s.courses.name}</span>
                        <Badge tone="neutral">{s.component_type}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-neutral-500">
                        {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        {roomOf(s) ? ` · Room ${roomOf(s)}` : ""}
                      </p>
                    </div>
                    {myRecord ? (
                      <Badge
                        tone={
                          myRecord.status === "present" ? "green" : myRecord.status === "absent" ? "red" : myRecord.status === "on_duty" ? "yellow" : "neutral"
                        }
                      >
                        {myRecord.status === "present"
                          ? "Marked present"
                          : myRecord.status === "absent"
                            ? "Marked absent"
                            : myRecord.status === "on_duty"
                              ? "On duty"
                              : "Class cancelled"}
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                        {verdict && (
                          <Badge tone={s.courses.strict_no_skip ? "red" : verdict.safeCount > 0 ? "green" : "red"}>
                            {s.courses.strict_no_skip ? "Zero-tolerance" : verdict.safeCount > 0 ? "Safe to skip" : "Risky to skip"}
                          </Badge>
                        )}
                        <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => mark(s.id, "absent")}>
                          Absent
                        </Button>
                        <Button className="flex-1 sm:flex-none" onClick={() => mark(s.id, "present")}>
                          Present
                        </Button>
                        <div className="relative shrink-0">
                          <button
                            onClick={() => setStatusMenu(statusMenu === s.id ? null : s.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                            aria-label="More statuses"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                          </button>
                          {statusMenu === s.id && (
                            <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                              <button onClick={() => mark(s.id, "on_duty")} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> On duty / medical
                              </button>
                              <button onClick={() => mark(s.id, "cancelled")} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" /> Class cancelled
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-500">Upcoming</h2>
            <Link to="/deadlines" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              All deadlines →
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {upcoming.length === 0 ? (
              <Card>
                <p className="text-sm text-neutral-500">Nothing coming up.</p>
              </Card>
            ) : (
              upcoming.map((ev, i) => (
                <Card key={ev.id} index={sessions.length + i} className="py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {ev.courses && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ev.courses.color }} />}
                    <span className="truncate text-sm font-medium">{ev.title}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="truncate text-xs text-neutral-500">{ev.courses?.name}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="yellow">{EVENT_TYPE_LABELS[ev.event_type]}</Badge>
                      <span className="text-xs text-neutral-500">
                        {new Date(ev.event_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
