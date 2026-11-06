import { DayResolver } from './dayResolver'
import type { Course, InstituteDay, Mark, MarkStatus, Semester, TimetableSlot } from './model'
import { eachDay, type Weekday } from './time'

export const slot = (id: string, courseId: string, day: Weekday, start: string, end: string, validFrom: string | null = null, validTo: string | null = null): TimetableSlot => ({
  id, courseId, dayOfWeek: day, start, end, room: null, kind: 'lecture', validFrom, validTo,
})

export const course = (id: string, code: string, name: string, extra: Partial<Course> = {}): Course => ({
  id, code, name, thresholdPercent: 75, strictNoSkip: false, term: 'full', archived: false, ...extra,
})

export const mark = (courseId: string, date: string, start: string, status: MarkStatus, planId: string | null = null): Mark => ({
  key: { courseId, date, start }, status, planId, end: null,
})

const day = (date: string, type: InstituteDay['type'], description: string, follows: Weekday | null = null, audience: InstituteDay['audience'] = 'all'): InstituteDay => ({
  date, type, description, followsDayOfWeek: follows, audience,
})

/** The real IIT Guwahati Monsoon 2026 calendar: instruction 23 Jul to 12 Nov, mid-semester exams 13 to 20 Sep, and the day swaps. */
export const Monsoon2026 = {
  semester: { name: 'Monsoon 2026', start: '2026-07-23', end: '2026-11-12', midSemStart: '2026-09-13', midSemEnd: '2026-09-20' } as Semester,
  calendar: [
    day('2026-08-27', 'reschedule', 'Thu runs Wed', 3),
    day('2026-10-01', 'reschedule', 'Thu runs Fri', 5),
    day('2026-11-11', 'reschedule', 'Wed runs Mon', 1),
    day('2026-08-08', 'reschedule', 'Sat runs Thu', 4, 'first_year_ug'),
    day('2026-08-22', 'reschedule', 'Sat runs Fri', 5, 'first_year_ug'),
    day('2026-10-02', 'holiday', 'Gandhi Jayanti'),
    ...eachDay('2026-09-13', '2026-09-20').map((d) => day(d, 'exam', 'Mid-semester exams')),
  ] as InstituteDay[],
  resolver: (firstYear = false) => new DayResolver(Monsoon2026.calendar, firstYear),
  ma201: course('ma201', 'MA 201', 'Mathematics III'),
  ee203: course('ee203', 'EE 203', 'Signals & Systems'),
  lab: course('cs221', 'CS 221', 'Digital Design Lab', { strictNoSkip: true }),
  /** EE 203: Mon / Wed / Fri 11:00. MA 201: Tue / Thu 09:00. Lab: Fri 14:00 to 16:55. */
  slots: [
    slot('ee-mon', 'ee203', 1, '11:00', '11:55'),
    slot('ee-wed', 'ee203', 3, '11:00', '11:55'),
    slot('ee-fri', 'ee203', 5, '11:00', '11:55'),
    slot('ma-tue', 'ma201', 2, '09:00', '09:55'),
    slot('ma-thu', 'ma201', 4, '09:00', '09:55'),
    slot('lab-fri', 'cs221', 5, '14:00', '16:55'),
  ] as TimetableSlot[],
}
