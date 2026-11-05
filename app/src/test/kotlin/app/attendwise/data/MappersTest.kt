package app.attendwise.data

import app.attendwise.data.db.CalendarEntity
import app.attendwise.data.db.CourseEntity
import app.attendwise.data.db.ExtraClassEntity
import app.attendwise.data.db.MarkEntity
import app.attendwise.data.db.NotificationSettingsEntity
import app.attendwise.data.db.SemesterEntity
import app.attendwise.data.db.SlotEntity
import app.attendwise.domain.model.Audience
import app.attendwise.domain.model.ClassKey
import app.attendwise.domain.model.DayType
import app.attendwise.domain.model.MarkStatus
import app.attendwise.domain.model.SlotKind
import app.attendwise.domain.model.Term
import app.attendwise.domain.notify.NotificationSettings
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime

class MappersTest {
    private val day = LocalDate.of(2026, 11, 5)

    @Test
    fun `days and times convert to and from the stored numbers`() {
        assertEquals(day, day.toEpochDay().toDate())
        assertEquals(LocalTime.of(9, 30), (9 * 3600 + 30 * 60).toTime())
        assertEquals(9 * 3600 + 30 * 60, LocalTime.of(9, 30).toSec())
    }

    @Test
    fun `terms are read ignoring case and fall back to full semester`() {
        assertEquals(Term.FULL, termOf("full"))
        assertEquals(Term.PRE_MID, termOf("pre_mid"))
        assertEquals(Term.POST_MID, termOf("POST_MID"))
        assertEquals(Term.FULL, termOf("banana"))
    }

    @Test
    fun `slot kinds are read ignoring case and fall back to lecture`() {
        assertEquals(SlotKind.LAB, kindOf("lab"))
        assertEquals(SlotKind.TUTORIAL, kindOf("Tutorial"))
        assertEquals(SlotKind.LECTURE, kindOf("banana"))
    }

    @Test
    fun `mark statuses are read ignoring case and unknown ones are rejected`() {
        assertEquals(MarkStatus.PRESENT, statusOf("present"))
        assertEquals(MarkStatus.ON_DUTY, statusOf("On_Duty"))
        assertNull(statusOf("banana"))
    }

    @Test
    fun `values are written the way the backend expects`() {
        assertEquals("pre_mid", Term.PRE_MID.wire())
        assertEquals("lab", SlotKind.LAB.wire())
        assertEquals("on_duty", MarkStatus.ON_DUTY.wire())
    }

    @Test
    fun `a semester keeps its dates and optional mid semester dates`() {
        val plain = SemesterEntity(
            id = "s1", name = "Monsoon 2026",
            startDay = LocalDate.of(2026, 7, 23).toEpochDay(), endDay = LocalDate.of(2026, 11, 12).toEpochDay(),
            midStartDay = null, midEndDay = null, isActive = true,
        ).toDomain()
        assertEquals("Monsoon 2026", plain.name)
        assertEquals(LocalDate.of(2026, 7, 23), plain.start)
        assertEquals(LocalDate.of(2026, 11, 12), plain.end)
        assertNull(plain.midSemStart)
        assertNull(plain.midSemEnd)

        val withMid = SemesterEntity(
            id = "s2", name = "Winter 2027",
            startDay = LocalDate.of(2027, 1, 5).toEpochDay(), endDay = LocalDate.of(2027, 4, 30).toEpochDay(),
            midStartDay = LocalDate.of(2027, 2, 22).toEpochDay(), midEndDay = LocalDate.of(2027, 2, 28).toEpochDay(),
            isActive = true,
        ).toDomain()
        assertEquals(LocalDate.of(2027, 2, 22), withMid.midSemStart)
        assertEquals(LocalDate.of(2027, 2, 28), withMid.midSemEnd)
    }

    @Test
    fun `a course keeps its settings and an unknown term becomes full semester`() {
        val entity = CourseEntity(
            id = "c1", semesterId = "s1", code = "CS 201", name = "Data Structures", color = "#0F8B8D",
            thresholdPercent = 80, strictNoSkip = true, term = "pre_mid", archived = false,
        )
        val course = entity.toDomain()
        assertEquals("c1", course.id)
        assertEquals("CS 201", course.code)
        assertEquals("Data Structures", course.name)
        assertEquals(80, course.thresholdPercent)
        assertEquals(true, course.strictNoSkip)
        assertEquals(Term.PRE_MID, course.term)
        assertEquals(false, course.archived)

        assertEquals(Term.FULL, entity.copy(term = "banana").toDomain().term)
    }

    @Test
    fun `a timetable slot converts its times and keeps the weekday in range`() {
        val entity = SlotEntity(
            id = "t1", courseId = "c1", dayOfWeek = 4, startSec = 9 * 3600, endSec = 9 * 3600 + 55 * 60,
            room = "L2", kind = "lab", validFromDay = null, validToDay = null,
        )
        val slot = entity.toDomain()
        assertEquals(DayOfWeek.THURSDAY, slot.dayOfWeek)
        assertEquals(LocalTime.of(9, 0), slot.start)
        assertEquals(LocalTime.of(9, 55), slot.end)
        assertEquals("L2", slot.room)
        assertEquals(SlotKind.LAB, slot.kind)
        assertNull(slot.validFrom)
        assertNull(slot.validTo)

        assertEquals(DayOfWeek.MONDAY, entity.copy(dayOfWeek = 0).toDomain().dayOfWeek)
        assertEquals(DayOfWeek.SUNDAY, entity.copy(dayOfWeek = 9).toDomain().dayOfWeek)
    }

