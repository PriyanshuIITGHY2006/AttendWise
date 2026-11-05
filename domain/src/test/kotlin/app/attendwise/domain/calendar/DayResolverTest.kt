package app.attendwise.domain.calendar

import app.attendwise.domain.Monsoon2026
import app.attendwise.domain.d
import app.attendwise.domain.model.Audience
import app.attendwise.domain.model.DayType
import app.attendwise.domain.model.InstituteDay
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.DayOfWeek

class DayResolverTest {

    @Test
    fun `plain day uses its own weekday`() {
        val info = Monsoon2026.resolver().resolve(d("2026-08-26"))
        assertEquals(DayInfo.Regular(d("2026-08-26")), info)
        assertEquals(DayOfWeek.WEDNESDAY, info.timetableDay)
    }

    @Test
    fun `monsoon 2026 swaps for everyone`() {
        val r = Monsoon2026.resolver()
        assertEquals(DayOfWeek.WEDNESDAY, r.resolve(d("2026-08-27")).timetableDay)
        assertEquals(DayOfWeek.FRIDAY, r.resolve(d("2026-10-01")).timetableDay)
        assertEquals(DayOfWeek.MONDAY, r.resolve(d("2026-11-11")).timetableDay)
    }

    @Test
    fun `first-year-only swaps apply only to first years`() {
        val senior = Monsoon2026.resolver(firstYear = false)
        val fresher = Monsoon2026.resolver(firstYear = true)
        // 8 Aug 2026 is a Saturday.
        assertEquals(DayOfWeek.SATURDAY, senior.resolve(d("2026-08-08")).timetableDay)
        assertEquals(DayOfWeek.THURSDAY, fresher.resolve(d("2026-08-08")).timetableDay)
        assertEquals(DayOfWeek.FRIDAY, fresher.resolve(d("2026-08-22")).timetableDay)
    }

    @Test
    fun `exam days and holidays have no classes`() {
        val r = Monsoon2026.resolver()
        assertNull(r.resolve(d("2026-09-15")).timetableDay)
        val holiday = r.resolve(d("2026-10-02"))
        assertEquals(DayInfo.NoClasses(d("2026-10-02"), DayType.HOLIDAY, "Gandhi Jayanti"), holiday)
    }

    @Test
    fun `holiday beats a swap on the same date`() {
        val date = d("2026-08-27")
        val r = DayResolver(
            listOf(
                InstituteDay(date, DayType.RESCHEDULE, null, DayOfWeek.FRIDAY),
                InstituteDay(date, DayType.HOLIDAY, "Declared holiday"),
            ),
            isFirstYearUg = false,
        )
        assertNull(r.resolve(date).timetableDay)
    }

    @Test
    fun `audience-specific entry beats the general one for that audience`() {
        val date = d("2026-08-27")
        val entries = listOf(
            InstituteDay(date, DayType.HOLIDAY, "Holiday for all"),
            InstituteDay(date, DayType.RESCHEDULE, "Freshers have class", DayOfWeek.MONDAY, Audience.FIRST_YEAR_UG),
        )
        assertNull(DayResolver(entries, isFirstYearUg = false).resolve(date).timetableDay)
        assertEquals(DayOfWeek.MONDAY, DayResolver(entries, isFirstYearUg = true).resolve(date).timetableDay)
    }

    @Test
    fun `broken swap entries fall back to a regular day`() {
        val thu = d("2026-08-27")
        val r = DayResolver(
            listOf(
                InstituteDay(thu, DayType.RESCHEDULE, "no target"),
                InstituteDay(d("2026-08-28"), DayType.RESCHEDULE, "points at itself", DayOfWeek.FRIDAY),
            ),
            isFirstYearUg = false,
        )
        assertEquals(DayInfo.Regular(thu), r.resolve(thu))
        assertEquals(DayInfo.Regular(d("2026-08-28")), r.resolve(d("2026-08-28")))
    }
}
