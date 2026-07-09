import { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { listCourses, getCourseStats } from "./api"
import { computeBunkSafety, type BunkSafetyStatus } from "../attendance/bunkSafety"

const STATUS_RANK: Record<BunkSafetyStatus, number> = { red: 2, yellow: 1, green: 0 }

export function useOverallStatus() {
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

  return { courseCount, worstStatus }
}
