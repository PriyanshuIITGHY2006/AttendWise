/*
 * Dates and times as plain strings: dates are "YYYY-MM-DD", times are "HH:mm".
 * Both sort correctly as text, which keeps the rules simple. All values are the
 * student's own wall-clock values, never UTC.
 */

export type DateStr = string
export type TimeStr = string

/** ISO weekday: 1 is Monday, 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export function parseDate(d: DateStr): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

export function formatDate(date: Date): DateStr {
  return date.toISOString().slice(0, 10)
}

export function addDays(d: DateStr, n: number): DateStr {
  const date = parseDate(d)
  date.setUTCDate(date.getUTCDate() + n)
  return formatDate(date)
}

export function weekdayOf(d: DateStr): Weekday {
  const js = parseDate(d).getUTCDay() // 0 is Sunday
  return (js === 0 ? 7 : js) as Weekday
}

/** Every date from [from] to [to], in order. Empty if reversed. */
export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function toMinutes(t: TimeStr): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(total: number): TimeStr {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function addMinutes(t: TimeStr, minutes: number): TimeStr {
  return fromMinutes(Math.min(23 * 60 + 59, toMinutes(t) + minutes))
}

/** A device-local moment, split into the parts the rules care about. */
export interface Now {
  date: DateStr
  time: TimeStr
}

export function nowOf(d: Date = new Date()): Now {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/** Minutes from [now] until the given date and time. Negative if it has passed. */
export function minutesUntil(now: Now, date: DateStr, time: TimeStr): number {
  const days = (parseDate(date).getTime() - parseDate(now.date).getTime()) / 86_400_000
  return days * 1440 + toMinutes(time) - toMinutes(now.time)
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Tuesday, 10 Nov". */
export function longDay(d: DateStr): string {
  const [, m, day] = d.split('-').map(Number)
  return `${WEEKDAY_LONG[weekdayOf(d) - 1]}, ${day} ${MONTH_SHORT[m - 1]}`
}

/** "10 Nov". */
export function shortDay(d: DateStr): string {
  const [, m, day] = d.split('-').map(Number)
  return `${day} ${MONTH_SHORT[m - 1]}`
}

/** "Tue, 10 Nov". */
export function dayFmt(d: DateStr): string {
  return `${WEEKDAY_SHORT[weekdayOf(d) - 1]}, ${shortDay(d)}`
}
