import {
  classStreak, courseStats, evaluateBadges, DayResolver, buildSchedule, forCourse, hasEnded, hasStarted, isNeutral, nextClass, overallAttendance, todayVerdict,
  type AttendanceStats, type Badge, type ClassOccurrence, type Course, type CourseId, type DayInfo, type ExtraClass, type InstituteDay, type Mark, type Now,
  type Schedule, type Semester, type Streak, type TimetableSlot,
} from './domain'
import type { CalendarRow, CourseRow, ExtraRow, MarkRow, ProfileRow, SemesterRow, SlotRow } from './data/rows'
import { todayVerdictCopy } from './copy'
import { calendarFrom, courseFrom, extraFrom, markFrom, semesterFrom, slotFrom } from './data/rows'

/** Everything the app loads for one signed-in student. */
export interface Raw {
  semesters: SemesterRow[]
  courses: CourseRow[]
  slots: SlotRow[]
  extras: ExtraRow[]
  marks: MarkRow[]
  calendar: CalendarRow[]
  profile: ProfileRow | null
}

export const EMPTY_RAW: Raw = { semesters: [], courses: [], slots: [], extras: [], marks: [], calendar: [], profile: null }

export type CourseView = Course & { color: string; semesterId: string }

export interface AppData {
  semesterRow: SemesterRow | null
  semester: Semester | null
  courses: CourseView[]
  slots: TimetableSlot[]
  extras: Array<ExtraClass & { id: string }>
  marks: Mark[]
  calendar: InstituteDay[]
  profile: ProfileRow | null
  isFirstYearUg: boolean
  humor: 'roast' | 'plain' | 'kuchupuchu'
}

/** The active semester is the active one that starts latest, like the Android app. */
export function assemble(raw: Raw): AppData {
  const active = raw.semesters.filter((s) => s.is_active).sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0] ?? null
  const courseRows = raw.courses.filter((c) => c.semester_id === active?.id)
  const ids = new Set(courseRows.map((c) => c.id))
  return {
    semesterRow: active,
    semester: active ? semesterFrom(active) : null,
    courses: courseRows.map(courseFrom).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
    slots: raw.slots.filter((s) => ids.has(s.course_id)).map(slotFrom),
    extras: raw.extras.filter((e) => ids.has(e.course_id)).map(extraFrom),
    marks: raw.marks.filter((m) => ids.has(m.course_id)).map(markFrom),
    calendar: raw.calendar.map(calendarFrom),
    profile: raw.profile,
    isFirstYearUg: raw.profile?.is_first_year_ug ?? false,
    humor: raw.profile?.humor_level ?? 'roast',
  }
}

/**
 * Everything derived from the data and the clock, computed once per change so
 * every screen agrees. The same shape as the Android app's Derived.
 */
export class Derived {
  readonly schedule: Schedule
  readonly stats = new Map<CourseId, AttendanceStats>()
  readonly overall
  readonly inSemester: boolean
  readonly todayInfo: DayInfo
  readonly today: ClassOccurrence[]
  readonly unmarkedPast: ClassOccurrence[]
  readonly verdict
  readonly next
  readonly streak: Streak
  readonly badges: Badge[]
  private readonly resolver: DayResolver

  constructor(readonly data: AppData, readonly now: Now) {
    this.resolver = new DayResolver(data.calendar, data.isFirstYearUg)
    this.schedule = data.semester
      ? buildSchedule({ semester: data.semester, courses: data.courses, slots: data.slots, days: this.resolver, marks: data.marks, now, extras: data.extras })
      : { occurrences: [], staleMarks: [] }
    for (const c of data.courses.filter((x) => !x.archived)) this.stats.set(c.id, courseStats(c, this.schedule, now))
    this.overall = overallAttendance(data.courses, this.schedule, now)
    this.inSemester = !!data.semester && now.date >= data.semester.start && now.date <= data.semester.end
    this.todayInfo = this.resolver.resolve(now.date)
    this.today = this.schedule.occurrences.filter((o) => o.key.date === now.date)
    this.unmarkedPast = this.schedule.occurrences
      .filter((o) => o.mark == null && hasEnded(o, now))
      .sort((a, b) => (a.key.date === b.key.date ? (a.key.start < b.key.start ? 1 : -1) : a.key.date < b.key.date ? 1 : -1))
    this.verdict = todayVerdict(data.courses, this.schedule, now)
    this.next = nextClass(this.schedule, now)
    this.streak = classStreak(this.schedule, now)
    this.badges = evaluateBadges({ schedule: this.schedule, courses: data.courses.filter((c) => !c.archived), stats: this.stats, now })
  }

  dayInfo(date: string): DayInfo {
    return this.resolver.resolve(date)
  }

  isPlannedSkip(o: ClassOccurrence): boolean {
    return o.mark?.status === 'absent' && !hasStarted(o, this.now)
  }

  course(id: CourseId): CourseView | undefined {
    return this.data.courses.find((c) => c.id === id)
  }

  code(id: CourseId): string {
    return this.course(id)?.code ?? '?'
  }

  color(id: CourseId): string {
    return this.course(id)?.color ?? '#2463EB'
  }

  forCourse(id: CourseId): ClassOccurrence[] {
    return forCourse(this.schedule, id)
  }

  /** Courses that are tight or at risk, worst first. */
  get danger(): Array<[CourseId, AttendanceStats]> {
    return [...this.stats.entries()]
      .filter(([, s]) => s.status !== 'safe')
      .sort(([, a], [, b]) => (a.status === 'at_risk' ? 0 : 1) - (b.status === 'at_risk' ? 0 : 1) || (a.currentPercent ?? 100) - (b.currentPercent ?? 100))
  }

  verdictLine(): string {
    const must = [...this.verdict.mustAttend].sort((a, b) => (this.stats.get(a)?.status === 'at_risk' ? 0 : 1) - (this.stats.get(b)?.status === 'at_risk' ? 0 : 1))
    return todayVerdictCopy(this.verdict.kind, this.verdict.skippable.map((id) => this.code(id)), must.map((id) => this.code(id)), this.data.humor, this.now.date)
  }

  isNeutralMark(o: ClassOccurrence): boolean {
    return isNeutral(o.mark?.status)
  }
}

