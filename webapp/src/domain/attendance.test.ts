import { describe, expect, it } from 'vitest'
import { countAttendance, courseStats, overallAttendance, stats, type AttendanceCounts } from './attendance'
import type { ClassOccurrence, Schedule } from './schedule'
import type { MarkStatus } from './model'
import { course } from './fixtures'

const counts = (attended: number, missed: number, remaining: number, plannedSkips = 0): AttendanceCounts => ({
  attended, missed, remaining, plannedSkips, unmarkedPast: 0, neutral: 0,
})
const st = (a: number, m: number, r: number, p = 75, planned = 0, strict = false) => stats(counts(a, m, r, planned), p, strict)

describe('attendance maths', () => {
  it('brand new course with nothing scheduled', () => {
    const s = st(0, 0, 0)
    expect(s.currentPercent).toBeNull()
    expect(s.currentPercentFloor).toBeNull()
    expect(s.projectedIfAttendAll).toBeNull()
    expect(s.maxSafeSkips).toBe(0)
    expect(s.canReachThreshold).toBe(true)
    expect(s.belowThreshold).toBe(false)
    expect(s.status).toBe('safe')
  })

  it('fresh semester with 40 classes ahead allows a quarter of them', () => {
    const s = st(0, 0, 40)
    expect(s.maxSafeSkips).toBe(10)
    expect(s.safeSkipsLeft).toBe(10)
    expect(s.status).toBe('safe')
  })

  it('exactly at the requirement is not below it', () => {
    const s = st(3, 1, 0)
    expect(s.currentPercent).toBe(75)
    expect(s.belowThreshold).toBe(false)
    expect(s.recoveryClasses).toBeNull()
  })

  it('74.9 percent displays as 74 and counts as below', () => {
    const s = st(749, 251, 0)
    expect(s.currentPercentFloor).toBe(74)
    expect(s.belowThreshold).toBe(true)
    expect(s.status).toBe('at_risk')
  })

  it('below now, recoverable, with skips after recovery', () => {
    const s = st(14, 6, 18)
    expect(s.currentPercentFloor).toBe(70)
    expect(s.belowThreshold).toBe(true)
    expect(s.recoveryClasses).toBe(4)
    expect(s.maxSafeSkips).toBe(3)
    expect(Math.trunc(s.projectedIfAttendAll!)).toBe(84)
    expect(s.status).toBe('at_risk')
  })

  it('planned skips use up the whole budget', () => {
    const s = st(19, 6, 12, 75, 3)
    expect(s.maxSafeSkips).toBe(3)
    expect(s.safeSkipsLeft).toBe(0)
    expect(s.overBudget).toBe(0)
    expect(s.status).toBe('tight')
    expect(Math.trunc(s.projectedIfPlanFollowed!)).toBe(75)
  })

  it('planning beyond the budget is at risk', () => {
    const s = st(19, 6, 12, 75, 4)
    expect(s.overBudget).toBe(1)
    expect(s.status).toBe('at_risk')
    expect(s.projectedIfPlanFollowed!).toBeLessThan(75)
  })

  it('zero-tolerance course never offers skips but is not flagged tight', () => {
    const s = st(8, 0, 6, 75, 0, true)
    expect(s.safeSkipsLeft).toBe(0)
    expect(s.maxSafeSkips).toBeGreaterThan(0)
    expect(s.status).toBe('safe')
  })

  it('100 percent requirement after one miss is unreachable and unrecoverable', () => {
    const s = st(10, 1, 20, 100)
    expect(s.canReachThreshold).toBe(false)
    expect(s.recoveryClasses).toBeNull()
    expect(s.maxSafeSkips).toBe(0)
    expect(s.status).toBe('at_risk')
  })

  it('100 percent requirement with a clean record is tight', () => {
    const s = st(10, 0, 20, 100)
    expect(s.maxSafeSkips).toBe(0)
    expect(s.status).toBe('tight')
  })

  it('0 percent requirement makes everything skippable', () => {
    const s = st(0, 10, 20, 0)
    expect(s.maxSafeSkips).toBe(20)
    expect(s.belowThreshold).toBe(false)
  })

  it('safe skips never exceed the classes left', () => expect(st(100, 0, 5).maxSafeSkips).toBe(5))
  it('semester over and above the requirement is safe, not tight', () => expect(st(30, 5, 0).status).toBe('safe'))

  it('cannot reach the requirement even attending everything', () => {
    const s = st(5, 10, 3)
    expect(s.canReachThreshold).toBe(false)
    expect(s.maxSafeSkips).toBe(0)
    expect(s.status).toBe('at_risk')
  })

  it('rejects an invalid threshold', () => {
    expect(() => st(1, 1, 1, 101)).toThrow()
    expect(() => st(1, 1, 1, -1)).toThrow()
  })

  it('huge counts do not overflow', () => expect(st(20_000_000, 0, 20_000_000).maxSafeSkips).toBe(10_000_000))

  /** Same seed idea as the Kotlin test: closed-form answers against brute force over many random courses. */
  it('closed-form rules match brute force', () => {
    let seed = 20261105
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
    const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo))
    for (let i = 0; i < 20_000; i++) {
      const a = int(0, 60)
      const m = a + int(0, 30)
      const r = int(0, 50)
      const planned = int(0, r + 1)
      const options = [0, 50, 60, 65, 70, 75, 80, 85, 90, 99, 100, int(0, 101)]
      const p = options[int(0, options.length)]
      const s = st(a, m - a, r, p, planned)
      const total = m + r

      let bruteMax = 0
      for (let k = r; k >= 0; k--) if (100 * (a + r - k) >= p * total) { bruteMax = k; break }
      expect(s.maxSafeSkips, `maxSafe a=${a} m=${m} r=${r} p=${p}`).toBe(bruteMax)
      expect(s.canReachThreshold).toBe(100 * (a + r) >= p * total)
      expect(s.safeSkipsLeft).toBe(Math.max(0, bruteMax - planned))
      expect(s.overBudget).toBe(Math.max(0, planned - bruteMax))

      const below = m > 0 && 100 * a < p * m
      expect(s.belowThreshold).toBe(below)
      let bruteRecovery: number | null = null
      if (below) for (let k = 0; k <= 100_000; k++) if (100 * (a + k) >= p * (m + k)) { bruteRecovery = k; break }
      expect(s.recoveryClasses, `recovery a=${a} m=${m} p=${p}`).toBe(bruteRecovery)
      if (m > 0) expect(s.currentPercentFloor).toBe(Math.floor((100 * a) / m))
    }
  })
})

