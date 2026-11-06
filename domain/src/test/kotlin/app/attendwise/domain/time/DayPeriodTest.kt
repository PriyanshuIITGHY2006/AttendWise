package app.attendwise.domain.time

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.LocalTime

class DayPeriodTest {

    @Test
    fun `period changes at 05, 12, 17 and 21`() {
        assertEquals(DayPeriod.NIGHT, DayPeriod.of(LocalTime.of(4, 59)))
        assertEquals(DayPeriod.MORNING, DayPeriod.of(LocalTime.of(5, 0)))
        assertEquals(DayPeriod.MORNING, DayPeriod.of(LocalTime.of(11, 59)))
        assertEquals(DayPeriod.AFTERNOON, DayPeriod.of(LocalTime.of(12, 0)))
        assertEquals(DayPeriod.AFTERNOON, DayPeriod.of(LocalTime.of(16, 59)))
        assertEquals(DayPeriod.EVENING, DayPeriod.of(LocalTime.of(17, 0)))
        assertEquals(DayPeriod.EVENING, DayPeriod.of(LocalTime.of(20, 59)))
        assertEquals(DayPeriod.NIGHT, DayPeriod.of(LocalTime.of(21, 0)))
        assertEquals(DayPeriod.NIGHT, DayPeriod.of(LocalTime.MIDNIGHT))
    }

    @Test
    fun `every hour of the day maps to a period`() {
        for (h in 0..23) DayPeriod.of(LocalTime.of(h, 30))
    }

    @Test
    fun `greeting adds the name when there is one`() {
        assertEquals("Good morning, Priyanshu", greeting(DayPeriod.MORNING, "Priyanshu"))
        assertEquals("Good afternoon", greeting(DayPeriod.AFTERNOON, null))
        assertEquals("Good evening", greeting(DayPeriod.EVENING, "  "))
        assertEquals("Good night, Asha", greeting(DayPeriod.NIGHT, "Asha"))
    }

    @Test
    fun `first name is taken and capitalised`() {
        assertEquals("Priyanshu", firstNameOf("Priyanshu Debnath"))
        assertEquals("Asha", firstNameOf("  asha  rao "))
        assertEquals("O'neil", firstNameOf("o'neil k"))
    }

    @Test
    fun `unusable names give no first name`() {
        assertNull(firstNameOf(null))
        assertNull(firstNameOf(""))
        assertNull(firstNameOf("   "))
        assertNull(firstNameOf("a"))
        assertNull(firstNameOf("someone@example.com"))
        assertNull(firstNameOf("1234"))
    }
}
