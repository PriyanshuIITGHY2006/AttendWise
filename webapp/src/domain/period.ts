import { toMinutes, type TimeStr } from './time'

export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night'

/** Morning from 05:00, afternoon from 12:00, evening from 17:00 and night from 21:00. */
export function dayPeriodOf(time: TimeStr): DayPeriod {
  const h = Math.floor(toMinutes(time) / 60)
  if (h >= 5 && h <= 11) return 'morning'
  if (h >= 12 && h <= 16) return 'afternoon'
  if (h >= 17 && h <= 20) return 'evening'
  return 'night'
}

const BASE: Record<DayPeriod, string> = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good night' }

/** "Good morning, Priyanshu", or just "Good morning" when there is no usable name. */
export function greeting(period: DayPeriod, firstName: string | null | undefined): string {
  return firstName && firstName.trim() ? `${BASE[period]}, ${firstName}` : BASE[period]
}

/** The first name from a full name, capitalised. Null for blanks, single letters and email addresses. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const raw = fullName?.trim().split(/\s+/)[0]
  if (!raw || raw.includes('@')) return null
  const name = Array.from(raw).filter((ch) => /\p{L}/u.test(ch) || ch === "'" || ch === '-').join('').slice(0, 24)
  if (name.length < 2) return null
  return name.charAt(0).toUpperCase() + name.slice(1)
}
