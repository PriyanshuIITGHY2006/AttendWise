import { isNeutral } from './model'
import { hasEnded, hasStarted, type ClassOccurrence, type Schedule } from './schedule'
import { minutesUntil, type Now } from './time'

export interface NextClass {
  occurrence: ClassOccurrence
  /** True while the class is running. */
  inProgress: boolean
  /** Minutes until it starts; zero once in progress. */
  startsInMinutes: number
}

/**
 * The class happening now or next, skipping cancelled and on-duty classes and,
 * unless [includePlannedSkips], classes the student plans to skip.
 */
export function nextClass(schedule: Schedule, now: Now, includePlannedSkips = false): NextClass | null {
  const occ = schedule.occurrences.find((o) => {
    const status = o.mark?.status
    return !hasEnded(o, now) && !isNeutral(status) && (includePlannedSkips || status !== 'absent')
  })
  if (!occ) return null
  const inProgress = hasStarted(occ, now)
  return { occurrence: occ, inProgress, startsInMinutes: inProgress ? 0 : minutesUntil(now, occ.key.date, occ.key.start) }
}
