import type { ClassOccurrence } from './schedule'
import { addDays, MONTH_SHORT, toMinutes, weekdayOf, type DateStr } from './time'

/** The Monday of the week a date is in. */
export const mondayOf = (d: DateStr): DateStr => addDays(d, 1 - weekdayOf(d))

/** The days a week grid shows: Monday to Saturday, and Sunday only if it has a class. */
export function weekDates(monday: DateStr, hasClassOn: (d: DateStr) => boolean): DateStr[] {
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i))
  const sunday = addDays(monday, 6)
  if (hasClassOn(sunday)) days.push(sunday)
  return days
}

/** The hours down the side of the grid: from 8 am (earlier if a class starts earlier) to at least 6 pm. */
export function hourRange(classes: ClassOccurrence[]): { from: number; to: number } {
  let from = 8
  let to = 18
  for (const o of classes) {
    from = Math.min(from, Math.floor(toMinutes(o.key.start) / 60))
    to = Math.max(to, Math.ceil(toMinutes(o.end) / 60))
  }
  return { from, to }
}

export interface Placed {
  occ: ClassOccurrence
  /** Which side-by-side lane the class sits in, from 0. */
  lane: number
  /** How many lanes the group it overlaps with needs. */
  lanes: number
}

/**
 * Places one day's classes. Classes that overlap in time sit side by side, so a
 * clash is visible instead of one class hiding another.
 */
export function layoutDay(classes: ClassOccurrence[]): Placed[] {
  const sorted = [...classes].sort((a, b) => toMinutes(a.key.start) - toMinutes(b.key.start) || toMinutes(a.end) - toMinutes(b.end))
  const result: Placed[] = []
  let group: Placed[] = []
  let groupEnd = -1
  const flush = () => {
    const lanes = group.reduce((n, p) => Math.max(n, p.lane + 1), 1)
    for (const p of group) result.push({ ...p, lanes })
    group = []
  }
  for (const occ of sorted) {
    const start = toMinutes(occ.key.start)
    if (group.length > 0 && start >= groupEnd) { flush(); groupEnd = -1 }
    const taken = new Set(group.filter((p) => toMinutes(p.occ.end) > start).map((p) => p.lane))
    let lane = 0
    while (taken.has(lane)) lane++
    group.push({ occ, lane, lanes: 1 })
    groupEnd = Math.max(groupEnd, toMinutes(occ.end))
  }
  flush()
  return result
}

/** A week as text, for example "9 to 14 Nov" or "30 Nov to 5 Dec". */
export function weekLabel(days: DateStr[]): string {
  const first = days[0]
  const last = days[days.length - 1]
  const dm = (d: DateStr) => ({ day: Number(d.slice(8)), month: MONTH_SHORT[Number(d.slice(5, 7)) - 1] })
  const a = dm(first)
  const b = dm(last)
  return a.month === b.month ? `${a.day} to ${b.day} ${b.month}` : `${a.day} ${a.month} to ${b.day} ${b.month}`
}
