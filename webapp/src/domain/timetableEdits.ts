import type { SlotId, TimetableSlot } from './model'
import { addDays, type DateStr } from './time'

/** Slots to save after a timetable edit: [updated] replace rows by id, [added] are new rows. */
export interface SlotChange {
  updated: TimetableSlot[]
  added: TimetableSlot[]
}

/**
 * Timetable edits that never rewrite history. A change takes effect from
 * [effectiveFrom]: the old slot is closed the day before and a new slot carries
 * the change forward, so earlier classes keep their original times and marks.
 */
export const TimetableEdits = {
  change(slot: TimetableSlot, changed: TimetableSlot, effectiveFrom: DateStr, newId: SlotId): SlotChange {
    const from = slot.validFrom
    if (from != null && !(effectiveFrom > from)) {
      return { updated: [{ ...changed, id: slot.id, validFrom: from, validTo: slot.validTo }], added: [] }
    }
    const to = slot.validTo
    if (to != null && effectiveFrom > to) return { updated: [], added: [] }
    const closed = { ...slot, validTo: addDays(effectiveFrom, -1) }
    const opened = { ...changed, id: newId, courseId: slot.courseId, validFrom: effectiveFrom, validTo: slot.validTo }
    return { updated: [closed], added: [opened] }
  },

  /** Removes [slot] from [effectiveFrom] onwards. Returns the slot to save, or null to delete it outright. */
  retire(slot: TimetableSlot, effectiveFrom: DateStr): TimetableSlot | null {
    const from = slot.validFrom
    if (from != null && !(effectiveFrom > from)) return null
    const to = slot.validTo
    if (to != null && effectiveFrom > to) return slot
    return { ...slot, validTo: addDays(effectiveFrom, -1) }
  },
}
