import { courseStatsFrom } from './plannerStats'
import { isNeutral, keyOf, type ClassKey, type Course, type CourseId, type Mark, type PlanId } from './model'
import { forCourse, hasStarted, type ClassOccurrence, type Schedule } from './schedule'
import { countAttendance, type AttendanceStats } from './attendance'
import type { DateStr, Now } from './time'

export type SkipVerdict = 'safe' | 'risky' | 'partial' | 'must_attend' | 'locked' | 'nothing_to_skip'
export type OverallVerdict = 'all_skippable' | 'partly' | 'none_skippable' | 'nothing_to_skip'

export const isSkippable = (v: SkipVerdict): boolean => v === 'safe' || v === 'risky'

export interface CoursePlanLine {
  course: Course
  /** Classes on the chosen days that can still be planned, earliest first. */
  candidates: ClassOccurrence[]
  /** How many more skips the course can take. */
  budget: number
  verdict: SkipVerdict
  /** Stats before this plan. */
  before: AttendanceStats
}

export interface PlanProposal {
  lines: CoursePlanLine[]
  overall: OverallVerdict
  /** Keys of the classes ticked by default: every class of every safe or risky course. */
  defaultSelection: Set<string>
}

export interface SelectionOutcome {
  after: Map<CourseId, AttendanceStats>
  /** Courses the selection pushes over budget, or that are zero-tolerance. */
  violations: Set<CourseId>
}

export type ApplyResult =
  | { kind: 'applied'; marks: Mark[] }
  | { kind: 'rejected'; unplannable: Set<string>; violations: Set<CourseId> }

const VERDICT_ORDER: Record<SkipVerdict, number> = { locked: 0, must_attend: 1, partial: 2, risky: 3, safe: 4, nothing_to_skip: 5 }

/** A class can be planned when it has not started yet and is unmarked or marked present. */
export function isPlannable(occ: ClassOccurrence, now: Now): boolean {
  if (hasStarted(occ, now)) return false
  const status = occ.mark?.status
  return status == null || status === 'present'
}

const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The single planner behind "plan a day off" and "can I bunk today?". Classes
 * already planned as skips are not offered again, so two plans never spend the
 * same skip twice.
 */