    @Test
    fun `an extra class keeps its date and times`() {
        val extra = ExtraClassEntity(
            id = "x1", courseId = "c1", day = day.toEpochDay(), startSec = 17 * 3600, endSec = 18 * 3600,
            room = null, kind = "tutorial",
        ).toDomain()
        assertEquals("c1", extra.courseId)
        assertEquals(day, extra.date)
        assertEquals(LocalTime.of(17, 0), extra.start)
        assertEquals(LocalTime.of(18, 0), extra.end)
        assertNull(extra.room)
        assertEquals(SlotKind.TUTORIAL, extra.kind)
    }

    @Test
    fun `a stored mark becomes a mark keyed by course day and start time`() {
        val entity = MarkEntity(
            courseId = "c1", day = day.toEpochDay(), startSec = 10 * 3600, endSec = 10 * 3600 + 55 * 60,
            status = "present", planId = "p1",
        )
        val mark = entity.toDomain()!!
        assertEquals(ClassKey("c1", day, LocalTime.of(10, 0)), mark.key)
        assertEquals(MarkStatus.PRESENT, mark.status)
        assertEquals("p1", mark.planId)
        assertEquals(LocalTime.of(10, 55), mark.end)

        val bare = entity.copy(endSec = null, planId = null).toDomain()!!
        assertNull(bare.end)
        assertNull(bare.planId)
    }

    @Test
    fun `a mark with an unknown status is dropped`() {
        val entity = MarkEntity(
            courseId = "c1", day = day.toEpochDay(), startSec = 10 * 3600, endSec = null,
            status = "banana", planId = null,
        )
        assertNull(entity.toDomain())
    }

    @Test
    fun `an institute day keeps its type audience and the weekday it follows`() {
        val entity = CalendarEntity(
            day = day.toEpochDay(), audience = "all", dayType = "reschedule",
            description = "Thursday runs the Friday timetable", followsDayOfWeek = 5,
        )
        val swap = entity.toDomain()!!
        assertEquals(day, swap.date)
        assertEquals(DayType.RESCHEDULE, swap.type)
        assertEquals(DayOfWeek.FRIDAY, swap.followsDayOfWeek)
        assertEquals(Audience.ALL, swap.audience)
        assertEquals("Thursday runs the Friday timetable", swap.description)

        assertEquals(Audience.FIRST_YEAR_UG, entity.copy(audience = "FIRST_YEAR_UG").toDomain()!!.audience)
        assertEquals(Audience.FIRST_YEAR_UG, entity.copy(audience = "first_year_ug").toDomain()!!.audience)
        assertEquals(Audience.ALL, entity.copy(audience = "everyone").toDomain()!!.audience)
    }

    @Test
    fun `an institute day with an unknown type is dropped and a bad weekday is ignored`() {
        val entity = CalendarEntity(
            day = day.toEpochDay(), audience = "all", dayType = "holiday", description = null, followsDayOfWeek = null,
        )
        assertEquals(DayType.HOLIDAY, entity.toDomain()!!.type)
        assertNull(entity.copy(dayType = "party").toDomain())
        assertNull(entity.copy(followsDayOfWeek = 0).toDomain()!!.followsDayOfWeek)
        assertNull(entity.copy(followsDayOfWeek = 8).toDomain()!!.followsDayOfWeek)
    }

    @Test
    fun `missing notification settings give the defaults`() {
        val none: NotificationSettingsEntity? = null
        assertEquals(NotificationSettings(), none.toDomain())
    }

    @Test
    fun `notification settings are converted and the lead time is kept between 0 and 180 minutes`() {
        val entity = NotificationSettingsEntity(
            userId = "u1", muted = true, classReminders = false, leadTimeMinutes = 500, markPrompts = false,
            dailyDigest = false, digestSec = 20 * 3600, plannedSkipReminders = false,
            quietStartSec = 23 * 3600, quietEndSec = 7 * 3600,
        )
        val settings = entity.toDomain()
        assertEquals(true, settings.muted)
        assertEquals(false, settings.classReminders)
        assertEquals(180, settings.leadTimeMinutes)
        assertEquals(false, settings.markPrompts)
        assertEquals(false, settings.dailyDigest)
        assertEquals(LocalTime.of(20, 0), settings.digestTime)
        assertEquals(false, settings.plannedSkipReminders)
        assertEquals(LocalTime.of(23, 0), settings.quietStart)
        assertEquals(LocalTime.of(7, 0), settings.quietEnd)

        assertEquals(0, entity.copy(leadTimeMinutes = -5).toDomain().leadTimeMinutes)
        val noQuiet = entity.copy(quietStartSec = null, quietEndSec = null).toDomain()
        assertNull(noQuiet.quietStart)
        assertNull(noQuiet.quietEnd)
    }
}
