import type { Audience, Course, DayType, ExtraClass, InstituteDay, Mark, MarkStatus, Semester, SlotKind, Term, TimetableSlot } from '../domain'
import type { Weekday } from '../domain'

/*
 * Rows as the v2 REST API sends them, and conversions to the domain types.
 * Dates are ISO dates, times are HH:mm:ss, and soft deletes are a deleted_at stamp.
 */

export interface SemesterRow { id: string; name: string; start_date: string; end_date: string; mid_sem_start: string | null; mid_sem_end: string | null; is_active: boolean; deleted_at: string | null }
export interface CourseRow { id: string; semester_id: string; code: string; name: string; color: string; threshold_percent: number; strict_no_skip: boolean; term: Term; archived: boolean; deleted_at: string | null }
export interface SlotRow { id: string; course_id: string; day_of_week: number; start_time: string; end_time: string; room: string | null; kind: SlotKind; valid_from: string | null; valid_to: string | null; deleted_at: string | null }
export interface ExtraRow { id: string; course_id: string; date: string; start_time: string; end_time: string; room: string | null; kind: SlotKind; deleted_at: string | null }
export interface MarkRow { course_id: string; date: string; start_time: string; end_time: string | null; status: MarkStatus; plan_id: string | null; deleted_at: string | null }
export interface ProfileRow { id: string; full_name: string | null; is_first_year_ug: boolean; humor_level: 'roast' | 'plain' | 'kuchupuchu'; avatar?: string | null }
export interface CalendarRow { date: string; day_type: DayType; description: string | null; follows_day_of_week: number | null; audience: Audience }

/** "09:00:00" to "09:00". */
export const hm = (t: string): string => t.slice(0, 5)
/** "09:00" to "09:00:00". */
export const hms = (t: string): string => (t.length === 5 ? `${t}:00` : t)

export const semesterFrom = (r: SemesterRow): Semester & { id: string; isActive: boolean } => ({
  id: r.id, name: r.name, start: r.start_date, end: r.end_date, midSemStart: r.mid_sem_start, midSemEnd: r.mid_sem_end, isActive: r.is_active,
})

export const courseFrom = (r: CourseRow): Course & { color: string; semesterId: string } => ({
  id: r.id, code: r.code, name: r.name, thresholdPercent: r.threshold_percent, strictNoSkip: r.strict_no_skip, term: r.term, archived: r.archived,
  color: r.color || '#2463EB', semesterId: r.semester_id,
})

export const slotFrom = (r: SlotRow): TimetableSlot => ({
  id: r.id, courseId: r.course_id, dayOfWeek: r.day_of_week as Weekday, start: hm(r.start_time), end: hm(r.end_time),
  room: r.room, kind: r.kind, validFrom: r.valid_from, validTo: r.valid_to,
})

export const extraFrom = (r: ExtraRow): ExtraClass & { id: string } => ({
  id: r.id, courseId: r.course_id, date: r.date, start: hm(r.start_time), end: hm(r.end_time), room: r.room, kind: r.kind,
})

export const markFrom = (r: MarkRow): Mark => ({
  key: { courseId: r.course_id, date: r.date, start: hm(r.start_time) }, status: r.status, planId: r.plan_id, end: r.end_time ? hm(r.end_time) : null,
})

export const calendarFrom = (r: CalendarRow): InstituteDay => ({
  date: r.date, type: r.day_type, description: r.description, followsDayOfWeek: (r.follows_day_of_week as Weekday | null) ?? null, audience: r.audience,
})
