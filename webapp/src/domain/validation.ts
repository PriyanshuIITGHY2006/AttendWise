import type { Course, Semester, SlotId, TimetableSlot } from './model'

export type Issue =
  | 'semester_ends_before_start'
  | 'mid_sem_incomplete'
  | 'mid_sem_reversed'
  | 'mid_sem_outside_semester'
  | 'half_course_needs_mid_sem'
  | 'course_code_blank'
  | 'course_name_blank'
  | 'course_text_too_long'
  | 'threshold_out_of_range'
  | 'slot_ends_before_start'
  | 'slot_validity_reversed'

export const MAX_TEXT = 80

export function validateSemester(s: Semester, courses: Course[] = []): Set<Issue> {
  const out = new Set<Issue>()
  if (s.end < s.start) out.add('semester_ends_before_start')
  const ms = s.midSemStart ?? null
  const me = s.midSemEnd ?? null
  if ((ms == null) !== (me == null)) out.add('mid_sem_incomplete')
  if (ms != null && me != null) {
    if (me < ms) out.add('mid_sem_reversed')
    if (ms < s.start || me > s.end) out.add('mid_sem_outside_semester')
  }
  if ((ms == null || me == null) && courses.some((c) => !c.archived && c.term !== 'full')) out.add('half_course_needs_mid_sem')
  return out
}

export function validateCourse(c: Pick<Course, 'code' | 'name' | 'thresholdPercent'>): Set<Issue> {
  const out = new Set<Issue>()
  if (c.code.trim() === '') out.add('course_code_blank')
  if (c.name.trim() === '') out.add('course_name_blank')
  if (c.code.length > MAX_TEXT || c.name.length > MAX_TEXT) out.add('course_text_too_long')
  if (c.thresholdPercent < 0 || c.thresholdPercent > 100) out.add('threshold_out_of_range')
  return out
}

export function validateSlot(s: Pick<TimetableSlot, 'start' | 'end' | 'validFrom' | 'validTo'>): Set<Issue> {
  const out = new Set<Issue>()
  if (!(s.end > s.start)) out.add('slot_ends_before_start')
  if (s.validFrom != null && s.validTo != null && s.validTo < s.validFrom) out.add('slot_validity_reversed')
  return out
}

export interface Clash {
  first: SlotId
  second: SlotId
  sameCourse: boolean
}

/** Overlapping slots on the same weekday during overlapping validity. Back-to-back slots do not clash. */
export function findClashes(slots: TimetableSlot[]): Clash[] {
  const valid = slots.filter((s) => s.end > s.start).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const out: Clash[] = []
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i]
      const b = valid[j]
      if (a.dayOfWeek !== b.dayOfWeek) continue
      const timeOverlap = a.start < b.end && b.start < a.end
      if (timeOverlap && validityOverlaps(a, b)) out.push({ first: a.id, second: b.id, sameCourse: a.courseId === b.courseId })
    }
  }
  return out
}

function validityOverlaps(a: TimetableSlot, b: TimetableSlot): boolean {
  const aFrom = a.validFrom ?? '0000-01-01'
  const aTo = a.validTo ?? '9999-12-31'
  const bFrom = b.validFrom ?? '0000-01-01'
  const bTo = b.validTo ?? '9999-12-31'
  return !(aFrom > bTo) && !(bFrom > aTo)
}
