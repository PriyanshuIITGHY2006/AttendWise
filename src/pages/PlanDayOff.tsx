import { useEffect, useMemo, useState, useCallback } from "react"
import { useAuth } from "../context/AuthContext"
import { listSessionsInRange } from "../features/planner/api"
import { getCourseStats, markAttendanceBulk, unmarkAttendance } from "../features/courses/api"
import { listEventsForCourse } from "../features/events/api"
import { findNearbyEvent, type ProximityEvent } from "../features/events/proximity"
import { computeSkipVerdict } from "../features/attendance/bunkSafety"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"
import { Input, Label } from "../components/ui/Input"

type RangeSession = Awaited<ReturnType<typeof listSessionsInRange>>[number]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

type CourseVerdict = {
  courseId: string
  name: string
  color: string
  strict: boolean
  sessions: RangeSession[]
  unmarked: RangeSession[]
  safeCount: number
  canReachThreshold: boolean
  nearbyEvent: ProximityEvent | null
}

export function PlanDayOff() {
  const { user } = useAuth()
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [sessions, setSessions] = useState<RangeSession[]>([])
  const [verdicts, setVerdicts] = useState<CourseVerdict[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [applyingCourseId, setApplyingCourseId] = useState<string | null>(null)
  // remembers what each course just applied, so it can be undone in one tap
  const [appliedByCourse, setAppliedByCourse] = useState<Record<string, string[]>>({})

  // Doesn't touch `loading` itself -- see the mount effect and markSafeSkips,
  // which use it differently so applying a skip doesn't blank the whole list
  // back to "Checking every course…" on every tap.
  const load = useCallback(async () => {
    if (!user || !from || !to || to < from) return
    const range = await listSessionsInRange(user.id, from, to)
    setSessions(range)

    const byCourse = new Map<string, RangeSession[]>()
    for (const s of range) {
      if (!byCourse.has(s.course_id)) byCourse.set(s.course_id, [])
      byCourse.get(s.course_id)!.push(s)
    }

    const results = await Promise.all(
      [...byCourse.entries()].map(async ([courseId, courseSessions]) => {
        const course = courseSessions[0].courses
        const [stats, events] = await Promise.all([getCourseStats(courseId, user.id), listEventsForCourse(courseId)])
        const unmarked = courseSessions.filter((s) => !s.attendance_records?.[0])
        const { safety, safeCount } = computeSkipVerdict(
          {
            attended: stats.attended,
            absent: stats.absent,
            remainingSessions: stats.remainingSessions,
            thresholdPercent: course.attendance_threshold,
            strictNoSkip: course.strict_no_skip,
            // reserve budget for skips already planned anywhere in the course --
            // unmarked (the candidates here) are records-free, so they never
            // overlap these, and no skip gets offered twice
            alreadyPlannedSkips: stats.plannedFutureSkips,
          },
          unmarked.length,
        )
        const nearbyEvent = unmarked.reduce<ProximityEvent | null>(
          (found, s) => found ?? findNearbyEvent(s.session_date, events),
          null,
        )
        return {
          courseId,
          name: course.name,
          color: course.color,
          strict: course.strict_no_skip,
          sessions: courseSessions,
          unmarked,
          safeCount,
          canReachThreshold: safety.canReachThreshold,
          nearbyEvent,
        }
      }),
    )
    setVerdicts(results)
  }, [user, from, to])

  useEffect(() => {
    setLoading(true)
    load().then(() => setLoading(false))
  }, [load])

  async function markSafeSkips(v: CourseVerdict) {
    if (!user) return
    setApplyingCourseId(v.courseId)
    const toSkip = v.unmarked.slice(0, v.safeCount).map((s) => s.id)
    await markAttendanceBulk(toSkip, user.id, "absent")
    setAppliedByCourse((prev) => ({ ...prev, [v.courseId]: toSkip }))
    await load()
    setApplyingCourseId(null)
  }

  async function undoSafeSkips(courseId: string) {
    if (!user) return
    const ids = appliedByCourse[courseId]
    if (!ids?.length) return
    setApplyingCourseId(courseId)
    await unmarkAttendance(ids, user.id)
    setAppliedByCourse((prev) => {
      const next = { ...prev }
      delete next[courseId]
      return next
    })
    await load()
    setApplyingCourseId(null)
  }

  const isSingleDay = from === to
  const totalUnmarked = useMemo(() => (verdicts ?? []).reduce((n, v) => n + v.unmarked.length, 0), [verdicts])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Plan a day off</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Pick a date, or a range for a trip, and see the verdict across every course at once instead of checking each one separately.
      </p>

      <Card className="mt-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
          </div>
        </div>
        {to < from && <p className="mt-2 text-sm text-red-600 dark:text-red-400">End date must be on or after the start date.</p>}
      </Card>

      {loading ? (
        <p className="mt-6 text-sm text-neutral-400">Checking every course…</p>
      ) : sessions.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm text-neutral-500">
            No classes scheduled {isSingleDay ? "that day" : "in that range"} across any course.
          </p>
        </Card>
      ) : (
        <div className="mt-6 space-y-3">
          {verdicts?.map((v, i) => (
            <Card key={v.courseId} index={i}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: v.color }} />
                  <span className="font-medium">{v.name}</span>
                  {v.strict && <Badge tone="neutral">Zero-tolerance</Badge>}
                </div>
                {v.strict ? (
                  <Badge tone="red">Attend all {v.sessions.length}</Badge>
                ) : !v.canReachThreshold ? (
                  <Badge tone="red">Already at risk</Badge>
                ) : v.safeCount >= v.unmarked.length ? (
                  <Badge tone="green">Safe to skip all {v.unmarked.length}</Badge>
                ) : v.safeCount > 0 ? (
                  <Badge tone="yellow">
                    Only {v.safeCount} of {v.unmarked.length} safe
                  </Badge>
                ) : (
                  <Badge tone="red">Not safe to skip any</Badge>
                )}
              </div>

              {v.nearbyEvent && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  Heads up — {v.nearbyEvent.title} is on{" "}
                  {new Date(v.nearbyEvent.event_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, close to this
                  range.
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {v.sessions.map((s) => {
                  const marked = s.attendance_records?.[0]?.status
                  return (
                    <span
                      key={s.id}
                      className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                    >
                      {new Date(s.session_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {" · "}
                      {s.start_time.slice(0, 5)}
                      {marked ? ` · ${marked}` : ""}
                    </span>
                  )
                })}
              </div>

              {appliedByCourse[v.courseId]?.length ? (
                <div className="mt-3 flex items-center justify-between rounded-md bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800">
                  <span>
                    Marked {appliedByCourse[v.courseId].length} planned skip
                    {appliedByCourse[v.courseId].length === 1 ? "" : "s"}.
                  </span>
                  <button
                    type="button"
                    onClick={() => undoSafeSkips(v.courseId)}
                    disabled={applyingCourseId === v.courseId}
                    className="font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
                  >
                    {applyingCourseId === v.courseId ? "Undoing…" : "Undo"}
                  </button>
                </div>
              ) : (
                !v.strict &&
                v.safeCount > 0 && (
                  <Button
                    variant="secondary"
                    className="mt-3"
                    disabled={applyingCourseId === v.courseId}
                    onClick={() => markSafeSkips(v)}
                  >
                    {applyingCourseId === v.courseId ? "Applying…" : `Mark ${v.safeCount} as planned skip`}
                  </Button>
                )
              )}
            </Card>
          ))}

          {totalUnmarked === 0 && (
            <p className="text-sm text-neutral-500">Every session in this range is already marked.</p>
          )}
        </div>
      )}
    </div>
  )
}
