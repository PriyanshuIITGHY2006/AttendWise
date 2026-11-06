import { describe, expect, it } from 'vitest'
import { DayResolver } from './dayResolver'
import { course, mark, Monsoon2026 as M, slot } from './fixtures'
import type { InstituteDay } from './model'
import { nextClass } from './next'
import { dayPeriodOf, firstNameOf, greeting } from './period'
import { Planner, todayVerdict } from './planner'
import { buildSchedule } from './schedule'
import { labNames, matchingSlots, slotTimes, theoryNames } from './slots'
import { TimetableEdits } from './timetableEdits'
import { findClashes, validateCourse, validateSemester, validateSlot } from './validation'

const entry = (date: string, type: InstituteDay['type'], follows: InstituteDay['followsDayOfWeek'] = null, audience: InstituteDay['audience'] = 'all'): InstituteDay => ({ date, type, description: null, followsDayOfWeek: follows, audience })

describe('day resolver', () => {
  it('plain day uses its own weekday', () => {
    const info = M.resolver().resolve('2026-08-26')
    expect(info.kind).toBe('regular')
    expect(info.timetableDay).toBe(3)
  })

  it('a swap follows another weekday, a holiday has no timetable', () => {
    expect(M.resolver().resolve('2026-10-01')).toMatchObject({ kind: 'swapped', timetableDay: 5 })
    expect(M.resolver().resolve('2026-10-02')).toMatchObject({ kind: 'none', type: 'holiday', timetableDay: null })
  })

  it('first-year entries only apply to first years', () => {
    expect(M.resolver(false).resolve('2026-08-08').kind).toBe('regular')
    expect(M.resolver(true).resolve('2026-08-08')).toMatchObject({ kind: 'swapped', follows: 4 })
  })

  it('a no-class day beats a swap on the same date', () => {
    const r = new DayResolver([entry('2026-10-01', 'reschedule', 5), entry('2026-10-01', 'holiday')], false)
    expect(r.resolve('2026-10-01').kind).toBe('none')
  })

  it('an audience entry beats an entry for everyone', () => {
    const r = new DayResolver([entry('2026-08-08', 'holiday'), entry('2026-08-08', 'reschedule', 4, 'first_year_ug')], true)
    expect(r.resolve('2026-08-08').kind).toBe('swapped')
  })

  it('a swap without a target, or to its own weekday, is a regular day', () => {
    const r = new DayResolver([entry('2026-10-01', 'reschedule'), entry('2026-10-08', 'reschedule', 4)], false)
    expect(r.resolve('2026-10-01').kind).toBe('regular')
    expect(r.resolve('2026-10-08').kind).toBe('regular')
  })
})

