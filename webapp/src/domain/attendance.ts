import { isNeutral, type Course, type CourseId } from './model'
import { forCourse, hasEnded, hasStarted, type ClassOccurrence, type Schedule } from './schedule'
import type { Now } from './time'

export interface AttendanceCounts {
  attended: number
  missed: number
  remaining: number
  plannedSkips: number
  unmarkedPast: number
  neutral: number
}

export const marked = (c: AttendanceCounts): number => c.attended + c.missed
export const total = (c: AttendanceCounts): number => c.attended + c.missed + c.remaining

export type CourseStatus = 'safe' | 'tight' | 'at_risk'

export interface AttendanceStats {
  counts: AttendanceCounts
  thresholdPercent: number
  strictNoSkip: boolean
  /** Current attendance, or null when nothing is marked yet. */
  currentPercent: number | null
  /** Rounded DOWN, for display, so 74.9% never shows as 75%. */
  currentPercentFloor: number | null
  /** Skips the course can absorb and still end at the requirement, ignoring plans. */
  maxSafeSkips: number
  /** Skips still free after planned skips. Always 0 for zero-tolerance courses. */
  safeSkipsLeft: number
  /** Planned skips beyond what the course can take. */
  overBudget: number
  /** True if attending every remaining class ends at or above the requirement. */
  canReachThreshold: boolean
  belowThreshold: boolean
  /** Classes in a row needed to get back to the requirement, when below it. */
  recoveryClasses: number | null
  projectedIfAttendAll: number | null
  projectedIfPlanFollowed: number | null
  status: CourseStatus
}

/** 100 * part / whole as a number, or null when whole is 0. */
export const percent = (part: number, whole: number): number | null => (whole === 0 ? null : (100 * part) / whole)

/** 100 * part / whole rounded down, computed exactly. */
export const floorPercent = (part: number, whole: number): number | null => (whole === 0 ? null : Math.floor((100 * part) / whole))

function ceilDiv(a: number, b: number): number {
  const q = Math.trunc(a / b)
  return a % b !== 0 && a > 0 === b > 0 ? q + 1 : q
}

/**
 * The attendance rules. All decisions use exact integer arithmetic: a course is
 * at or above a p% requirement exactly when 100 * attended >= p * total.
 */
export function stats(counts: AttendanceCounts, thresholdPercent: number, strictNoSkip = false): AttendanceStats {
  if (thresholdPercent < 0 || thresholdPercent > 100) throw new Error(`Threshold must be 0..100, was ${thresholdPercent}`)
  const p = thresholdPercent
  const a = counts.attended
  const m = marked(counts)
  const r = counts.remaining
  const t = total(counts)

  // Largest k with 100 * (a + r - k) >= p * t.
  const slack = 100 * (a + r) - p * t
  const canReach = slack >= 0
  const maxSafe = canReach ? Math.min(Math.floor(slack / 100), r) : 0
  const safeLeft = strictNoSkip ? 0 : Math.max(0, maxSafe - counts.plannedSkips)
  const overBudget = Math.max(0, counts.plannedSkips - maxSafe)

  const below = m > 0 && 100 * a < p * m
  // Smallest k with 100 * (a + k) >= p * (m + k)  <=>  k * (100 - p) >= p * m - 100 * a.
  const recovery = !below || p === 100 ? null : ceilDiv(p * m - 100 * a, 100 - p)

  let status: CourseStatus
  if (!canReach || below || overBudget > 0) status = 'at_risk'
  else if (!strictNoSkip && safeLeft === 0 && counts.remaining > 0) status = 'tight'
  else status = 'safe'

  return {
    counts,
    thresholdPercent,
    strictNoSkip,
    currentPercent: percent(a, m),
    currentPercentFloor: floorPercent(a, m),
    maxSafeSkips: maxSafe,
    safeSkipsLeft: safeLeft,
    overBudget,
    canReachThreshold: canReach,
    belowThreshold: below,
    recoveryClasses: recovery,
    projectedIfAttendAll: percent(a + r, t),
    projectedIfPlanFollowed: percent(a + r - counts.plannedSkips, t),
    status,
  }
}

/**
 * Tallies one course's classes at [now]. A mark on a class that has started is
 * a fact; a mark on a class that has not started yet is a plan.
 */
export function countAttendance(occurrences: Iterable<ClassOccurrence>, now: Now): AttendanceCounts {
  const c: AttendanceCounts = { attended: 0, missed: 0, remaining: 0, plannedSkips: 0, unmarkedPast: 0, neutral: 0 }
  for (const occ of occurrences) {
    const status = occ.mark?.status
    if (status && isNeutral(status)) c.neutral++
    else if (status === 'present' && hasStarted(occ, now)) c.attended++
    else if (status === 'absent' && hasStarted(occ, now)) c.missed++
    else if (status === 'absent') {
      c.remaining++
      c.plannedSkips++
    } else if (status === 'present') c.remaining++
    else if (hasEnded(occ, now)) {
      c.remaining++
      c.unmarkedPast++
    } else c.remaining++
  }
  return c
}

export function courseStats(course: Course, schedule: Schedule, now: Now): AttendanceStats {
  return stats(countAttendance(forCourse(schedule, course.id), now), course.thresholdPercent, course.strictNoSkip)
}

export interface OverallAttendance {
  attended: number
  marked: number
  percent: number | null
  percentFloor: number | null
}

export function overallAttendance(courses: Course[], schedule: Schedule, now: Now): OverallAttendance {
  const active = new Set<CourseId>(courses.filter((c) => !c.archived).map((c) => c.id))
  const counts = countAttendance(schedule.occurrences.filter((o) => active.has(o.key.courseId)), now)
  const m = marked(counts)
  return { attended: counts.attended, marked: m, percent: percent(counts.attended, m), percentFloor: floorPercent(counts.attended, m) }
}
