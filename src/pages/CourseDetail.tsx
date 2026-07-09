import { useEffect, useState, useCallback, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import {
  getCourse,
  getCourseStats,
  listSessionsForCourse,
  listAttendanceForCourse,
  listSchedule,
  markAttendance,
  markAttendanceBulk,
  deleteCourse,
  type Course,
  type CourseStats,
  type Session,
  type AttendanceRecord,
  type CourseSchedule,
} from "../features/courses/api"
import { listEventsForCourse, createEvent, deleteEvent, type CourseEvent } from "../features/events/api"
import { computeBunkSafety, suggestSkipSessions, type SkipStrategy } from "../features/attendance/bunkSafety"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"
import { Input, Label } from "../components/ui/Input"

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function CourseDetail() {
  const { courseId } = useParams<{ courseId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [course, setCourse] = useState<Course | null>(null)
  const [stats, setStats] = useState<CourseStats | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord["status"]>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!courseId || !user) return
    setLoading(true)
    const [c, s, sess, att] = await Promise.all([
      getCourse(courseId),
      getCourseStats(courseId, user.id),
      listSessionsForCourse(courseId),
      listAttendanceForCourse(courseId, user.id),
    ])
    setCourse(c)
    setStats(s)
    setSessions(sess)
    setAttendance(Object.fromEntries(att.map((a) => [a.session_id, a.status])))
    setLoading(false)
  }, [courseId, user])

  useEffect(() => {
    load()
  }, [load])

  async function updateStatus(sessionId: string, status: AttendanceRecord["status"]) {
    if (!user) return
    await markAttendance(sessionId, user.id, status)
    load()
  }

  async function applyPlannedSkips(sessionIds: string[]) {
    if (!user) return
    await markAttendanceBulk(sessionIds, user.id, "absent")
    load()
  }

  async function handleDelete() {
    if (!courseId) return
    if (!confirm("Delete this course and all its attendance history? This cannot be undone.")) return
    await deleteCourse(courseId)
    navigate("/courses")
  }

  if (loading || !course || !stats) return <p className="text-sm text-neutral-400">Loading…</p>

  const safety = computeBunkSafety({
    attended: stats.attended,
    absent: stats.absent,
    remainingSessions: stats.remainingSessions,
    thresholdPercent: course.attendance_threshold,
  })

  const todayISO = new Date().toISOString().slice(0, 10)
  const pastSessions = sessions.filter((s) => s.session_date <= todayISO).reverse()
  const futureSessions = sessions.filter((s) => s.session_date > todayISO)

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course.color }} />
            <h1 className="text-xl font-semibold tracking-tight">{course.name}</h1>
            {course.course_type === "lab" && <Badge tone="neutral">Lab</Badge>}
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {[course.code, course.instructor, course.semester].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to={`/courses/${course.id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <Button variant="ghost" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Attendance</h2>
          <Badge tone={safety.status}>{safety.currentPercent.toFixed(1)}% of {course.attendance_threshold}% required</Badge>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-neutral-500">Attended</dt>
            <dd className="text-lg font-semibold">{stats.attended}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Missed</dt>
            <dd className="text-lg font-semibold">{stats.absent}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Remaining</dt>
            <dd className="text-lg font-semibold">{stats.remainingSessions}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Safe skips left</dt>
            <dd className="text-lg font-semibold">{safety.canReachThreshold ? safety.maxSafeSkips : "—"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-neutral-500">
          {!safety.canReachThreshold
            ? `Even attending every remaining class, you can't reach ${course.attendance_threshold}% this semester.`
            : safety.status === "red" && safety.recoveryClassesNeeded != null
              ? `You're below the threshold. Attend the next ${safety.recoveryClassesNeeded} classes in a row to recover.`
              : safety.maxSafeSkips === 0
                ? "You're exactly on the edge — no more skips possible without dropping below threshold."
                : `You can skip up to ${safety.maxSafeSkips} more class${safety.maxSafeSkips === 1 ? "" : "es"} and stay at or above ${course.attendance_threshold}%.`}
        </p>
      </Card>

      <Card className="mt-6">
        <h2 className="font-medium">Plan ahead</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Mark specific upcoming classes as a planned skip, or let the app suggest which ones to skip.
        </p>
        <BunkPlanner
          futureSessions={futureSessions}
          attendance={attendance}
          maxSafeSkips={safety.canReachThreshold ? safety.maxSafeSkips : 0}
          onMark={updateStatus}
          onApplyBulk={applyPlannedSkips}
        />
      </Card>

      <Card className="mt-6">
        <h2 className="font-medium">Weekly schedule</h2>
        <ScheduleList courseId={course.id} />
      </Card>

      <Card className="mt-6">
        <h2 className="font-medium">Quizzes & assignments</h2>
        <EventsList courseId={course.id} />
      </Card>

      <Card className="mt-6">
        <h2 className="font-medium">History</h2>
        {pastSessions.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No past sessions yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
            {pastSessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium">
                    {new Date(s.session_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <span className="ml-2 text-neutral-500">
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.component_type}
                  </span>
                </div>
                <select
                  value={attendance[s.id] ?? ""}
                  onChange={(e) => updateStatus(s.id, e.target.value as AttendanceRecord["status"])}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="" disabled>
                    Not marked
                  </option>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="on_duty">On duty / medical</option>
                  <option value="cancelled">Class cancelled</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

const STRATEGY_LABELS: Record<SkipStrategy, string> = {
  spread: "Spread evenly across the semester",
  concentrate: "Concentrate in one week",
  weekday: "Prefer a specific weekday",
}

function BunkPlanner({
  futureSessions,
  attendance,
  maxSafeSkips,
  onMark,
  onApplyBulk,
}: {
  futureSessions: Session[]
  attendance: Record<string, AttendanceRecord["status"]>
  maxSafeSkips: number
  onMark: (sessionId: string, status: AttendanceRecord["status"]) => void
  onApplyBulk: (sessionIds: string[]) => Promise<void>
}) {
  const [strategy, setStrategy] = useState<SkipStrategy>("spread")
  const [weekStart, setWeekStart] = useState("")
  const [weekEnd, setWeekEnd] = useState("")
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [suggested, setSuggested] = useState<string[]>([])
  const [applying, setApplying] = useState(false)

  const plannedSkipCount = futureSessions.filter((s) => attendance[s.id] === "absent").length
  const budgetRemaining = Math.max(0, maxSafeSkips - plannedSkipCount)

  function runSuggestion() {
    const unmarked = futureSessions.filter((s) => !attendance[s.id]).map((s) => ({ id: s.id, date: s.session_date }))
    setSuggested(suggestSkipSessions(unmarked, budgetRemaining, strategy, { weekStart, weekEnd, dayOfWeek }))
  }

  async function apply() {
    setApplying(true)
    await onApplyBulk(suggested)
    setSuggested([])
    setApplying(false)
  }

  if (futureSessions.length === 0) {
    return <p className="mt-3 text-sm text-neutral-500">No upcoming sessions yet.</p>
  }

  return (
    <div className="mt-4">
      <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="text-sm">
          <span className="font-medium">{budgetRemaining}</span> safe skip{budgetRemaining === 1 ? "" : "s"} left to plan
          {plannedSkipCount > 0 && ` (${plannedSkipCount} already planned)`}.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as SkipStrategy)}
            className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {(Object.entries(STRATEGY_LABELS) as [SkipStrategy, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {strategy === "concentrate" && (
            <>
              <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="w-auto" />
              <span className="text-sm text-neutral-400">to</span>
              <Input type="date" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} className="w-auto" />
            </>
          )}

          {strategy === "weekday" && (
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {DAY_NAMES.map((d, idx) => (
                <option key={d} value={idx}>
                  {d}
                </option>
              ))}
            </select>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={runSuggestion}
            disabled={budgetRemaining === 0 || (strategy === "concentrate" && (!weekStart || !weekEnd))}
          >
            Suggest
          </Button>
        </div>

        {suggested.length > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-sm dark:bg-amber-500/10">
            <span>
              {suggested.length} class{suggested.length === 1 ? "" : "es"} suggested to skip
            </span>
            <Button type="button" onClick={apply} disabled={applying}>
              {applying ? "Applying…" : "Apply"}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
        {futureSessions.map((s) => (
          <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {new Date(s.session_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <span className="text-neutral-500">
                {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.component_type}
              </span>
              {suggested.includes(s.id) && <Badge tone="yellow">Suggested skip</Badge>}
            </div>
            <select
              value={attendance[s.id] ?? ""}
              onChange={(e) => onMark(s.id, e.target.value as AttendanceRecord["status"])}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="">No plan yet</option>
              <option value="present">Plan to attend</option>
              <option value="absent">Plan to skip</option>
              <option value="on_duty">Approved leave (won't count against me)</option>
              <option value="cancelled">Expect class cancelled</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

const EVENT_TYPE_LABELS: Record<CourseEvent["event_type"], string> = {
  quiz: "Quiz",
  assignment: "Assignment",
  exam: "Exam",
  other: "Other",
}

function EventsList({ courseId }: { courseId: string }) {
  const { user } = useAuth()
  const [events, setEvents] = useState<CourseEvent[] | null>(null)
  const [title, setTitle] = useState("")
  const [eventType, setEventType] = useState<CourseEvent["event_type"]>("quiz")
  const [eventDate, setEventDate] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    listEventsForCourse(courseId).then(setEvents)
  }, [courseId])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!user || !eventDate) return
    setSubmitting(true)
    await createEvent({ course_id: courseId, user_id: user.id, title, event_type: eventType, event_date: eventDate })
    setTitle("")
    setEventDate("")
    setSubmitting(false)
    load()
  }

  async function handleDelete(id: string) {
    await deleteEvent(id)
    load()
  }

  const todayISO = new Date().toISOString().slice(0, 10)

  return (
    <div className="mt-3">
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <Label htmlFor="eventTitle">Title</Label>
          <Input id="eventTitle" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz 2" />
        </div>
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value as CourseEvent["event_type"])}
          className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Input type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-auto" />
        <Button type="submit" disabled={submitting} variant="secondary">
          Add
        </Button>
      </form>

      {events === null ? (
        <p className="mt-3 text-sm text-neutral-400">Loading…</p>
      ) : events.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Nothing added yet.</p>
      ) : (
        <div className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between py-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge tone={ev.event_date < todayISO ? "neutral" : "yellow"}>{EVENT_TYPE_LABELS[ev.event_type]}</Badge>
                <span className="font-medium">{ev.title}</span>
                <span className="text-neutral-500">
                  {new Date(ev.event_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
              <button onClick={() => handleDelete(ev.id)} className="text-neutral-400 hover:text-red-600">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleList({ courseId }: { courseId: string }) {
  const [slots, setSlots] = useState<CourseSchedule[] | null>(null)

  useEffect(() => {
    listSchedule(courseId).then(setSlots)
  }, [courseId])

  if (!slots) return <p className="mt-3 text-sm text-neutral-400">Loading…</p>
  if (slots.length === 0) return <p className="mt-3 text-sm text-neutral-500">No schedule set.</p>

  return (
    <div className="mt-3 space-y-1.5 text-sm">
      {slots.map((s) => (
        <div key={s.id} className="flex items-center justify-between">
          <span>
            {DAY_NAMES[s.day_of_week]} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {s.component_type}
          </span>
          {s.room && <span className="text-neutral-500">{s.room}</span>}
        </div>
      ))}
    </div>
  )
}