describe('planner', () => {
  const now = { date: '2026-10-05', time: '08:00' }
  const courses = [M.ee203, M.ma201, M.lab]
  const schedule = (marks = [] as ReturnType<typeof mark>[]) =>
    buildSchedule({ semester: M.semester, courses, slots: M.slots, days: M.resolver(), marks, now })

  it('a strict course is locked and a fresh course can take skips', () => {
    const p = Planner.propose(courses, schedule(), new Set(['2026-10-09']), now)
    const lab = p.lines.find((l) => l.course.id === 'cs221')!
    const ee = p.lines.find((l) => l.course.id === 'ee203')!
    expect(lab.verdict).toBe('locked')
    expect(ee.verdict).toBe('safe')
    expect(p.defaultSelection.has('ee203|2026-10-09|11:00')).toBe(true)
    expect(p.defaultSelection.has('cs221|2026-10-09|14:00')).toBe(false)
    expect(p.overall).toBe('partly')
  })

  it('applying a plan tags the marks and undo removes them', () => {
    const s = schedule()
    const result = Planner.apply(courses, s, new Set(['ee203|2026-10-09|11:00']), 'plan1', now)
    expect(result.kind).toBe('applied')
    if (result.kind !== 'applied') return
    expect(result.marks[0]).toMatchObject({ status: 'absent', planId: 'plan1', end: '11:55' })
    expect(Planner.undo(result.marks, 'plan1', now)).toEqual([result.marks[0].key])
    // Once the class has started, the skip is a real absence and stays.
    expect(Planner.undo(result.marks, 'plan1', { date: '2026-10-09', time: '11:00' })).toEqual([])
  })

  it('a strict course cannot be planned', () => {
    const result = Planner.apply(courses, schedule(), new Set(['cs221|2026-10-09|14:00']), 'p', now)
    expect(result.kind).toBe('rejected')
  })

  it('classes already planned as skips are not offered again', () => {
    const s = schedule([mark('ee203', '2026-10-09', '11:00', 'absent', 'p')])
    const p = Planner.propose(courses, s, new Set(['2026-10-09']), now)
    expect(p.lines.find((l) => l.course.id === 'ee203')).toBeUndefined()
  })

  it('today verdict covers no classes, and classes that can be skipped', () => {
    const sat = { date: '2026-10-10', time: '08:00' }
    expect(todayVerdict(courses, schedule(), sat).kind).toBe('no_classes_today')
    const mon = { date: '2026-10-05', time: '08:00' }
    expect(todayVerdict(courses, schedule(), mon).kind).toBe('all_skippable')
  })

  it('next class skips cancelled classes and planned skips', () => {
    const s = schedule([mark('ee203', '2026-10-05', '11:00', 'cancelled')])
    expect(nextClass(s, now)!.occurrence.key.date).not.toBe('2026-10-05')
    const planned = schedule([mark('ee203', '2026-10-05', '11:00', 'absent')])
    expect(nextClass(planned, now, true)!.occurrence.key).toMatchObject({ date: '2026-10-05', start: '11:00' })
    expect(nextClass(planned, now)!.occurrence.key.date).not.toBe('2026-10-05')
    expect(nextClass(schedule(), now)!.startsInMinutes).toBe(180)
  })
})

describe('timetable edits and validation', () => {
  const base = slot('s1', 'c', 1, '09:00', '09:55', '2026-07-23', null)

  it('a change closes the old slot the day before and opens a new one', () => {
    const r = TimetableEdits.change(base, { ...base, start: '10:00', end: '10:55' }, '2026-10-01', 'new')
    expect(r.updated[0].validTo).toBe('2026-09-30')
    expect(r.added[0]).toMatchObject({ id: 'new', start: '10:00', validFrom: '2026-10-01', validTo: null })
  })

  it('a slot that has not started yet is edited in place', () => {
    const r = TimetableEdits.change(base, { ...base, start: '10:00', end: '10:55' }, '2026-07-23', 'new')
    expect(r.added).toEqual([])
    expect(r.updated[0]).toMatchObject({ id: 's1', start: '10:00' })
  })

  it('retire closes a running slot and deletes a future one', () => {
    expect(TimetableEdits.retire(base, '2026-10-01')!.validTo).toBe('2026-09-30')
    expect(TimetableEdits.retire(base, '2026-07-23')).toBeNull()
  })

  it('finds clashes but not back-to-back slots', () => {
    const a = slot('a', 'c1', 1, '09:00', '09:55')
    expect(findClashes([a, slot('b', 'c2', 1, '09:30', '10:30')])).toEqual([{ first: 'a', second: 'b', sameCourse: false }])
    expect(findClashes([a, slot('c', 'c2', 1, '09:55', '10:30')])).toEqual([])
    expect(findClashes([a, slot('d', 'c2', 2, '09:00', '09:55')])).toEqual([])
  })

  it('validates semester, course and slot', () => {
    expect(validateSemester({ name: 'x', start: '2026-08-01', end: '2026-07-01' }).has('semester_ends_before_start')).toBe(true)
    expect(validateSemester({ name: 'x', start: '2026-07-01', end: '2026-12-01', midSemStart: '2026-09-01' }).has('mid_sem_incomplete')).toBe(true)
    expect(validateSemester({ name: 'x', start: '2026-07-01', end: '2026-12-01' }, [course('h', 'H', 'H', { term: 'pre_mid' })]).has('half_course_needs_mid_sem')).toBe(true)
    expect(validateCourse({ code: ' ', name: '', thresholdPercent: 101 })).toEqual(new Set(['course_code_blank', 'course_name_blank', 'threshold_out_of_range']))
    expect(validateSlot({ start: '10:00', end: '09:00', validFrom: null, validTo: null }).has('slot_ends_before_start')).toBe(true)
  })
})

