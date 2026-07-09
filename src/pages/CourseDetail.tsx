import { useEffect, useState, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import {
  getCourse,
  getCourseStats,
  listSessionsForCourse,
  listAttendanceForCourse,
  listSchedule,
  markAttendance,
  deleteCourse,
  type Course,
  type CourseStats,
  type Session,
  type AttendanceRecord,
  type CourseSchedule,
} from "../features/courses/api"
import { computeBunkSafety } from "../features/attendance/bunkSafety"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"

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

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course.color }} />
            <h1 className="text-xl font-semibold tracking-tight">{course.name}</h1>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {[course.code, course.instructor, course.semester].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button variant="ghost" onClick={handleDelete}>
          Delete
        </Button>
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
        <h2 className="font-medium">Weekly schedule</h2>
        <ScheduleList courseId={course.id} />
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
