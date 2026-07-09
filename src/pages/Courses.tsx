import { useEffect, useState, useCallback } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { listCourses, getCourseStats, type Course, type CourseStats } from "../features/courses/api"
import { computeBunkSafety } from "../features/attendance/bunkSafety"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"

function StatusBadge({ stats, threshold }: { stats: CourseStats; threshold: number }) {
  const result = computeBunkSafety({
    attended: stats.attended,
    absent: stats.absent,
    remainingSessions: stats.remainingSessions,
    thresholdPercent: threshold,
  })
  const label =
    result.status === "green"
      ? `${result.currentPercent.toFixed(0)}% · ${result.maxSafeSkips} skip${result.maxSafeSkips === 1 ? "" : "s"} left`
      : result.status === "yellow"
        ? `${result.currentPercent.toFixed(0)}% · no margin`
        : `${result.currentPercent.toFixed(0)}% · at risk`
  return <Badge tone={result.status}>{label}</Badge>
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
        <h1 className="text-xl font-semibold tracking-tight">Courses</h1>
        <Link to="/courses/new">
          <Button>Add course</Button>
        </Link>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-neutral-400">Loading…</p>
      ) : courses.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm text-neutral-500">No courses yet. Add one to start tracking attendance.</p>
        </Card>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {courses.map((c) => (
            <Link key={c.id} to={`/courses/${c.id}`}>
              <Card className="h-full transition-colors hover:border-neutral-400 dark:hover:border-neutral-600">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="truncate font-medium">{c.name}</span>
                      {c.course_type === "lab" && <Badge tone="neutral">Lab</Badge>}
                    </div>
                    {c.code && <p className="mt-0.5 text-sm text-neutral-500">{c.code}</p>}
                  </div>
                  {stats[c.id] && <StatusBadge stats={stats[c.id]} threshold={c.attendance_threshold} />}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
