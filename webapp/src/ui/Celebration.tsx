import { useEffect, useMemo, useState } from 'react'
import type { Badge } from '../domain'
import { useStore } from '../data/store'
import { BadgeArt, Flame } from './common'

/** Streak lengths that get a celebration the first time they are reached. */
export const STREAK_MILESTONES = [7, 14, 21, 30, 50, 100]

type Moment = { kind: 'badge'; badge: Badge } | { kind: 'streak'; days: number }
type Seen = { badges: string[]; streak: number }

const key = (uid: string) => `attendwise.seen.${uid}`
function readSeen(uid: string): Seen | null {
  try {
    const raw = localStorage.getItem(key(uid))
    return raw ? (JSON.parse(raw) as Seen) : null
  } catch { return null }
}
function writeSeen(uid: string, seen: Seen) {
  try { localStorage.setItem(key(uid), JSON.stringify(seen)) } catch { /* private window */ }
}

/**
 * Works out what is new since the last visit. The first run on a device only
 * records the current state, so nobody is greeted with old achievements.
 */
export function newMoments(seen: Seen | null, badges: Badge[], streak: number): { moments: Moment[]; next: Seen } {
  const unlocked = badges.filter((b) => b.unlocked)
  const reached = [...STREAK_MILESTONES].reverse().find((m) => streak >= m) ?? 0
  const next: Seen = { badges: unlocked.map((b) => b.id), streak: Math.max(reached, seen?.streak ?? 0) }
  if (!seen) return { moments: [], next }
  const moments: Moment[] = []
  if (reached > seen.streak) moments.push({ kind: 'streak', days: reached })
  for (const b of unlocked) if (!seen.badges.includes(b.id)) moments.push({ kind: 'badge', badge: b })
  next.badges = [...new Set([...seen.badges, ...next.badges])]
  return { moments, next }
}

const COLORS = ['#2463eb', '#f5b700', '#1e7a46', '#e0527a', '#8a5cf6', '#ff8a3d']

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 44 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: ((i * 53) % 90) / 100,
    dur: 1.8 + ((i * 29) % 14) / 10,
    drift: ((i * 17) % 60) - 30,
    spin: 240 + ((i * 41) % 480),
    color: COLORS[i % COLORS.length],
    round: i % 3 === 0,
  })), [])
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, background: p.color, borderRadius: p.round ? 99 : 2, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, ['--drift' as string]: `${p.drift}vw`, ['--spin' as string]: `${p.spin}deg` }} />
      ))}
    </div>
  )
}

export function Celebration() {
  const { derived: d, session, boot } = useStore()
  const uid = session?.user.id ?? null
  const [queue, setQueue] = useState<Moment[]>([])

  useEffect(() => {
    if (!uid || boot !== 'ready') return
    const { moments, next } = newMoments(readSeen(uid), d.badges, d.streak.best)
    writeSeen(uid, next)
    if (moments.length) setQueue((q) => [...q, ...moments.slice(0, 4)])
  }, [uid, boot, d.badges, d.streak.best])

  const m = queue[0]
  useEffect(() => {
    if (!m) return
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') setQueue((q) => q.slice(1)) }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [m])
  if (!m) return null

  const close = () => setQueue((q) => q.slice(1))
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label={m.kind === 'badge' ? 'Badge unlocked' : 'Streak milestone'} onClick={close}>
      <Confetti />
      <div className="celebrate-card" onClick={(e) => e.stopPropagation()}>
        <div className="celebrate-art">
          <span className="rays" aria-hidden="true" />
          {m.kind === 'badge'
            ? <BadgeArt id={m.badge.id} size={132} />
            : <span className="celebrate-flame"><Flame size={84} /><b className="num">{m.days}</b></span>}
        </div>
        <div className="caps" style={{ padding: 0 }}>{m.kind === 'badge' ? 'Badge unlocked' : 'Streak milestone'}</div>
        <h2 className="celebrate-title">{m.kind === 'badge' ? m.badge.title : `${m.days} classes in a row`}</h2>
        <p className="muted">{m.kind === 'badge' ? m.badge.how : 'You have not missed one since. Keep it going.'}</p>
        <button className="btn block" autoFocus onClick={close}>{queue.length > 1 ? 'Next' : 'Nice'}</button>
      </div>
    </div>
  )
}
