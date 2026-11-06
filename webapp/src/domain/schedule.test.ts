import { describe, expect, it } from 'vitest'
import { DayResolver } from './dayResolver'
import { course, mark, Monsoon2026 as M, slot } from './fixtures'
import type { Course, ExtraClass, Mark, TimetableSlot } from './model'
import { buildSchedule, forCourse, hasEnded, hasStarted, onDate, type Schedule } from './schedule'
import { eachDay, type DateStr, type Now } from './time'

const sem = M.semester
const early: Now = { date: '2026-07-01', time: '12:00' }

function build(o: { courses?: Course[]; slots?: TimetableSlot[]; firstYear?: boolean; marks?: Mark[]; at?: Now; extras?: ExtraClass[]; window?: [DateStr, DateStr] | null; days?: DayResolver; semester?: typeof sem } = {}): Schedule {
  return buildSchedule({
    semester: o.semester ?? sem,
    courses: o.courses ?? [M.ee203, M.ma201, M.lab],
    slots: o.slots ?? M.slots,
    days: o.days ?? M.resolver(o.firstYear ?? false),
    marks: o.marks ?? [],
    now: o.at ?? early,
    extras: o.extras ?? [],
    window: o.window ?? null,
  })
}
const dates = (s: Schedule, id: string) => forCourse(s, id).map((o) => o.key.date)

