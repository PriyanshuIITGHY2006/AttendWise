import { describe, expect, it } from 'vitest'
import { nextScene } from './LoaderScene'
import { LOADER_SCENES } from './loaderScenes'

describe('loader scenes', () => {
  it('has the five chosen scenes', () => {
    expect(LOADER_SCENES.map((s) => s.name)).toEqual(['Paper boat', 'Streak', 'Paper plane', 'Class clock', 'Balloon'])
  })
  it('never repeats the scene shown last time', () => {
    for (let last = 0; last < 5; last++) {
      for (let i = 0; i < 100; i++) expect(nextScene(last, 5, i / 100)).not.toBe(last)
    }
  })
  it('always returns a valid scene, including at the top of the random range', () => {
    for (let i = 0; i <= 100; i++) {
      const n = nextScene(-1, 5, i / 100)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(5)
    }
  })
  it('reaches every scene', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 100; i++) seen.add(nextScene(-1, 5, i / 100))
    expect(seen.size).toBe(5)
  })
})