const occ = (date: string, start: string, end: string, status?: MarkStatus, courseId = 'c'): ClassOccurrence => {
  const key = { courseId, date, start }
  return { key, end, room: null, kind: 'lecture', slotId: null, source: 'timetable', swappedFrom: null, mark: status ? { key, status, planId: null, end: null } : null }
}
const at = (date: string, time = '12:00') => ({ date, time })

describe('counting rules', () => {
  it('every case at once', () => {
    const classes = [
      occ('2026-09-30', '11:00', '11:55', 'present'),
      occ('2026-09-30', '14:00', '14:55', 'absent'),
      occ('2026-09-29', '11:00', '11:55'),
      occ('2026-10-01', '11:30', '12:25'),
      occ('2026-10-01', '11:00', '11:55'),
      occ('2026-10-01', '17:00', '17:55', 'absent'),
      occ('2026-10-05', '11:00', '11:55', 'present'),
      occ('2026-10-06', '11:00', '11:55', 'cancelled'),
      occ('2026-09-28', '11:00', '11:55', 'on_duty'),
      occ('2026-10-07', '11:00', '11:55'),
    ]
    expect(countAttendance(classes, at('2026-10-01'))).toEqual({ attended: 1, missed: 1, remaining: 6, plannedSkips: 1, unmarkedPast: 2, neutral: 2 })
  })

  it('a planned skip becomes a real absence once the class starts', () => {
    const skip = [occ('2026-10-01', '17:00', '17:55', 'absent')]
    expect(countAttendance(skip, at('2026-10-01', '16:59')).plannedSkips).toBe(1)
    expect(countAttendance(skip, at('2026-10-01', '17:00')).missed).toBe(1)
  })

  it('course stats and overall attendance', () => {
    const classes = [
      occ('2026-09-30', '09:00', '09:55', 'present', 'a'),
      occ('2026-09-30', '10:00', '10:55', 'absent', 'a'),
      occ('2026-09-30', '11:00', '11:55', 'present', 'b'),
      occ('2026-09-30', '12:00', '12:55', 'present', 'archived'),
    ]
    const schedule: Schedule = { occurrences: classes, staleMarks: [] }
    const courses = [course('a', 'A', 'A'), course('b', 'B', 'B'), course('archived', 'X', 'X', { archived: true })]
    expect(courseStats(courses[0], schedule, at('2026-10-01')).currentPercent).toBe(50)
    const overall = overallAttendance(courses, schedule, at('2026-10-01'))
    expect(overall.attended).toBe(2)
    expect(overall.marked).toBe(3)
    expect(overall.percentFloor).toBe(66)
  })
})