export const Planner = {
  propose(courses: Course[], schedule: Schedule, dates: Set<DateStr>, now: Now): PlanProposal {
    const lines: CoursePlanLine[] = []
    for (const course of courses.filter((c) => !c.archived)) {
      const all = forCourse(schedule, course.id)
      const candidates = all.filter((o) => dates.has(o.key.date) && isPlannable(o, now))
      if (candidates.length === 0) continue
      const before = courseStatsFrom(countAttendance(all, now), course)
      const budget = before.safeSkipsLeft
      let verdict: SkipVerdict
      if (course.strictNoSkip) verdict = 'locked'
      else if (budget === 0) verdict = 'must_attend'
      else if (candidates.length > budget) verdict = 'partial'
      else if (before.belowThreshold) verdict = 'risky'
      else verdict = 'safe'
      lines.push({ course, candidates, budget, verdict, before })
    }
    lines.sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || text(a.course.code, b.course.code))

    let overall: OverallVerdict
    if (lines.length === 0) overall = 'nothing_to_skip'
    else if (lines.every((l) => isSkippable(l.verdict))) overall = 'all_skippable'
    else if (!lines.some((l) => isSkippable(l.verdict) || l.verdict === 'partial')) overall = 'none_skippable'
    else overall = 'partly'

    const defaultSelection = new Set<string>()
    for (const l of lines) if (isSkippable(l.verdict)) for (const o of l.candidates) defaultSelection.add(keyOf(o.key))
    return { lines, overall, defaultSelection }
  },

  /** What happens if exactly [selection] is skipped on top of existing plans. */
  evaluate(courses: Course[], schedule: Schedule, selection: Set<string>, now: Now): SelectionOutcome {
    const byId = new Map(courses.map((c) => [c.id, c]))
    const touched = new Set([...selection].map((k) => k.split('|')[0]))
    const after = new Map<CourseId, AttendanceStats>()
    const violations = new Set<CourseId>()
    for (const courseId of touched) {
      const course = byId.get(courseId)
      if (!course) continue
      const hypothetical = forCourse(schedule, courseId).map((occ) =>
        selection.has(keyOf(occ.key)) && isPlannable(occ, now)
          ? { ...occ, mark: { key: occ.key, status: 'absent' as const, planId: null, end: null } }
          : occ,
      )
      const st = courseStatsFrom(countAttendance(hypothetical, now), course)
      after.set(courseId, st)
      if (course.strictNoSkip || st.overBudget > 0) violations.add(courseId)
    }
    return { after, violations }
  },

  /**
   * Turns [selection] into planned-skip marks tagged with [planId]. Rejects the
   * whole plan if any class is not plannable or, unless [allowOverBudget], if
   * any course would go over budget.
   */
  apply(courses: Course[], schedule: Schedule, selection: Set<string>, planId: PlanId, now: Now, allowOverBudget = false): ApplyResult {
    const byKey = new Map(schedule.occurrences.map((o) => [keyOf(o.key), o]))
    const active = new Set(courses.filter((c) => !c.archived).map((c) => c.id))
    const unplannable = new Set<string>()
    for (const key of selection) {
      const occ = byKey.get(key)
      if (!occ || !active.has(occ.key.courseId) || !isPlannable(occ, now)) unplannable.add(key)
    }
    const valid = new Set([...selection].filter((k) => !unplannable.has(k)))
    const outcome = Planner.evaluate(courses, schedule, valid, now)
    const strictHits = new Set([...outcome.violations].filter((id) => courses.find((c) => c.id === id)?.strictNoSkip))
    const blocking = allowOverBudget ? strictHits : outcome.violations
    if (unplannable.size > 0 || blocking.size > 0) return { kind: 'rejected', unplannable, violations: blocking }
    const marks = [...selection]
      .map((k) => byKey.get(k)!)
      .sort((a, b) => text(a.key.date, b.key.date) || text(a.key.start, b.key.start) || text(a.key.courseId, b.key.courseId))
      .map((o): Mark => ({ key: o.key, status: 'absent', planId, end: o.end }))
    return { kind: 'applied', marks }
  },

  /** Keys of the marks to delete to undo plan [planId]. Skips whose class has started are kept. */
  undo(marks: Mark[], planId: PlanId, now: Now): ClassKey[] {
    return marks.filter((m) => m.planId === planId && m.status === 'absent' && !hasStarted(m, now)).map((m) => m.key)
  },
}

export type TodayVerdictKind = 'no_classes_today' | 'day_done' | 'all_skippable' | 'some_skippable' | 'none_skippable'

export interface TodayVerdict {
  kind: TodayVerdictKind
  skippable: CourseId[]
  partly: CourseId[]
  mustAttend: CourseId[]
}

/** The "Can I bunk today?" answer. */
export function todayVerdict(courses: Course[], schedule: Schedule, now: Now): TodayVerdict {
  const todays = schedule.occurrences.filter((o) => o.key.date === now.date && !isNeutral(o.mark?.status))
  const none = (kind: TodayVerdictKind): TodayVerdict => ({ kind, skippable: [], partly: [], mustAttend: [] })
  if (todays.length === 0) return none('no_classes_today')
  const proposal = Planner.propose(courses, schedule, new Set([now.date]), now)
  if (proposal.lines.length === 0) return none('day_done')
  const skippable = proposal.lines.filter((l) => isSkippable(l.verdict)).map((l) => l.course.id)
  const partly = proposal.lines.filter((l) => l.verdict === 'partial').map((l) => l.course.id)
  const mustAttend = proposal.lines.filter((l) => l.verdict === 'must_attend' || l.verdict === 'locked').map((l) => l.course.id)
  const kind: TodayVerdictKind =
    proposal.overall === 'all_skippable' ? 'all_skippable' : proposal.overall === 'partly' ? 'some_skippable' : proposal.overall === 'none_skippable' ? 'none_skippable' : 'day_done'
  return { kind, skippable, partly, mustAttend }
}
