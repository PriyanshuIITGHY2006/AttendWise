import type { Audience, DayType, InstituteDay } from './model'
import { weekdayOf, type DateStr, type Weekday } from './time'

/** What kind of day a date is for one particular student. */
export type DayInfo =
  | { kind: 'regular'; date: DateStr; timetableDay: Weekday }
  | { kind: 'swapped'; date: DateStr; timetableDay: Weekday; follows: Weekday; description: string | null }
  | { kind: 'none'; date: DateStr; timetableDay: null; type: DayType; description: string | null }

const DAY_TYPE_ORDER: DayType[] = ['holiday', 'mid_sem_break', 'end_sem_break', 'exam', 'reschedule']
const isNoClassDay = (t: DayType): boolean => t !== 'reschedule'

function precedence(a: InstituteDay, b: InstituteDay): number {
  const audience = (x: InstituteDay) => (x.audience === 'all' ? 1 : 0)
  const noClass = (x: InstituteDay) => (isNoClassDay(x.type) ? 0 : 1)
  return (
    audience(a) - audience(b) ||
    noClass(a) - noClass(b) ||
    DAY_TYPE_ORDER.indexOf(a.type) - DAY_TYPE_ORDER.indexOf(b.type)
  )
}

/**
 * Turns the institute calendar into per-day answers for one student.
 *
 * 1. Entries for another audience are ignored (first-year-only entries apply only to first years).
 * 2. An audience-specific entry beats an entry for everyone.
 * 3. Within the same audience, a no-class day beats a day swap.
 * 4. A swap without a target weekday, or one pointing at the date's own weekday, is a regular day.
 */
export class DayResolver {
  private byDate = new Map<DateStr, InstituteDay>()

  constructor(entries: Iterable<InstituteDay>, isFirstYearUg: boolean) {
    for (const e of entries) {
      const applies = e.audience === ('all' as Audience) || (isFirstYearUg && e.audience === 'first_year_ug')
      if (!applies) continue
      const current = this.byDate.get(e.date)
      if (!current || precedence(e, current) < 0) this.byDate.set(e.date, e)
    }
  }

  resolve(date: DateStr): DayInfo {
    const entry = this.byDate.get(date)
    const own = weekdayOf(date)
    if (!entry) return { kind: 'regular', date, timetableDay: own }
    if (isNoClassDay(entry.type)) return { kind: 'none', date, timetableDay: null, type: entry.type, description: entry.description }
    if (entry.followsDayOfWeek == null || entry.followsDayOfWeek === own) return { kind: 'regular', date, timetableDay: own }
    return { kind: 'swapped', date, timetableDay: entry.followsDayOfWeek, follows: entry.followsDayOfWeek, description: entry.description }
  }
}
