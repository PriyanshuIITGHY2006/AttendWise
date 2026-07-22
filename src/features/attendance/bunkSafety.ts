export type BunkSafetyInput = {
  attended: number
  absent: number
  remainingSessions: number
  thresholdPercent: number
}

export type BunkSafetyStatus = "green" | "yellow" | "red"

export type BunkSafetyResult = {
  /** Attendance % from sessions already marked. */
  currentPercent: number
  /** Total marked sessions (present + absent) counted toward the threshold. */
  totalMarked: number
  /** How many of the remaining sessions can still be skipped and end at/above threshold. */
  maxSafeSkips: number
  /** Whether the threshold is still reachable even if every remaining session is attended. */
  canReachThreshold: boolean
  /** Consecutive classes that must be attended (no more skips) to get back to threshold, if currently below it. */
  recoveryClassesNeeded: number | null
  status: BunkSafetyStatus
}

const EPSILON = 1e-9

export function computeBunkSafety({
  attended,
  absent,
  remainingSessions,
  thresholdPercent,
}: BunkSafetyInput): BunkSafetyResult {
  const totalMarked = attended + absent
  const threshold = thresholdPercent / 100
  const currentPercent = totalMarked > 0 ? (attended / totalMarked) * 100 : 100

  const finalTotalIfAttendAll = totalMarked + remainingSessions
  const finalAttendedIfAttendAll = attended + remainingSessions
  const canReachThreshold =
    finalTotalIfAttendAll === 0 ||
    finalAttendedIfAttendAll / finalTotalIfAttendAll >= threshold - EPSILON

  const rawMaxSkips =
    attended + remainingSessions - threshold * (totalMarked + remainingSessions)
  const maxSafeSkips = Math.max(0, Math.min(remainingSessions, Math.floor(rawMaxSkips + EPSILON)))

  let recoveryClassesNeeded: number | null = null
  if (totalMarked > 0 && currentPercent < thresholdPercent - EPSILON) {
    if (threshold >= 1) {
      recoveryClassesNeeded = null // 100% threshold can never be recovered once an absence exists
    } else {
      const k = (threshold * totalMarked - attended) / (1 - threshold)
      recoveryClassesNeeded = Math.max(0, Math.ceil(k - EPSILON))
    }
  }

  let status: BunkSafetyStatus
  if (totalMarked === 0) {
    status = "green"
  } else if (!canReachThreshold) {
    status = "red"
  } else if (currentPercent < thresholdPercent - EPSILON) {
    status = "red"
  } else if (maxSafeSkips === 0) {
    status = "yellow"
  } else {
    status = "green"
  }

  return {
    currentPercent,
    totalMarked,
    maxSafeSkips,
    canReachThreshold,
    recoveryClassesNeeded,
    status,
  }
}

export type PlanProjection = {
  /** Final % if you execute the plan: skip the planned ones, attend everything else remaining. */
  projectedPercent: number
  /** Does that projected outcome still clear the threshold? */
  meetsThreshold: boolean
  /** How many planned skips exceed what's actually safe (0 when within budget). */
  overBudget: number
  /** The safe-skip budget this projection is measured against. */
  maxSafeSkips: number
}

/**
 * Projects where attendance lands if the student follows through on a plan --
 * skipping `plannedSkips` of the remaining sessions and attending the rest.
 * This is what makes planning meaningful: every skip you pencil in moves this
 * number, and once it dips below the threshold the plan is over budget.
 */
export function projectPlanOutcome(
  { attended, absent, remainingSessions, thresholdPercent }: BunkSafetyInput,
  plannedSkips: number,
): PlanProjection {
  const skips = Math.max(0, Math.min(remainingSessions, plannedSkips))
  // attend every remaining session that isn't a planned skip
  const finalAttended = attended + (remainingSessions - skips)
  const finalTotal = attended + absent + remainingSessions
  const projectedPercent = finalTotal > 0 ? (finalAttended / finalTotal) * 100 : 100
  const { maxSafeSkips } = computeBunkSafety({ attended, absent, remainingSessions, thresholdPercent })
  return {
    projectedPercent,
    meetsThreshold: projectedPercent >= thresholdPercent - EPSILON,
    overBudget: Math.max(0, plannedSkips - maxSafeSkips),
    maxSafeSkips,
  }
}

export type SkipStrategy = "spread" | "concentrate" | "weekday"

export type FutureSessionRef = {
  id: string
  /** ISO date, YYYY-MM-DD */
  date: string
}

export type SkipStrategyOptions = {
  /** "concentrate": inclusive ISO date range to draw picks from. */
  weekStart?: string
  weekEnd?: string
  /** "weekday": 0 = Monday .. 6 = Sunday, matching course_schedule.day_of_week. */
  dayOfWeek?: number
}

/**
 * Suggests which future sessions to skip under a chosen strategy, capped at
 * `budget` (normally the course's maxSafeSkips). Pure and side-effect free --
 * the caller decides whether/when to actually mark these as absent.
 */
export function suggestSkipSessions(
  futureSessions: FutureSessionRef[],
  budget: number,
  strategy: SkipStrategy,
  options: SkipStrategyOptions = {},
): string[] {
  const sorted = [...futureSessions].sort((a, b) => a.date.localeCompare(b.date))
  const cappedBudget = Math.max(0, Math.min(budget, sorted.length))
  if (cappedBudget === 0) return []

  if (strategy === "concentrate" && options.weekStart && options.weekEnd) {
    return sorted
      .filter((s) => s.date >= options.weekStart! && s.date <= options.weekEnd!)
      .slice(0, cappedBudget)
      .map((s) => s.id)
  }

  if (strategy === "weekday" && options.dayOfWeek !== undefined) {
    return sorted
      .filter((s) => {
        const jsDay = new Date(`${s.date}T00:00:00`).getDay() // 0 = Sun .. 6 = Sat
        const ourDay = (jsDay + 6) % 7 // 0 = Mon .. 6 = Sun
        return ourDay === options.dayOfWeek
      })
      .slice(0, cappedBudget)
      .map((s) => s.id)
  }

  // "spread": evenly distribute the picks across the remaining semester
  // rather than clustering them all at the start.
  const n = sorted.length
  const picks = new Set<string>()
  for (let i = 0; i < cappedBudget; i++) {
    const idx = Math.min(n - 1, Math.floor(((i + 0.5) * n) / cappedBudget))
    picks.add(sorted[idx].id)
  }
  return [...picks]
}

export type SkipVerdict = {
  safety: BunkSafetyResult
  /** How many of `countInRange` sessions can safely be skipped, 0 for zero-tolerance courses. */
  safeCount: number
}

/**
 * Combines a course's overall safety with how many sessions in some specific
 * range/day it can absorb. `alreadyPlannedSkips` reserves budget for skips the
 * student has penciled in elsewhere, so two planners never hand out the same
 * skip twice.
 */
export function computeSkipVerdict(
  input: BunkSafetyInput & { strictNoSkip?: boolean; alreadyPlannedSkips?: number },
  countInRange: number,
): SkipVerdict {
  const safety = computeBunkSafety(input)
  const budget = input.strictNoSkip
    ? 0
    : Math.max(0, (safety.canReachThreshold ? safety.maxSafeSkips : 0) - (input.alreadyPlannedSkips ?? 0))
  const safeCount = Math.min(budget, countInRange)
  return { safety, safeCount }
}
