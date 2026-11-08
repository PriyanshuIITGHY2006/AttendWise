import { describe, expect, it } from 'vitest'
import { courseStats } from './attendance'
import { course } from './fixtures'
import { avatarById, AVATARS } from './avatars'
import { BADGES, classStreak, evaluateBadges } from './gamify'
import type { MarkStatus, SlotKind } from './model'
import type { ClassOccurrence, Schedule } from './schedule'

const now = { date: '2026-11-06', time: '18:00' }

function occ(date: string, start: string, status: MarkStatus | null, o: { course?: string; kind?: SlotKind; planId?: string } = {}): ClassOccurrence {
  const key = { courseId: o.course ?? 'c', date, start }
  const end = `${String(Number(start.slice(0, 2))).padStart(2, '0')}:55`
  return { key, end, room: null, kind: o.kind ?? 'lecture', slotId: null, source: 'timetable', swappedFrom: null, mark: status ? { key, status, planId: o.planId ?? null, end } : null }
}
const sched = (occurrences: ClassOccurrence[]): Schedule => ({ occurrences: [...occurrences].sort((a, b) => (a.key.date + a.key.start < b.key.date + b.key.start ? -1 : 1)), staleMarks: [] })
const days = (n: number, status: MarkStatus | null = 'present', start = '10:00') => Array.from({ length: n }, (_, i) => occ(`2026-10-${String(i + 1).padStart(2, '0')}`, start, status))

function badges(occurrences: ClassOccurrence[], courses = [course('c', 'C', 'C')]) {
  const s = sched(occurrences)
  const stats = new Map(courses.map((c) => [c.id, courseStats(c, s, now)]))
  return Object.fromEntries(evaluateBadges({ schedule: s, courses, stats, now }).map((b) => [b.id, b]))
}

describe('class streak', () => {
  it('counts classes attended in a row and resets on an absence', () => {
    const list = [occ('2026-10-01', '10:00', 'present'), occ('2026-10-02', '10:00', 'present'), occ('2026-10-03', '10:00', 'absent'), occ('2026-10-04', '10:00', 'present'), occ('2026-10-05', '10:00', 'present'), occ('2026-10-06', '10:00', 'present')]
    expect(classStreak(sched(list), now)).toEqual({ current: 3, best: 3 })
  })

  it('keeps the best streak after it is broken', () => {
    const list = [...days(5), occ('2026-10-10', '10:00', 'absent'), occ('2026-10-11', '10:00', 'present')]
    expect(classStreak(sched(list), now)).toEqual({ current: 1, best: 5 })
  })

  it('is not broken by cancelled, on-duty or unmarked classes', () => {
    const list = [occ('2026-10-01', '10:00', 'present'), occ('2026-10-02', '10:00', 'cancelled'), occ('2026-10-03', '10:00', null), occ('2026-10-04', '10:00', 'on_duty'), occ('2026-10-05', '10:00', 'present')]
    expect(classStreak(sched(list), now).current).toBe(2)
  })

  it('ignores classes that have not started and planned skips', () => {
    const list = [occ('2026-10-01', '10:00', 'present'), occ('2026-11-06', '19:00', 'absent'), occ('2026-11-09', '10:00', 'present')]
    expect(classStreak(sched(list), now)).toEqual({ current: 1, best: 1 })
  })

  it('is zero with nothing marked', () => expect(classStreak(sched([]), now)).toEqual({ current: 0, best: 0 }))
})

describe('badges', () => {
  it('has nine badges', () => expect(new Set(BADGES.map((b) => b.id)).size).toBe(9))

  it('unlocks Day One with the first attended class', () => {
    expect(badges([])['day-one'].unlocked).toBe(false)
    expect(badges([occ('2026-10-01', '10:00', 'present')])['day-one'].unlocked).toBe(true)
  })

  it('unlocks the streak badges at 5, 15 and 30 and shows progress before that', () => {
    const b = badges(days(7))
    expect(b['hot-streak'].unlocked).toBe(true)
    expect(b.unstoppable).toMatchObject({ unlocked: false, value: 7, goal: 15 })
    expect(b.legend.unlocked).toBe(false)
    const long = badges(Array.from({ length: 30 }, (_, i) => occ(`2026-09-${String((i % 28) + 1).padStart(2, '0')}`, `${String(8 + Math.floor(i / 28)).padStart(2, '0')}:00`, 'present')))
    expect(long.legend.unlocked).toBe(true)
  })

  it('unlocks Early Bird after 5 attended classes before 9:00', () => {
    expect(badges(days(4, 'present', '08:00'))['early-bird']).toMatchObject({ unlocked: false, value: 4 })
    expect(badges(days(5, 'present', '08:00'))['early-bird'].unlocked).toBe(true)
    expect(badges(days(5, 'present', '09:00'))['early-bird'].unlocked).toBe(false)
  })

  it('unlocks Lab Regular after 10 attended lab classes', () => {
    const labs = (n: number) => Array.from({ length: n }, (_, i) => occ(`2026-10-${String(i + 1).padStart(2, '0')}`, '14:00', 'present', { kind: 'lab' }))
    expect(badges(labs(9))['lab-regular'].unlocked).toBe(false)
    expect(badges(labs(10))['lab-regular'].unlocked).toBe(true)
  })

  it('unlocks Perfect Week only for a full week of at least 4 classes, all attended', () => {
    const week = (status: MarkStatus | null) => ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d, i) => occ(d, '10:00', i === 3 ? status : 'present'))
    expect(badges(week('present'))['perfect-week'].unlocked).toBe(true)
    expect(badges(week('absent'))['perfect-week'].unlocked).toBe(false)
    expect(badges(week(null))['perfect-week'].unlocked).toBe(false)
    expect(badges(week('present').slice(0, 3))['perfect-week'].unlocked).toBe(false)
  })

  it('unlocks Full Marks at 100% after 10 classes', () => {
    expect(badges(days(9))['full-marks'].unlocked).toBe(false)
    expect(badges(days(10))['full-marks'].unlocked).toBe(true)
    expect(badges([...days(10), occ('2026-10-20', '10:00', 'absent')])['full-marks'].unlocked).toBe(false)
  })

  it('unlocks Comeback Kid when a course that dropped below the requirement is back above it', () => {
    const slump = [occ('2026-10-01', '10:00', 'present'), occ('2026-10-02', '10:00', 'absent'), occ('2026-10-03', '10:00', 'absent'), occ('2026-10-04', '10:00', 'absent')]
    expect(badges(slump)['comeback'].unlocked).toBe(false)
    const recover = [...slump, ...Array.from({ length: 12 }, (_, i) => occ(`2026-10-${String(10 + i).padStart(2, '0')}`, '10:00', 'present'))]
    expect(badges(recover)['comeback'].unlocked).toBe(true)
  })

})

describe('avatars', () => {
  it('has twelve, each with a unique id', () => {
    expect(AVATARS.length).toBe(12)
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(12)
  })
  it('finds one by id and returns null for unknown or empty', () => {
    expect(avatarById('sleepyhead')?.title).toBe('Sleepyhead')
    expect(avatarById('nope')).toBeNull()
    expect(avatarById(null)).toBeNull()
  })
})
