package app.attendwise.domain.schedule

import app.attendwise.domain.model.SlotKind
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.DayOfWeek
import java.time.LocalTime

class IitgSlotsTest {

    @Test
    fun `slots have the hours per week the timetable states`() {
        for (name in listOf("A", "B", "C", "D", "A1", "B1", "C1", "D1")) assertEquals(4, IitgSlots.times(name)!!.size, name)
        for (name in listOf("E", "F", "G", "E1", "F1", "G1")) assertEquals(3, IitgSlots.times(name)!!.size, name)
    }

    @Test
    fun `theory slots fill the weekly grid exactly once`() {
        val cells = IitgSlots.theoryNames.flatMap { IitgSlots.times(it)!! }.map { it.day to it.start }
        assertEquals(50, cells.size)
        assertEquals(50, cells.toSet().size)
        for (day in listOf(DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY)) {
            for (hour in 8..17) assertTrue((day to LocalTime.of(hour, 0)) in cells, "$day $hour")
        }
    }

    @Test
    fun `a theory class lasts 55 minutes`() {
        IitgSlots.theoryNames.flatMap { IitgSlots.times(it)!! }.forEach { assertEquals(it.start.plusMinutes(55), it.end) }
    }

    @Test
    fun `the class at eight is a tutorial and the rest are lectures`() {
        IitgSlots.theoryNames.flatMap { IitgSlots.times(it)!! }.forEach {
            assertEquals(if (it.start.hour == 8) SlotKind.TUTORIAL else SlotKind.LECTURE, it.kind)
        }
        assertEquals(listOf(DayOfWeek.MONDAY), IitgSlots.times("A")!!.filter { it.kind == SlotKind.TUTORIAL }.map { it.day })
        assertEquals(listOf(DayOfWeek.FRIDAY), IitgSlots.times("B")!!.filter { it.kind == SlotKind.TUTORIAL }.map { it.day })
        assertTrue(IitgSlots.times("F")!!.none { it.kind == SlotKind.TUTORIAL })
    }

    @Test
    fun `lab slots are three hours on one weekday`() {
        assertEquals(listOf("ML1", "ML2", "ML3", "ML4", "ML5", "AL1", "AL2", "AL3", "AL4", "AL5"), IitgSlots.labNames)
        val ml3 = IitgSlots.times("ML3")!!.single()
        assertEquals(DayOfWeek.WEDNESDAY, ml3.day)
        assertEquals(LocalTime.of(9, 0), ml3.start)
        assertEquals(LocalTime.of(11, 55), ml3.end)
        assertEquals(SlotKind.LAB, ml3.kind)
        val al5 = IitgSlots.times("AL5")!!.single()
        assertEquals(DayOfWeek.FRIDAY, al5.day)
        assertEquals(LocalTime.of(14, 0), al5.start)
        assertEquals(LocalTime.of(16, 55), al5.end)
    }

    @Test
    fun `slot D falls on Monday, Wednesday, Thursday and Friday`() {
        val d = IitgSlots.times("D")!!
        assertEquals(
            listOf(DayOfWeek.MONDAY to 11, DayOfWeek.WEDNESDAY to 8, DayOfWeek.THURSDAY to 9, DayOfWeek.FRIDAY to 10),
            d.map { it.day to it.start.hour },
        )
    }

    @Test
    fun `unknown slot has no times`() {
        assertNull(IitgSlots.times("Z"))
    }

    @Test
    fun `matching finds the slots a timetable contains`() {
        val timetable = IitgSlots.times("D")!! + IitgSlots.times("ML2")!!
        assertEquals(listOf("D", "ML2"), IitgSlots.matching(timetable))
        assertEquals(emptyList<String>(), IitgSlots.matching(IitgSlots.times("D")!!.drop(1)))
    }

    @Test
    fun `matching ignores the class kind`() {
        val edited = IitgSlots.times("A")!!.map { it.copy(kind = SlotKind.LECTURE) }
        assertEquals(listOf("A"), IitgSlots.matching(edited))
    }
}
