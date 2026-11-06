import type { SlotKind } from './model'
import type { TimeStr, Weekday } from './time'

/** One weekly class time that belongs to a named slot. */
export interface SlotTime {
  day: Weekday
  start: TimeStr
  end: TimeStr
  kind: SlotKind
}

const DAYS: Record<string, Weekday> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 }
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The IIT Guwahati timetable slots for the July to November 2026 semester.
 * Theory slots are one hour long. The class at 08:00 is a tutorial in every
 * slot. Lab slots (ML1 to ML5 in the morning, AL1 to AL5 in the afternoon) are
 * three hours long.
 */
const THEORY_TABLE = [
  'A: Mon8 Tue9 Wed10 Thu11',
  'B: Mon9 Tue10 Wed11 Fri8',
  'C: Mon10 Tue11 Thu8 Fri9',
  'D: Mon11 Wed8 Thu9 Fri10',
  'E: Tue8 Wed9 Thu10',
  'F: Mon12 Tue12 Fri11',
  'G: Wed12 Thu12 Fri12',
  'A1: Mon17 Tue16 Wed15 Thu14',
  'B1: Mon16 Tue15 Wed14 Fri17',
  'C1: Mon15 Tue14 Thu17 Fri16',
  'D1: Mon14 Wed17 Thu16 Fri15',
  'E1: Tue17 Wed16 Thu15',
  'F1: Mon13 Tue13 Fri14',
  'G1: Wed13 Thu13 Fri13',
]

const theory = new Map<string, SlotTime[]>(
  THEORY_TABLE.map((row) => {
    const [name, rest] = row.split(': ')
    return [
      name,
      rest.split(' ').map((cell): SlotTime => {
        const hour = Number(cell.slice(3))
        return { day: DAYS[cell.slice(0, 3)], start: `${pad(hour)}:00`, end: `${pad(hour)}:55`, kind: hour === 8 ? 'tutorial' : 'lecture' }
      }),
    ]
  }),
)

const labs = new Map<string, SlotTime[]>()
for (const [prefix, hour] of [['ML', 9], ['AL', 14]] as const) {
  for (let i = 1; i <= 5; i++) {
    labs.set(`${prefix}${i}`, [{ day: i as Weekday, start: `${pad(hour)}:00`, end: `${pad(hour + 2)}:55`, kind: 'lab' }])
  }
}

export const theoryNames: string[] = [...theory.keys()]
export const labNames: string[] = [...labs.keys()]

/** The weekly class times of a slot, or undefined if there is no slot with that name. */
export const slotTimes = (name: string): SlotTime[] | undefined => theory.get(name) ?? labs.get(name)

/** Names of the slots whose every class time appears in [times] (the kind is ignored). */
export function matchingSlots(times: Array<Pick<SlotTime, 'day' | 'start' | 'end'>>): string[] {
  return [...theoryNames, ...labNames].filter((name) =>
    (slotTimes(name) ?? []).every((t) => times.some((x) => x.day === t.day && x.start === t.start && x.end === t.end)),
  )
}
