import { useEffect, useState, useCallback } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { listTodaySessions, markAttendance, listCourses, listUnmarkedPastSessions } from "../features/courses/api"
import { listUpcomingEvents, type CourseEvent } from "../features/events/api"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"

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

export function Dashboard() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<TodaySession[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([])
  const [unmarked, setUnmarked] = useState<UnmarkedSession[]>([])
  const [showUnmarked, setShowUnmarked] = useState(false)
  const [courseCount, setCourseCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [today, courses, events, unmarkedPast] = await Promise.all([
      listTodaySessions(user.id, todayISO()),
      listCourses(user.id),
      listUpcomingEvents(user.id),
      listUnmarkedPastSessions(),
    ])
    setSessions(today)
    setCourseCount(courses.length)
    setUpcoming((events as UpcomingEvent[]).slice(0, 6))
    setUnmarked(unmarkedPast)
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function mark(sessionId: string, status: "present" | "absent") {
    if (!user) return
    await markAttendance(sessionId, user.id, status)
    load()
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>

  if (courseCount === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight">Today</h1>
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
      <h1 className="text-xl font-semibold tracking-tight">Today</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
      </p>

      {unmarked.length > 0 && (
        <Card className="mt-6 bg-amber-50 dark:bg-amber-500/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {unmarked.length} class{unmarked.length === 1 ? "" : "es"} from earlier {unmarked.length === 1 ? "wasn't" : "weren't"}{" "}
              marked present or absent — this quietly skews your safe-skip numbers.
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
                <div key={s.session_id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.course_color }} />
                    <span className="truncate font-medium">{s.course_name}</span>
                    <span className="shrink-0 text-neutral-500">
                      {new Date(s.session_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" onClick={() => mark(s.session_id, "absent")}>
                      Absent
                    </Button>
                    <Button onClick={() => mark(s.session_id, "present")}>Present</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {sessions.length === 0 ? (
            <Card>
              <p className="text-sm text-neutral-500">No classes scheduled today.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {sessions.map((s, i) => {
                const myRecord = s.attendance_records?.[0]
                return (
                  <Card key={s.id} index={i} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.courses.color }} />
                        <span className="truncate font-medium">{s.courses.name}</span>
                        <Badge tone="neutral">{s.component_type}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-neutral-500">
                        {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      </p>
                    </div>
                    {myRecord ? (
                      <Badge tone={myRecord.status === "present" ? "green" : "red"}>
                        {myRecord.status === "present" ? "Marked present" : "Marked absent"}
                      </Badge>
                    ) : (
                      <div className="flex shrink-0 gap-2">
                        <Button variant="secondary" onClick={() => mark(s.id, "absent")}>
                          Absent
                        </Button>
                        <Button onClick={() => mark(s.id, "present")}>Present</Button>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-medium text-neutral-500">Upcoming</h2>
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
