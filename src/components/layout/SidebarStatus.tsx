import { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { listCourses, getCourseStats } from "../../features/courses/api"
import { computeBunkSafety, type BunkSafetyStatus } from "../../features/attendance/bunkSafety"

const STATUS_RANK: Record<BunkSafetyStatus, number> = { red: 2, yellow: 1, green: 0 }
const STATUS_COPY: Record<BunkSafetyStatus, string> = {
  green: "All courses on track",
  yellow: "One or more courses tight on margin",
  red: "At least one course needs attention",
}
const STATUS_DOT: Record<BunkSafetyStatus, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
}

export function SidebarStatus() {
  const { user } = useAuth()
  const [courseCount, setCourseCount] = useState<number | null>(null)
  const [worstStatus, setWorstStatus] = useState<BunkSafetyStatus>("green")

  useEffect(() => {
    if (!user) return
    let cancelled = false
    listCourses(user.id).then(async (courses) => {
      if (cancelled) return
      setCourseCount(courses.length)
      const statuses = await Promise.all(
        courses.map(async (c) => {
          const stats = await getCourseStats(c.id, user.id)
          return computeBunkSafety({
            attended: stats.attended,
            absent: stats.absent,
            remainingSessions: stats.remainingSessions,
            thresholdPercent: c.attendance_threshold,
          }).status
        }),
      )
      if (cancelled) return
      setWorstStatus(statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), "green" as BunkSafetyStatus))
    })
    return () => {
      cancelled = true
    }
  }, [user])

  if (courseCount === null) return null

  if (courseCount === 0) {
    return <p className="text-xs text-neutral-500">Add a course to start tracking.</p>
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white/60 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/50">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[worstStatus]}`} />
        {STATUS_COPY[worstStatus]}
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">
        {courseCount} course{courseCount === 1 ? "" : "s"} tracked
      </p>
    </div>
  )
}
