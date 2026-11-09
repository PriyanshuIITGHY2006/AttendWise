import { describe, expect, it } from 'vitest'
import type { ClassOccurrence } from './schedule'
import { hourRange, layoutDay, mondayOf, weekDates, weekLabel } from './week'

const occ = (start: string, end: string, course = 'c'): ClassOccurrence => ({
  key: { courseId: course, date: '2026-11-09', start }, end, room: null, kind: 'lecture', slotId: null, source: 'timetable', swappedFrom: null, mark: null,
})

describe('week grid', () => {
  it('finds the Monday of any day in the week', () => {
    expect(mondayOf('2026-11-09')).toBe('2026-11-09')
    expect(mondayOf('2026-11-12')).toBe('2026-11-09')
    expect(mondayOf('2026-11-15')).toBe('2026-11-09')
  })
  it('shows Monday to Saturday, and Sunday only when it has a class', () => {
    expect(weekDates('2026-11-09', () => false)).toHaveLength(6)
    const days = weekDates('2026-11-09', (d) => d === '2026-11-15')
    expect(days).toHaveLength(7)
    expect(days[6]).toBe('2026-11-15')
  })
  it('runs the hours from 8 to 6 pm, wider only when a class needs it', () => {
    expect(hourRange([])).toEqual({ from: 8, to: 18 })
    expect(hourRange([occ('09:00', '09:55')])).toEqual({ from: 8, to: 18 })
    expect(hourRange([occ('07:30', '08:25'), occ('17:00', '19:30')])).toEqual({ from: 7, to: 20 })
  })
  it('puts classes that do not overlap in one lane', () => {
    const p = layoutDay([occ('09:00', '09:55', 'a'), occ('10:00', '10:55', 'b')])
    expect(p.every((x) => x.lane === 0 && x.lanes === 1)).toBe(true)
  })
  it('places overlapping classes side by side', () => {
    const p = layoutDay([occ('09:00', '10:00', 'a'), occ('09:30', '10:30', 'b')])
    expect(p.find((x) => x.occ.key.courseId === 'a')).toMatchObject({ lane: 0, lanes: 2 })
    expect(p.find((x) => x.occ.key.courseId === 'b')).toMatchObject({ lane: 1, lanes: 2 })
  })
  it('keeps back-to-back classes in separate groups', () => {
    const p = layoutDay([occ('09:00', '10:00', 'a'), occ('10:00', '11:00', 'b')])
    expect(p.every((x) => x.lane === 0 && x.lanes === 1)).toBe(true)
  })
  it('reuses a lane once its class is over', () => {
    const p = layoutDay([occ('09:00', '11:00', 'a'), occ('09:30', '10:00', 'b'), occ('10:15', '10:45', 'c')])
    expect(p.find((x) => x.occ.key.courseId === 'c')).toMatchObject({ lane: 1, lanes: 2 })
  })
  it('writes the week as text', () => {
    expect(weekLabel(weekDates('2026-11-09', () => false))).toBe('9 to 14 Nov')
    expect(weekLabel(weekDates('2026-11-30', () => false))).toBe('30 Nov to 5 Dec')
  })
})
