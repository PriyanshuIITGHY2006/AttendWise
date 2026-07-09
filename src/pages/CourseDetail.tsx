import { useEffect, useState, useCallback, useRef, useMemo, type FormEvent } from "react"
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
  unmarkAttendance,
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

  async function undoPlannedSkips(sessionIds: string[]) {
    if (!user) return
    await unmarkAttendance(sessionIds, user.id)
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
  const effectiveMaxSafeSkips = course.strict_no_skip ? 0 : safety.maxSafeSkips
  const recoverySessions =
    safety.status === "red" && safety.recoveryClassesNeeded != null
      ? futureSessions.slice(0, safety.recoveryClassesNeeded)
      : []

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course.color }} />
            <h1 className="text-xl font-semibold tracking-tight">{course.name}</h1>
            {course.course_type === "lab" && <Badge tone="neutral">Lab</Badge>}
            {course.strict_no_skip && <Badge tone="red">Zero-tolerance</Badge>}
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

      <Card className="mt-6" index={0}>
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
            <dd className="text-lg font-semibold">{safety.canReachThreshold ? effectiveMaxSafeSkips : "—"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-neutral-500">
          {course.strict_no_skip
            ? "Zero-tolerance course — this one is never included in skip suggestions, regardless of margin."
            : !safety.canReachThreshold
              ? `Even attending every remaining class, you can't reach ${course.attendance_threshold}% this semester.`
              : safety.status === "red" && safety.recoveryClassesNeeded != null
                ? `You're below the threshold. Attend the next ${safety.recoveryClassesNeeded} classes in a row to recover -- see exactly which ones below.`
                : safety.maxSafeSkips === 0
                  ? "You're exactly on the edge — no more skips possible without dropping below threshold."
                  : `You can skip up to ${safety.maxSafeSkips} more class${safety.maxSafeSkips === 1 ? "" : "es"} and stay at or above ${course.attendance_threshold}%.`}
        </p>

        {recoverySessions.length > 0 && (
          <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <p className="text-xs font-medium text-neutral-500">Recovery checklist</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recoverySessions.map((s) => (
                <span
                  key={s.id}
                  className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400"
                >
                  {new Date(s.session_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-6" index={1}>
        <h2 className="font-medium">Plan ahead</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Mark specific upcoming classes as a planned skip, or let the app suggest which ones to skip.
        </p>
        <BunkPlanner
          futureSessions={futureSessions}
          attendance={attendance}
          maxSafeSkips={safety.canReachThreshold ? effectiveMaxSafeSkips : 0}
          onMark={updateStatus}
          onApplyBulk={applyPlannedSkips}
          onUndoBulk={undoPlannedSkips}
        />
      </Card>

      <Card className="mt-6" index={2}>
        <h2 className="font-medium">Weekly schedule</h2>
        <ScheduleList courseId={course.id} />
      </Card>

      <Card className="mt-6" index={3}>
        <h2 className="font-medium">Quizzes & assignments</h2>
        <EventsList courseId={course.id} />
      </Card>

      <Card className="mt-6" index={4}>
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

const STRATEGY_META: Record<SkipStrategy, { label: string; hint: string }> = {
  spread: { label: "Spread evenly", hint: "Distribute skips across the rest of the semester" },
  concentrate: { label: "One week", hint: "Use most of the budget in a single week" },
  weekday: { label: "By weekday", hint: "Prefer a specific day, e.g. always skip Fridays" },
}

const STATUS_META: Record<AttendanceRecord["status"], { label: string; dot: string; bg: string }> = {
  present: { label: "Plan to attend", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  absent: { label: "Plan to skip", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-500/10" },
  on_duty: { label: "Approved leave", dot: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-500/10" },
  cancelled: { label: "Expect cancelled", dot: "bg-neutral-400", bg: "bg-neutral-100 dark:bg-neutral-800" },
}

function mondayOf(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function BunkPlanner({
  futureSessions,
  attendance,
  maxSafeSkips,
  onMark,
  onApplyBulk,
  onUndoBulk,
}: {
  futureSessions: Session[]
  attendance: Record<string, AttendanceRecord["status"]>
  maxSafeSkips: number
  onMark: (sessionId: string, status: AttendanceRecord["status"]) => void
  onApplyBulk: (sessionIds: string[]) => Promise<void>
  onUndoBulk: (sessionIds: string[]) => Promise<void>
}) {
  const [strategy, setStrategy] = useState<SkipStrategy>("spread")
  const [weekStart, setWeekStart] = useState("")
  const [weekEnd, setWeekEnd] = useState("")
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [applying, setApplying] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [lastApplied, setLastApplied] = useState<string[] | null>(null)
  const [undoing, setUndoing] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openId) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpenId(null)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [openId])

  const plannedSkipCount = futureSessions.filter((s) => attendance[s.id] === "absent").length
  const budgetRemaining = Math.max(0, maxSafeSkips - plannedSkipCount)
  const budgetUsedPercent = maxSafeSkips === 0 ? 100 : Math.min(100, (plannedSkipCount / maxSafeSkips) * 100)

  const suggested = useMemo(() => {
    if (strategy === "concentrate" && (!weekStart || !weekEnd)) return []
    const unmarked = futureSessions.filter((s) => !attendance[s.id]).map((s) => ({ id: s.id, date: s.session_date }))
    return suggestSkipSessions(unmarked, budgetRemaining, strategy, { weekStart, weekEnd, dayOfWeek })
  }, [strategy, weekStart, weekEnd, dayOfWeek, budgetRemaining, futureSessions, attendance])

  async function apply() {
    setApplying(true)
    await onApplyBulk(suggested)
    setLastApplied(suggested)
    setApplying(false)
  }

  async function undo() {
    if (!lastApplied) return
    setUndoing(true)
    await onUndoBulk(lastApplied)
    setLastApplied(null)
    setUndoing(false)
  }

  // one row per week, one column per weekday (Mon..Sun) -- a course that meets
  // twice on the same day stacks both sessions in that single cell instead of
  // spilling into loose, unevenly wrapped chips
  const weeks = useMemo(() => {
    const groups = new Map<string, Session[][]>()
    for (const s of futureSessions) {
      const key = mondayOf(s.session_date)
      if (!groups.has(key)) groups.set(key, Array.from({ length: 7 }, () => []))
      const dow = (new Date(`${s.session_date}T00:00:00`).getDay() + 6) % 7
      groups.get(key)![dow].push(s)
    }
    return [...groups.entries()]
  }, [futureSessions])

  if (futureSessions.length === 0) {
    return <p className="mt-3 text-sm text-neutral-500">No upcoming sessions yet.</p>
  }

  return (
    <div className="mt-4">
      {/* budget */}
      <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-baseline justify-between text-sm">
          <span>
            <span className="font-semibold">{budgetRemaining}</span> safe skip{budgetRemaining === 1 ? "" : "s"} left to plan
          </span>
          {plannedSkipCount > 0 && <span className="text-neutral-500">{plannedSkipCount} planned</span>}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${budgetUsedPercent}%` }} />
        </div>

        {/* strategy picker */}
        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {(Object.entries(STRATEGY_META) as [SkipStrategy, (typeof STRATEGY_META)[SkipStrategy]][]).map(([value, meta]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStrategy(value)}
              className={`rounded-md px-2 py-2 text-left text-xs font-medium transition-colors ${
                strategy === value
                  ? "bg-indigo-600 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              }`}
            >
              {meta.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-neutral-400">{STRATEGY_META[strategy].hint}</p>

        {strategy === "concentrate" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="w-auto" />
            <span className="text-sm text-neutral-400">to</span>
            <Input type="date" value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} className="w-auto" />
          </div>
        )}

        {strategy === "weekday" && (
          <div className="mt-3 flex gap-1.5">
            {DAY_NAMES.map((d, idx) => (
              <button
                key={d}
                type="button"
                onClick={() => setDayOfWeek(idx)}
                className={`h-8 w-8 rounded-full text-xs font-medium transition-colors ${
                  dayOfWeek === idx
                    ? "bg-indigo-600 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                }`}
              >
                {d[0]}
              </button>
            ))}
          </div>
        )}

        {suggested.length > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-sm dark:bg-amber-500/10">
            <span>
              {suggested.length} class{suggested.length === 1 ? "" : "es"} suggested — highlighted below
            </span>
            <Button type="button" onClick={apply} disabled={applying}>
              {applying ? "Applying…" : "Apply"}
            </Button>
          </div>
        )}

        {lastApplied && lastApplied.length > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-md bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800">
            <span>
              Applied {lastApplied.length} planned skip{lastApplied.length === 1 ? "" : "s"}.
            </span>
            <button
              type="button"
              onClick={undo}
              disabled={undoing}
              className="font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
            >
              {undoing ? "Undoing…" : "Undo"}
            </button>
          </div>
        )}
      </div>

      {/* full-width week grid: one column per weekday, so the row always
          fills the available space instead of shrink-wrapping to however
          many sessions happen to fall that week */}
      <div className="mt-4">
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium uppercase text-neutral-400">
          {DAY_NAMES.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="mt-1.5 space-y-1.5">
          {weeks.map(([weekKey, dayBuckets], weekIdx) => {
            const monthLabel = new Date(`${weekKey}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
            const prevMonthLabel =
              weekIdx > 0
                ? new Date(`${weeks[weekIdx - 1][0]}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
                : null

            return (
              <div key={weekKey}>
                {monthLabel !== prevMonthLabel && (
                  <h3 className="mb-1 mt-3 text-xs font-medium text-neutral-400 first:mt-0">{monthLabel}</h3>
                )}
                <div className="grid grid-cols-7 gap-1.5">
                  {dayBuckets.map((daySessions, dayIdx) => (
                    <div key={dayIdx} className="flex flex-col gap-1">
                      {daySessions.map((s) => {
                        const status = attendance[s.id]
                        const isSuggested = !status && suggested.includes(s.id)
                        return (
                          <div key={s.id} className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenId(openId === s.id ? null : s.id)}
                              className={`flex w-full flex-col items-center rounded-lg border px-1 py-1.5 text-center transition-colors ${
                                status ? STATUS_META[status].bg : "bg-white dark:bg-neutral-900"
                              } ${
                                isSuggested
                                  ? "border-dashed border-amber-400"
                                  : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500"
                              }`}
                            >
                              <span className="text-sm font-semibold">{new Date(s.session_date).getDate()}</span>
                              <span className="text-[10px] text-neutral-500">{s.start_time.slice(0, 5)}</span>
                              {status && <span className={`mt-1 h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`} />}
                              {isSuggested && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400" />}
                            </button>

                            {openId === s.id && (
                              <div
                                ref={popoverRef}
                                className="absolute left-1/2 top-full z-10 mt-1 w-44 -translate-x-1/2 rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
                              >
                                {(
                                  Object.entries(STATUS_META) as [
                                    AttendanceRecord["status"],
                                    (typeof STATUS_META)[AttendanceRecord["status"]],
                                  ][]
                                ).map(([value, meta]) => (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                      onMark(s.id, value)
                                      setOpenId(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                                    {meta.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
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
