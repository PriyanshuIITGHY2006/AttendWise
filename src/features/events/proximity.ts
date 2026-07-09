export type ProximityEvent = { title: string; event_date: string; event_type: string }

/** Finds the closest event within `windowDays` of a date, if any -- used to warn when a planned skip lands near a quiz/exam. */
export function findNearbyEvent(dateISO: string, events: ProximityEvent[], windowDays = 3): ProximityEvent | null {
  const target = new Date(`${dateISO}T00:00:00`).getTime()
  let closest: ProximityEvent | null = null
  let closestDiff = Infinity
  for (const e of events) {
    const diff = Math.abs(new Date(`${e.event_date}T00:00:00`).getTime() - target)
    if (diff <= windowDays * 86_400_000 && diff < closestDiff) {
      closest = e
      closestDiff = diff
    }
  }
  return closest
}
