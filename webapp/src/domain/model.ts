import type { DateStr, TimeStr, Weekday } from './time'

export type CourseId = string
export type SlotId = string
export type PlanId = string

export type Term = 'full' | 'pre_mid' | 'post_mid'
export type SlotKind = 'lecture' | 'tutorial' | 'lab'
export type MarkStatus = 'present' | 'absent' | 'cancelled' | 'on_duty'
export type DayType = 'holiday' | 'mid_sem_break' | 'end_sem_break' | 'exam' | 'reschedule'
export type Audience = 'all' | 'first_year_ug'

export const isNeutral = (s: MarkStatus | undefined): boolean => s === 'cancelled' || s === 'on_duty'

export interface Semester {
  name: string
  start: DateStr
  end: DateStr
  /** First day of the mid-semester exam period, used to split half-semester courses. */
  midSemStart?: DateStr | null
  /** Last day of the mid-semester exam period. */
  midSemEnd?: DateStr | null
}

export interface Course {
  id: CourseId
  code: string
  name: string
  /** Required attendance in whole percent, 0..100. */
  thresholdPercent: number
  /** Zero-tolerance course: the app never suggests skipping it. */
  strictNoSkip: boolean
  term: Term
  archived: boolean
}

/**
 * One weekly timetable slot. Editing a timetable closes the old slot (validTo)
 * and opens a new one (validFrom), so classes that already happened never change.
 */
export interface TimetableSlot {
  id: SlotId
  courseId: CourseId
  dayOfWeek: Weekday
  start: TimeStr
  end: TimeStr
  room: string | null
  kind: SlotKind
  validFrom: DateStr | null
  validTo: DateStr | null
}

export interface ExtraClass {
  courseId: CourseId
  date: DateStr
  start: TimeStr
  end: TimeStr
  room: string | null
  kind: SlotKind
}

export interface InstituteDay {
  date: DateStr
  type: DayType
  description: string | null
  /** For reschedule days: the weekday whose timetable runs on that date. */
  followsDayOfWeek: Weekday | null
  audience: Audience
}

/** Identity of one class: a course, a date and a start time. */
export interface ClassKey {
  courseId: CourseId
  date: DateStr
  start: TimeStr
}

export const keyOf = (k: ClassKey): string => `${k.courseId}|${k.date}|${k.start}`

export interface Mark {
  key: ClassKey
  status: MarkStatus
  planId: PlanId | null
  /** End time when marked, used only if the class later disappears from the timetable. */
  end: TimeStr | null
}

export function slotValidOn(s: TimetableSlot, date: DateStr): boolean {
  return (s.validFrom == null || date >= s.validFrom) && (s.validTo == null || date <= s.validTo)
}
