import { type AttendanceStats } from './attendance'
import { isNeutral, type Course, type CourseId } from './model'
import { hasEnded, hasStarted, type ClassOccurrence, type Schedule } from './schedule'
import { addDays, weekdayOf, type Now } from './time'

/** Classes attended in a row. */
export interface Streak {
  current: number
  best: number
}

/**
 * The class streak. Going through every class that has started, oldest first:
 * a present mark adds one, an absent mark resets to zero. Cancelled and
 * on-duty classes, and classes not marked yet, neither add nor break it.
 */
export function classStreak(schedule: Schedule, now: Now): Streak {
  let run = 0
  let best = 0
  for (const o of schedule.occurrences) {
    if (!hasStarted(o, now)) continue
    const status = o.mark?.status
    if (status === 'present') {
      run++
      if (run > best) best = run
    } else if (status === 'absent') run = 0
  }
  return { current: run, best }
}

export type Tier = 'bronze' | 'silver' | 'gold'

export interface Badge {
  id: string
  title: string
  /** How to earn it. */
  how: string
  tier: Tier
  unlocked: boolean
  /** Progress towards the goal, for a locked badge. */
  value: number
  goal: number
}

interface Spec {
  id: string
  title: string
  how: string
  tier: Tier
  goal: number
}

export const BADGES: Spec[] = [
  { id: 'day-one', title: 'Day One', how: 'Mark your first class as present.', tier: 'bronze', goal: 1 },
  { id: 'hot-streak', title: 'Hot Streak', how: 'Attend 5 classes in a row.', tier: 'bronze', goal: 5 },
  { id: 'unstoppable', title: 'Unstoppable', how: 'Attend 15 classes in a row.', tier: 'silver', goal: 15 },
  { id: 'legend', title: 'Legend', how: 'Attend 30 classes in a row.', tier: 'gold', goal: 30 },
  { id: 'perfect-week', title: 'Perfect Week', how: 'Attend every class in a week that had at least 4.', tier: 'silver', goal: 1 },
  { id: 'early-bird', title: 'Early Bird', how: 'Attend 5 classes that start before 9:00.', tier: 'bronze', goal: 5 },
  { id: 'comeback', title: 'Comeback Kid', how: 'Climb back above the requirement in a course that had dropped below it.', tier: 'silver', goal: 1 },
  { id: 'lab-regular', title: 'Lab Regular', how: 'Attend 10 lab classes.', tier: 'bronze', goal: 10 },
  { id: 'full-marks', title: 'Full Marks', how: 'Reach 100% in a course after at least 10 classes.', tier: 'gold', goal: 1 },
]

/** The Monday that starts the week of a date. */
const weekStart = (date: string): string => addDays(date, 1 - weekdayOf(date))

/** True if some course dropped below its requirement after a few classes and is now back at or above it. */
function hasComeback(courses: Course[], occurrences: ClassOccurrence[], now: Now): boolean {
  for (const c of courses.filter((x) => !x.archived)) {
    let attended = 0
    let marked = 0
    let wasBelow = false
    for (const o of occurrences) {
      if (o.key.courseId !== c.id || !hasStarted(o, now)) continue
      const s = o.mark?.status
      if (s !== 'present' && s !== 'absent') continue
      marked++
      if (s === 'present') attended++
      if (marked >= 4 && 100 * attended < c.thresholdPercent * marked) wasBelow = true
    }
    if (wasBelow && marked > 0 && 100 * attended >= c.thresholdPercent * marked) return true
  }
  return false
}

/** True if some week had at least 4 classes, all over, and every one of them attended. */
function hasPerfectWeek(occurrences: ClassOccurrence[], now: Now): boolean {
  const weeks = new Map<string, ClassOccurrence[]>()
  for (const o of occurrences) {
    if (isNeutral(o.mark?.status)) continue
    const w = weekStart(o.key.date)
    weeks.set(w, [...(weeks.get(w) ?? []), o])
  }
  for (const list of weeks.values()) {
    if (list.length >= 4 && list.every((o) => hasEnded(o, now) && o.mark?.status === 'present')) return true
  }
  return false
}

/** Every badge, with whether it is unlocked and how far along it is. Computed from the student's data, so nothing is stored. */
export function evaluateBadges(input: {
  schedule: Schedule
  courses: Course[]
  stats: Map<CourseId, AttendanceStats>
  now: Now
}): Badge[] {
  const { schedule, courses, stats, now } = input
  const active = new Set(courses.filter((c) => !c.archived).map((c) => c.id))
  const occ = schedule.occurrences.filter((o) => active.has(o.key.courseId))
  const attended = occ.filter((o) => hasStarted(o, now) && o.mark?.status === 'present')
  const streak = classStreak({ occurrences: occ, staleMarks: [] }, now)
  const fullMarks = [...stats.values()].some((s) => s.counts.attended + s.counts.missed >= 10 && s.counts.missed === 0)

  const value: Record<string, number> = {
    'day-one': Math.min(1, attended.length),
    'hot-streak': streak.best,
    unstoppable: streak.best,
    legend: streak.best,
    'perfect-week': hasPerfectWeek(occ, now) ? 1 : 0,
    'early-bird': attended.filter((o) => o.key.start < '09:00').length,
    comeback: hasComeback(courses, occ, now) ? 1 : 0,
    'lab-regular': attended.filter((o) => o.kind === 'lab').length,
    'full-marks': fullMarks ? 1 : 0,
  }
  return BADGES.map((b) => ({ ...b, value: Math.min(value[b.id] ?? 0, b.goal), unlocked: (value[b.id] ?? 0) >= b.goal }))
}

