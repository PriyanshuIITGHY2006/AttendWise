package app.attendwise.domain.notify

import app.attendwise.domain.d
import app.attendwise.domain.key
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.Mark
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.SlotKind
import app.attendwise.domain.schedule.ClassOccurrence
import app.attendwise.domain.schedule.OccurrenceSource
import app.attendwise.domain.schedule.Schedule
import app.attendwise.domain.t
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDateTime

class NotificationPlannerTest {

    private fun occ(date: String, start: String, end: String, status: MarkStatus? = null, plan: String? = null, course: String = "ee") =
        key(course, date, start).let { k ->
            ClassOccurrence(k, t(end), null, SlotKind.LECTURE, null, OccurrenceSource.TIMETABLE, status?.let { Mark(k, it, plan) })
        }

    private fun dt(text: String) = LocalDateTime.parse(text)
    private fun schedule(vararg o: ClassOccurrence) = Schedule(o.toList(), emptyList())

    private val day = schedule(
        occ("2026-10-01", "09:00", "09:55"),
        occ("2026-10-01", "11:00", "11:55", MarkStatus.PRESENT),
        occ("2026-10-01", "14:00", "16:55", MarkStatus.CANCELLED),
        occ("2026-10-01", "17:00", "17:55", MarkStatus.ABSENT, plan = "p"),
    )

    @Test
    fun `a normal day`() {
        val e = notificationsBetween(day, NotificationSettings(), dt("2026-09-30T12:00"), dt("2026-10-02T00:00"))
        assertEquals(
            listOf(
                "planned:2026-10-01" to dt("2026-09-30T21:00"),
                "reminder:ee:2026-10-01:09:00" to dt("2026-10-01T08:50"),
                "mark:ee:2026-10-01:09:00" to dt("2026-10-01T09:55"),
                "reminder:ee:2026-10-01:11:00" to dt("2026-10-01T10:50"),
                "digest:2026-10-01" to dt("2026-10-01T21:00"),
            ),
            e.map { it.id to it.at },
        )
    }

    @Test
    fun `muted means nothing at all`() {
        assertTrue(notificationsBetween(day, NotificationSettings(muted = true), dt("2026-09-30T00:00"), dt("2026-10-03T00:00")).isEmpty())
    }

    @Test
    fun `window is half-open and an empty window yields nothing`() {
        val e = notificationsBetween(day, NotificationSettings(), dt("2026-10-01T08:50"), dt("2026-10-01T09:55"))
        assertEquals(listOf("reminder:ee:2026-10-01:09:00"), e.map { it.id })
        assertTrue(notificationsBetween(day, NotificationSettings(), dt("2026-10-01T10:00"), dt("2026-10-01T10:00")).isEmpty())
    }

    @Test
    fun `reminder for a just-after-midnight class falls on the previous day`() {
        val s = schedule(occ("2026-10-02", "00:05", "00:55"))
        val e = notificationsBetween(s, NotificationSettings(markPrompts = false, dailyDigest = false), dt("2026-10-01T00:00"), dt("2026-10-03T00:00"))
        assertEquals(dt("2026-10-01T23:55"), e.single().at)
    }

    @Test
    fun `quiet hours across midnight drop reminders and defer prompts`() {
        val s = schedule(occ("2026-10-01", "22:00", "23:30"), occ("2026-10-02", "06:30", "06:55"))
        val settings = NotificationSettings(quietStart = t("23:00"), quietEnd = t("07:00"), dailyDigest = false)
        val e = notificationsBetween(s, settings, dt("2026-10-01T00:00"), dt("2026-10-03T00:00"))
        val ids = e.map { it.id to it.at }
        assertTrue("reminder:ee:2026-10-01:22:00" to dt("2026-10-01T21:50") in ids)
        assertTrue("mark:ee:2026-10-01:22:00" to dt("2026-10-02T07:00") in ids, "23:30 prompt waits until 07:00 next day")
        assertFalse(ids.any { it.first == "reminder:ee:2026-10-02:06:30" }, "06:20 reminder is in quiet hours")
        assertTrue("mark:ee:2026-10-02:06:30" to dt("2026-10-02T07:00") in ids)
    }

    @Test
    fun `daytime quiet hours`() {
        val q = QuietHours(t("13:00"), t("14:00"))
        assertTrue(q.contains(t("13:00")))
        assertFalse(q.contains(t("14:00")))
        assertEquals(dt("2026-10-01T14:00"), q.deferOutside(dt("2026-10-01T13:30")))
        assertFalse(QuietHours(t("13:00"), t("13:00")).contains(t("13:00")))
        assertFalse(QuietHours(null, t("13:00")).contains(t("12:00")))
    }

    @Test
    fun `no planned-skip reminder once the skip has started or for cancelled classes`() {
        val s = schedule(occ("2026-10-01", "00:30", "01:00", MarkStatus.ABSENT))
        val settings = NotificationSettings(plannedSkipReminderTime = t("23:59"), quietStart = t("23:00"), quietEnd = t("07:00"))
        // 23:59 is in quiet hours and would move to 07:00 on the day itself, after the 00:30 class.
        assertTrue(notificationsBetween(s, settings, dt("2026-09-30T00:00"), dt("2026-10-02T00:00")).none { it is NotificationEvent.PlannedSkipReminder })
    }

    @Test
    fun `each kind can be switched off`() {
        val off = NotificationSettings(classReminders = false, markPrompts = false, dailyDigest = false, plannedSkipReminders = false)
        assertTrue(notificationsBetween(day, off, dt("2026-09-30T00:00"), dt("2026-10-03T00:00")).isEmpty())
    }

    @Test
    fun `lead time is bounded`() {
        assertThrows<IllegalArgumentException> { NotificationSettings(leadTimeMinutes = -1) }
        assertThrows<IllegalArgumentException> { NotificationSettings(leadTimeMinutes = 181) }
    }

    @Test
    fun `event ids are stable`() {
        val k = ClassKey("ee", d("2026-10-01"), t("09:00"))
        assertEquals(NotificationEvent.MarkPrompt(dt("2026-10-01T09:55"), k).id, NotificationEvent.MarkPrompt(dt("2026-10-02T07:00"), k).id)
    }
}
