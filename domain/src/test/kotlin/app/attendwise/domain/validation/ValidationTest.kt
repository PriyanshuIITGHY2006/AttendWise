package app.attendwise.domain.validation

import app.attendwise.domain.Monsoon2026
import app.attendwise.domain.d
import app.attendwise.domain.model.Term
import app.attendwise.domain.schedule.SlotChange
import app.attendwise.domain.schedule.TimetableEdits
import app.attendwise.domain.slot
import app.attendwise.domain.t
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.DayOfWeek.MONDAY
import java.time.DayOfWeek.TUESDAY

class ValidationTest {

    @Test
    fun `semester checks`() {
        val ok = Monsoon2026.semester
        assertTrue(Validation.semester(ok).isEmpty())
        assertEquals(setOf(Issue.SEMESTER_ENDS_BEFORE_START, Issue.MID_SEM_OUTSIDE_SEMESTER), Validation.semester(ok.copy(end = d("2026-07-01"))))
        assertEquals(setOf(Issue.MID_SEM_INCOMPLETE), Validation.semester(ok.copy(midSemEnd = null)))
        assertEquals(setOf(Issue.MID_SEM_REVERSED), Validation.semester(ok.copy(midSemStart = d("2026-09-21"))))
        val half = listOf(Monsoon2026.ee203.copy(term = Term.POST_MID))
        assertEquals(setOf(Issue.HALF_COURSE_NEEDS_MID_SEM), Validation.semester(ok.copy(midSemStart = null, midSemEnd = null), half))
    }

    @Test
    fun `course checks`() {
        assertTrue(Validation.course(Monsoon2026.ee203).isEmpty())
        val bad = Monsoon2026.ee203.copy(code = " ", name = "", thresholdPercent = 120)
        assertEquals(setOf(Issue.COURSE_CODE_BLANK, Issue.COURSE_NAME_BLANK, Issue.THRESHOLD_OUT_OF_RANGE), Validation.course(bad))
        assertEquals(setOf(Issue.COURSE_TEXT_TOO_LONG), Validation.course(Monsoon2026.ee203.copy(name = "x".repeat(81))))
    }

    @Test
    fun `slot checks`() {
        assertEquals(setOf(Issue.SLOT_ENDS_BEFORE_START), Validation.slot(slot("s", "c", MONDAY, "10:00", "10:00")))
        assertEquals(setOf(Issue.SLOT_VALIDITY_REVERSED), Validation.slot(slot("s", "c", MONDAY, "10:00", "11:00", from = "2026-10-02", to = "2026-10-01")))
    }

    @Test
    fun `clashes`() {
        val slots = listOf(
            slot("a", "x", MONDAY, "10:00", "11:00"),
            slot("b", "y", MONDAY, "10:30", "11:30"),
            slot("c", "x", MONDAY, "11:00", "12:00"), // back-to-back with a, overlaps b
            slot("d", "x", TUESDAY, "10:00", "11:00"),
            slot("e", "x", MONDAY, "10:00", "11:00", to = "2026-08-31"),
            slot("f", "x", MONDAY, "10:00", "11:00", from = "2026-09-01"),
        )
        val clashes = findClashes(slots).map { Triple(it.first, it.second, it.sameCourse) }.toSet()
        assertEquals(
            setOf(
                Triple("a", "b", false), Triple("a", "e", true), Triple("a", "f", true),
                Triple("b", "c", false), Triple("b", "e", false), Triple("b", "f", false),
            ),
            clashes,
        )
    }

    @Test
    fun `timetable change closes the old slot and opens a new one`() {
        val old = slot("old", "ee", MONDAY, "11:00", "11:55")
        val wanted = slot("ignored", "other", MONDAY, "15:00", "15:55")
        val change = TimetableEdits.change(old, wanted, d("2026-10-05"), "new")
        assertEquals(d("2026-10-04"), change.updated.single().validTo)
        val opened = change.added.single()
        assertEquals("new", opened.id)
        assertEquals("ee", opened.courseId)
        assertEquals(d("2026-10-05"), opened.validFrom)
        assertEquals(t("15:00"), opened.start)
    }

    @Test
    fun `changing a slot that has not started yet edits it in place`() {
        val future = slot("s", "ee", MONDAY, "11:00", "11:55", from = "2026-11-01")
        val change = TimetableEdits.change(future, future.copy(start = t("10:00")), d("2026-10-05"), "new")
        assertTrue(change.added.isEmpty())
        assertEquals(t("10:00"), change.updated.single().start)
        assertEquals(d("2026-11-01"), change.updated.single().validFrom)
        assertEquals(SlotChange(emptyList(), emptyList()), TimetableEdits.change(slot("x", "ee", MONDAY, "11:00", "11:55", to = "2026-09-01"), future, d("2026-10-05"), "n"))
    }

    @Test
    fun `retiring a slot`() {
        assertEquals(d("2026-10-04"), TimetableEdits.retire(slot("s", "ee", MONDAY, "11:00", "11:55"), d("2026-10-05"))!!.validTo)
        assertNull(TimetableEdits.retire(slot("s", "ee", MONDAY, "11:00", "11:55", from = "2026-11-01"), d("2026-10-05")))
    }
}
