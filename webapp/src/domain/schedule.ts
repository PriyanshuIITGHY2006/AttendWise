import type { DayResolver } from './dayResolver'
import { isNeutral, keyOf, slotValidOn, type ClassKey, type Course, type CourseId, type ExtraClass, type Mark, type Semester, type SlotId, type SlotKind, type TimetableSlot } from './model'
import { addDays, eachDay, type DateStr, type Now, type TimeStr, type Weekday } from './time'

export type OccurrenceSource = 'timetable' | 'extra' | 'orphaned'

/** One concrete class, with the student's mark if there is one. */
export interface ClassOccurrence {
  key: ClassKey
  end: TimeStr
  room: string | null
  kind: SlotKind
  slotId: SlotId | null
  source: OccurrenceSource
  mark: Mark | null
  /** Set when the class runs because of a day swap: the weekday whose timetable is followed. */
  swappedFrom: Weekday | null
}

export interface Schedule {
  /** Every class, sorted by date, then start time, then course. */
  occurrences: ClassOccurrence[]
  /** Future marks that no longer match any class. They are excluded from all counts. */
  staleMarks: Mark[]
}

export const occDate = (o: ClassOccurrence): DateStr => o.key.date
export const occStart = (o: ClassOccurrence): TimeStr => o.key.start
export const occCourse = (o: ClassOccurrence): CourseId => o.key.courseId

/** The class has begun (or is over) at [now]. Marks on started classes are real; on others, plans. */
export function hasStarted(o: { key: ClassKey }, now: Now): boolean {
  return o.key.date < now.date || (o.key.date === now.date && o.key.start <= now.time)
}

export function hasEnded(o: ClassOccurrence, now: Now): boolean {
  return o.key.date < now.date || (o.key.date === now.date && o.end <= now.time)
}

export const forCourse = (s: Schedule, courseId: CourseId): ClassOccurrence[] => s.occurrences.filter((o) => o.key.courseId === courseId)
export const onDate = (s: Schedule, date: DateStr): ClassOccurrence[] => s.occurrences.filter((o) => o.key.date === date)

/** The dates a course actually runs, or null if it has no days at all. */
export function activeSpan(course: Course, semester: Semester): [DateStr, DateStr] | null {
  let from: DateStr
  let to: DateStr
  if (course.term === 'full') {
    from = semester.start
    to = semester.end
  } else if (course.term === 'pre_mid') {
    from = semester.start
    to = semester.midSemStart ? addDays(semester.midSemStart, -1) : semester.end
  } else {
    from = semester.midSemEnd ? addDays(semester.midSemEnd, 1) : semester.start
    to = semester.end
  }
  return from > to ? null : [from, to]
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Builds the list of classes from the timetable, the institute calendar, extra
 * classes and the student's marks. Same rules as the Android app.
 */
export function buildSchedule(input: {
  semester: Semester
  courses: Course[]
  slots: TimetableSlot[]
  days: DayResolver
  marks: Mark[]
  now: Now
  extras?: ExtraClass[]
  window?: [DateStr, DateStr] | null
}): Schedule {
  const { semester, courses, slots, days, marks, now } = input
  const extras = input.extras ?? []
  const window = input.window ?? null
  const active = new Map(courses.filter((c) => !c.archived).map((c) => [c.id, c]))
  const slotsByCourse = new Map<CourseId, TimetableSlot[]>()
  for (const s of slots) slotsByCourse.set(s.courseId, [...(slotsByCourse.get(s.courseId) ?? []), s])
  const markByKey = new Map(marks.map((m) => [keyOf(m.key), m]))
  const generated = new Map<string, ClassOccurrence>()

  for (const course of active.values()) {
    const span = activeSpan(course, semester)
    if (!span) continue
    let [from, to] = span
    if (window) {
      from = from > window[0] ? from : window[0]
      to = to < window[1] ? to : window[1]
      if (from > to) continue
    }
    const courseSlots = (slotsByCourse.get(course.id) ?? [])
      .filter((s) => s.end > s.start)
      .sort((a, b) => byText(a.start, b.start) || byText(a.id, b.id))
    if (courseSlots.length === 0) continue

    for (const date of eachDay(from, to)) {
      const info = days.resolve(date)
      if (info.timetableDay == null) continue
      const swappedFrom = info.kind === 'swapped' ? info.follows : null
      for (const slot of courseSlots) {
        if (slot.dayOfWeek !== info.timetableDay || !slotValidOn(slot, date)) continue
        const key: ClassKey = { courseId: course.id, date, start: slot.start }
        const id = keyOf(key)
        if (!generated.has(id)) {
          generated.set(id, { key, end: slot.end, room: slot.room, kind: slot.kind, slotId: slot.id, source: 'timetable', mark: markByKey.get(id) ?? null, swappedFrom })
        }
      }
    }
  }

  for (const extra of extras) {
    if (!active.has(extra.courseId) || extra.end <= extra.start) continue
    if (window && (extra.date < window[0] || extra.date > window[1])) continue
    const key: ClassKey = { courseId: extra.courseId, date: extra.date, start: extra.start }
    const id = keyOf(key)
    if (!generated.has(id)) {
      generated.set(id, { key, end: extra.end, room: extra.room, kind: extra.kind, slotId: null, source: 'extra', mark: markByKey.get(id) ?? null, swappedFrom: null })
    }
  }

  const stale: Mark[] = []
  for (const mark of marks) {
    const id = keyOf(mark.key)
    if (generated.has(id) || !active.has(mark.key.courseId)) continue
    if (window && (mark.key.date < window[0] || mark.key.date > window[1])) continue
    const started = mark.key.date < now.date || (mark.key.date === now.date && mark.key.start <= now.time)
    if (started) {
      const end = mark.end && mark.end > mark.key.start ? mark.end : mark.key.start
      generated.set(id, { key: mark.key, end, room: null, kind: 'lecture', slotId: null, source: 'orphaned', mark, swappedFrom: null })
    } else {
      stale.push(mark)
    }
  }

  const occurrences = [...generated.values()].sort(
    (a, b) => byText(a.key.date, b.key.date) || byText(a.key.start, b.key.start) || byText(a.key.courseId, b.key.courseId),
  )
  stale.sort((a, b) => byText(a.key.date, b.key.date) || byText(a.key.start, b.key.start) || byText(a.key.courseId, b.key.courseId))
  return { occurrences, staleMarks: stale }
}

export const markIsNeutral = (o: ClassOccurrence): boolean => isNeutral(o.mark?.status)
