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