describe('IIT Guwahati slots', () => {
  it('have the hours per week the timetable states', () => {
    for (const n of ['A', 'B', 'C', 'D', 'A1', 'B1', 'C1', 'D1']) expect(slotTimes(n)!.length, n).toBe(4)
    for (const n of ['E', 'F', 'G', 'E1', 'F1', 'G1']) expect(slotTimes(n)!.length, n).toBe(3)
  })

  it('fill the weekly grid exactly once', () => {
    const cells = theoryNames.flatMap((n) => slotTimes(n)!).map((t) => `${t.day}|${t.start}`)
    expect(cells.length).toBe(50)
    expect(new Set(cells).size).toBe(50)
    for (let day = 1; day <= 5; day++) for (let h = 8; h <= 17; h++) expect(cells).toContain(`${day}|${String(h).padStart(2, '0')}:00`)
  })

  it('make the class at 8:00 a tutorial', () => {
    for (const t of theoryNames.flatMap((n) => slotTimes(n)!)) expect(t.kind).toBe(t.start === '08:00' ? 'tutorial' : 'lecture')
    expect(slotTimes('A')!.filter((t) => t.kind === 'tutorial').map((t) => t.day)).toEqual([1])
    expect(slotTimes('B')!.filter((t) => t.kind === 'tutorial').map((t) => t.day)).toEqual([5])
  })

  it('have lab slots that run three hours', () => {
    expect(labNames).toEqual(['ML1', 'ML2', 'ML3', 'ML4', 'ML5', 'AL1', 'AL2', 'AL3', 'AL4', 'AL5'])
    expect(slotTimes('ML3')).toEqual([{ day: 3, start: '09:00', end: '11:55', kind: 'lab' }])
    expect(slotTimes('AL5')).toEqual([{ day: 5, start: '14:00', end: '16:55', kind: 'lab' }])
  })

  it('match a timetable back to its slots, ignoring the kind', () => {
    expect(matchingSlots([...slotTimes('D')!, ...slotTimes('ML2')!])).toEqual(['D', 'ML2'])
    expect(matchingSlots(slotTimes('D')!.slice(1))).toEqual([])
    expect(slotTimes('Z')).toBeUndefined()
  })
})

describe('time of day', () => {
  it('changes at 05, 12, 17 and 21', () => {
    const expected: Array<[string, string]> = [['04:59', 'night'], ['05:00', 'morning'], ['11:59', 'morning'], ['12:00', 'afternoon'], ['16:59', 'afternoon'], ['17:00', 'evening'], ['20:59', 'evening'], ['21:00', 'night'], ['00:00', 'night']]
    for (const [t, p] of expected) expect(dayPeriodOf(t), t).toBe(p)
  })

  it('greets by name when there is one', () => {
    expect(greeting('morning', 'Priyanshu')).toBe('Good morning, Priyanshu')
    expect(greeting('afternoon', null)).toBe('Good afternoon')
    expect(greeting('evening', '  ')).toBe('Good evening')
  })

  it('takes a capitalised first name and rejects the rest', () => {
    expect(firstNameOf('Priyanshu Debnath')).toBe('Priyanshu')
    expect(firstNameOf('  asha  rao ')).toBe('Asha')
    for (const bad of [null, '', '   ', 'a', 'someone@example.com', '1234']) expect(firstNameOf(bad)).toBeNull()
  })
})
