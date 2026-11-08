import { LOADER_SCENES } from './loaderScenes'

const KEY = 'attendwise.loader'

/** The next scene: random, but never the one shown last time. */
export function nextScene(last: number, count: number, random: number): number {
  if (count <= 1) return 0
  const next = Math.floor(random * count)
  const clamped = Math.min(next, count - 1)
  return clamped === last ? (clamped + 1) % count : clamped
}

let picked: number | null = null

/** One scene per launch, so it does not change while the app is still loading. */
function pick(): number {
  if (picked !== null) return picked
  let last = -1
  try { last = Number(localStorage.getItem(KEY) ?? -1) } catch { /* private window */ }
  picked = nextScene(last, LOADER_SCENES.length, Math.random())
  try { localStorage.setItem(KEY, String(picked)) } catch { /* private window */ }
  return picked
}

/** A small animated scene for the loading screen: a boat, a streak, a plane, a clock or a balloon. */
export function LoaderScene() {
  const scene = LOADER_SCENES[pick()]
  return <div className="ls" role="img" aria-label="Loading" dangerouslySetInnerHTML={{ __html: scene.svg }} />
}
