import { describe, expect, it } from 'vitest'
import type { Badge } from '../domain'
import { newMoments } from './Celebration'

const badge = (id: string, unlocked: boolean): Badge => ({ id, title: id, how: '', tier: 'bronze', unlocked, value: unlocked ? 1 : 0, goal: 1 })

describe('celebration moments', () => {
  it('says nothing the first time, only records the current state', () => {
    const r = newMoments(null, [badge('a', true)], 12)
    expect(r.moments).toEqual([])
    expect(r.next).toEqual({ badges: ['a'], streak: 7 })
  })
  it('announces a newly unlocked badge once', () => {
    const r = newMoments({ badges: ['a'], streak: 0 }, [badge('a', true), badge('b', true), badge('c', false)], 3)
    expect(r.moments.map((m) => (m.kind === 'badge' ? m.badge.id : m.kind))).toEqual(['b'])
    expect(newMoments(r.next, [badge('a', true), badge('b', true)], 3).moments).toEqual([])
  })
  it('announces the highest streak milestone crossed, not every one', () => {
    const r = newMoments({ badges: [], streak: 0 }, [], 16)
    expect(r.moments).toEqual([{ kind: 'streak', days: 14 }])
    expect(newMoments(r.next, [], 16).moments).toEqual([])
    expect(newMoments(r.next, [], 21).moments).toEqual([{ kind: 'streak', days: 21 }])
  })
})
