package app.attendwise.domain.schedule

import app.attendwise.domain.model.SlotId
import app.attendwise.domain.model.TimetableSlot
import java.time.LocalDate

/** Slots to save after a timetable edit: [updated] replace existing rows by id, [added] are new rows. */
public data class SlotChange(val updated: List<TimetableSlot>, val added: List<TimetableSlot>)

/**
 * Timetable edits that never rewrite history. A change takes effect from
 * [effectiveFrom] (normally today): the old slot is closed the day before and a
 * new slot carries the change forward, so classes before that date keep their
 * original times and their marks.
 */
public object TimetableEdits {

    /**
     * Changes [slot] from [effectiveFrom] onwards to [changed] (its id and
     * validity are ignored). If the slot has not started being valid yet, it
     * is simply edited in place.
     */
    public fun change(slot: TimetableSlot, changed: TimetableSlot, effectiveFrom: LocalDate, newId: SlotId): SlotChange {
        val from = slot.validFrom
        if (from != null && !effectiveFrom.isAfter(from)) {
            return SlotChange(updated = listOf(changed.copy(id = slot.id, validFrom = from, validTo = slot.validTo)), added = emptyList())
        }
        val to = slot.validTo
        if (to != null && effectiveFrom.isAfter(to)) return SlotChange(emptyList(), emptyList())
        val closed = slot.copy(validTo = effectiveFrom.minusDays(1))
        val opened = changed.copy(id = newId, courseId = slot.courseId, validFrom = effectiveFrom, validTo = slot.validTo)
        return SlotChange(updated = listOf(closed), added = listOf(opened))
    }

    /**
     * Removes [slot] from [effectiveFrom] onwards. Returns the slot to save, or
     * null when it had not started yet and should be deleted outright.
     */
    public fun retire(slot: TimetableSlot, effectiveFrom: LocalDate): TimetableSlot? {
        val from = slot.validFrom
        if (from != null && !effectiveFrom.isAfter(from)) return null
        val to = slot.validTo
        if (to != null && effectiveFrom.isAfter(to)) return slot
        return slot.copy(validTo = effectiveFrom.minusDays(1))
    }
}
