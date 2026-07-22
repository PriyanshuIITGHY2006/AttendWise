import { useEffect, useState, useCallback } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { listCourses, getCourseStats, type Course, type CourseStats } from "../features/courses/api"
import { computeBunkSafety } from "../features/attendance/bunkSafety"
import { termLabel } from "../features/courses/CourseForm"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"

const BAR_COLOR = { green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500" } as const

function CourseCard({ course, stats }: { course: Course; stats?: CourseStats }) {
  if (!stats) return null
  const safety = computeBunkSafety({
    attended: stats.attended,
    absent: stats.absent,
    remainingSessions: stats.remainingSessions,
    thresholdPercent: course.attendance_threshold,
  })
  const label = course.strict_no_skip
    ? "Zero-tolerance"
    : safety.status === "green"
      ? `${safety.maxSafeSkips} skip${safety.maxSafeSkips === 1 ? "" : "s"} left`
      : safety.status === "yellow"
        ? "No margin"
        : "At risk"

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
            <span className="truncate font-medium">{course.name}</span>
            {course.course_type === "lab" && <Badge tone="neutral">Lab</Badge>}
            {termLabel(course.term) && <Badge tone="neutral">{termLabel(course.term)}</Badge>}
            {course.strict_no_skip && <Badge tone="red">Zero-tolerance</Badge>}
          </div>
          <p className="mt-0.5 truncate text-sm text-neutral-500">{[course.code, course.semester].filter(Boolean).join(" · ")}</p>
        </div>
        <Badge tone={safety.status}>{safety.currentPercent.toFixed(0)}%</Badge>
      </div>

      <div className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className={`h-full rounded-full ${BAR_COLOR[safety.status]}`}
            style={{ width: `${Math.min(100, safety.currentPercent)}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs text-neutral-500">
          <span>{course.attendance_threshold}% required</span>
          <span>{label}</span>
        </div>
      </div>
    </>
  )
}

export function Courses() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [stats, setStats] = useState<Record<string, CourseStats>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const data = await listCourses(user.id)
    setCourses(data)
    const entries = await Promise.all(
      data.map(async (c) => [c.id, await getCourseStats(c.id, user.id)] as const),
    )
    setStats(Object.fromEntries(entries))
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
        <Link to="/courses/new">
          <Button>Add course</Button>
        </Link>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-neutral-400">Loading…</p>
      ) : courses.length === 0 ? (
        <Card className="mx-auto mt-6 max-w-md text-center">
          <p className="text-sm text-neutral-500">No courses yet. Add one to start tracking attendance.</p>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c, i) => (
            <Link key={c.id} to={`/courses/${c.id}`} className="group block">
              <Card
                index={i}
                className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-card-hover dark:hover:border-neutral-600"
              >
                <CourseCard course={c} stats={stats[c.id]} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