describe('schedule', () => {
  it('EE 203 over the whole semester follows every swap, holiday and exam', () => {
    const ee = dates(build(), 'ee203')
    const plainMwf = eachDay(sem.start, sem.end).filter((d) => [1, 3, 5].includes(new Date(d + 'T00:00:00Z').getUTCDay() || 7)).length
    // minus mid-sem 14, 16, 18 Sep and the 2 Oct holiday; plus 27 Aug (Wed timetable) and 1 Oct (Fri timetable).
    expect(ee.length).toBe(plainMwf - 4 + 2)
    expect(ee).toContain('2026-08-27')
    expect(ee).toContain('2026-10-01')
    expect(ee).not.toContain('2026-10-02')
    for (const d of ['2026-09-14', '2026-09-16', '2026-09-18']) expect(ee).not.toContain(d)
    expect([...ee].sort()).toEqual(ee)
  })

  it('a swapped class records which weekday it follows', () => {
    const oct1 = onDate(build(), '2026-10-01')
    expect(new Set(oct1.map((o) => o.key.courseId))).toEqual(new Set(['ee203', 'cs221']))
    expect(oct1.every((o) => o.swappedFrom === 5)).toBe(true)
    expect(oct1.find((o) => o.key.courseId === 'ee203')!.slotId).toBe('ee-fri')
  })

  it('Thursday course loses its class when Thursday runs another day', () => {
    const ma = dates(build(), 'ma201')
    expect(ma).not.toContain('2026-08-27')
    expect(ma).not.toContain('2026-10-01')
    expect(ma).toContain('2026-08-20')
  })

  it('Wednesday running Monday swaps the slot used', () => {
    const nov11 = forCourse(build(), 'ee203').find((o) => o.key.date === '2026-11-11')!
    expect(nov11.slotId).toBe('ee-mon')
    expect(nov11.swappedFrom).toBe(1)
  })

  it('first-year Saturday swap only for first years', () => {
    expect(dates(build({ firstYear: false }), 'ma201')).not.toContain('2026-08-08')
    expect(dates(build({ firstYear: true }), 'ma201')).toContain('2026-08-08')
    expect(dates(build({ firstYear: true }), 'ee203')).toContain('2026-08-22')
  })

  it('half-semester courses stay inside their half', () => {
    const pre = { ...M.ee203, id: 'pre', term: 'pre_mid' as const }
    const post = { ...M.ee203, id: 'post', term: 'post_mid' as const }
    const slots = [slot('p1', 'pre', 1, '10:00', '10:55'), slot('p2', 'post', 1, '10:00', '10:55')]
    const s = build({ courses: [pre, post], slots })
    expect(dates(s, 'pre').every((d) => d <= '2026-09-12')).toBe(true)
    expect(dates(s, 'pre')[0]).toBe('2026-07-27')
    expect(dates(s, 'post').every((d) => d >= '2026-09-21')).toBe(true)
    expect(dates(s, 'post')[0]).toBe('2026-09-21')
    // 11 Nov is a Wednesday running Monday's timetable.
    expect(dates(s, 'post').at(-1)).toBe('2026-11-11')
  })

  it('half course without mid-sem dates falls back to the whole semester', () => {
    const pre = { ...M.ee203, term: 'pre_mid' as const }
    const s = build({ courses: [pre], semester: { ...sem, midSemStart: null, midSemEnd: null } })
    expect(dates(s, 'ee203').at(-1)).toBe('2026-11-11')
  })

  it('editing a timetable mid-semester keeps the old classes', () => {
    const slots = [slot('wed-old', 'ee203', 3, '11:00', '11:55', null, '2026-09-30'), slot('wed-new', 'ee203', 3, '15:00', '15:55', '2026-10-01', null)]
    const s = build({ courses: [M.ee203], slots })
    expect(forCourse(s, 'ee203').find((o) => o.key.date === '2026-09-30')!.key.start).toBe('11:00')
    expect(forCourse(s, 'ee203').find((o) => o.key.date === '2026-10-07')!.key.start).toBe('15:00')
  })

  it('a swap never revives a retired slot', () => {
    const slots = [slot('wed', 'ee203', 3, '11:00', '11:55', null, '2026-08-01')]
    expect(dates(build({ courses: [M.ee203], slots }), 'ee203')).not.toContain('2026-08-27')
  })

  it('duplicate and invalid slots', () => {
    const slots = [slot('b', 'ee203', 1, '11:00', '11:55'), slot('a', 'ee203', 1, '11:00', '12:30'), slot('bad', 'ee203', 1, '13:00', '13:00')]
    const monday = onDate(build({ courses: [M.ee203], slots }), '2026-08-03')
    expect(monday.length).toBe(1)
    expect(monday[0].slotId).toBe('a')
  })

  it('marks attach to their class', () => {
    const s = build({ marks: [mark('ee203', '2026-08-03', '11:00', 'present')] })
    expect(forCourse(s, 'ee203').find((o) => o.key.date === '2026-08-03')!.mark?.status).toBe('present')
    expect(forCourse(s, 'ee203').find((o) => o.key.date === '2026-08-05')!.mark).toBeNull()
  })

  it('past mark with no class is kept as orphaned, future one is stale', () => {
    const marks = [mark('ee203', '2026-09-14', '11:00', 'present'), mark('ee203', '2026-10-02', '11:00', 'absent', 'trip')]
    const s = build({ marks, at: { date: '2026-10-01', time: '10:00' } })
    expect(forCourse(s, 'ee203').find((o) => o.key.date === '2026-09-14')!.source).toBe('orphaned')
    expect(s.staleMarks.map((m) => m.key)).toEqual([{ courseId: 'ee203', date: '2026-10-02', start: '11:00' }])
    expect(dates(s, 'ee203')).not.toContain('2026-10-02')
  })

  it('extra classes, including on holidays', () => {
    const extras: ExtraClass[] = [
      { courseId: 'ee203', date: '2026-10-02', start: '10:00', end: '11:00', room: null, kind: 'lecture' },
      { courseId: 'ee203', date: '2026-08-03', start: '11:00', end: '11:55', room: null, kind: 'lecture' },
      { courseId: 'gone', date: '2026-08-03', start: '08:00', end: '09:00', room: null, kind: 'lecture' },
      { courseId: 'ee203', date: '2026-08-04', start: '09:00', end: '08:00', room: null, kind: 'lecture' },
    ]
    const s = build({ extras })
    expect(forCourse(s, 'ee203').find((o) => o.key.date === '2026-10-02')!.source).toBe('extra')
    expect(forCourse(s, 'ee203').find((o) => o.key.date === '2026-08-03')!.source).toBe('timetable')
    expect(forCourse(s, 'gone')).toEqual([])
    expect(dates(s, 'ee203')).not.toContain('2026-08-04')
  })

  it('archived courses produce nothing and their marks are ignored', () => {
    const s = build({ courses: [{ ...M.ee203, archived: true }], marks: [mark('ee203', '2026-10-02', '11:00', 'absent')] })
    expect(s.occurrences).toEqual([])
    expect(s.staleMarks).toEqual([])
  })

  it('window limits the dates', () => {
    const s = build({ window: ['2026-10-01', '2026-10-04'] })
    expect(new Set(s.occurrences.map((o) => o.key.date))).toEqual(new Set(['2026-10-01']))
  })

  it('started and ended use device-local time', () => {
    const occ = forCourse(build(), 'ee203').find((o) => o.key.date === '2026-10-01')!
    expect(hasStarted(occ, { date: '2026-10-01', time: '10:59' })).toBe(false)
    expect(hasStarted(occ, { date: '2026-10-01', time: '11:00' })).toBe(true)
    expect(hasEnded(occ, { date: '2026-10-01', time: '11:54' })).toBe(false)
    expect(hasEnded(occ, { date: '2026-10-01', time: '11:55' })).toBe(true)
    expect(hasEnded(occ, { date: '2026-10-02', time: '00:00' })).toBe(true)
  })

  it('semester with no matching weekdays yields nothing', () => {
    const s = build({ courses: [M.ee203], slots: [slot('sun', 'ee203', 7, '11:00', '11:55')], semester: { ...sem, start: '2026-08-03', end: '2026-08-07' } })
    expect(s.occurrences).toEqual([])
  })

  it('courses without a timetable stay empty', () => {
    expect(build({ courses: [course('x', 'X', 'X')], slots: [] }).occurrences).toEqual([])
  })
})
