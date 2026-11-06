package app.attendwise.domain.schedule

import app.attendwise.domain.model.SlotKind
import java.time.DayOfWeek
import java.time.LocalTime

/** One weekly class time that belongs to a named slot. */
public data class SlotTime(val day: DayOfWeek, val start: LocalTime, val end: LocalTime, val kind: SlotKind)

/**
 * The IIT Guwahati timetable slots for the July to November 2026 semester. A course is given a
 * slot letter and meets at that slot's times every week, so picking a slot can fill the timetable.
 *
 * Theory slots are one hour long (08:00 to 08:55 and so on). The class at 08:00 is a tutorial in
 * every slot, as the other hours of the slot are lectures. Lab slots (ML1 to ML5 in the morning,
 * AL1 to AL5 in the afternoon) are three hours long.
 */
public object IitgSlots {
    private val days = mapOf(
        "Mon" to DayOfWeek.MONDAY, "Tue" to DayOfWeek.TUESDAY, "Wed" to DayOfWeek.WEDNESDAY,
        "Thu" to DayOfWeek.THURSDAY, "Fri" to DayOfWeek.FRIDAY,
    )

    private val theoryTable = listOf(
        "A: Mon8 Tue9 Wed10 Thu11",
        "B: Mon9 Tue10 Wed11 Fri8",
        "C: Mon10 Tue11 Thu8 Fri9",
        "D: Mon11 Wed8 Thu9 Fri10",
        "E: Tue8 Wed9 Thu10",
        "F: Mon12 Tue12 Fri11",
        "G: Wed12 Thu12 Fri12",
        "A1: Mon17 Tue16 Wed15 Thu14",
        "B1: Mon16 Tue15 Wed14 Fri17",
        "C1: Mon15 Tue14 Thu17 Fri16",
        "D1: Mon14 Wed17 Thu16 Fri15",
        "E1: Tue17 Wed16 Thu15",
        "F1: Mon13 Tue13 Fri14",
        "G1: Wed13 Thu13 Fri13",
    )

    private val theory: Map<String, List<SlotTime>> = theoryTable.associate { row ->
        val (name, rest) = row.split(": ")
        name to rest.split(" ").map { cell ->
            val day = days.getValue(cell.take(3))
            val hour = cell.drop(3).toInt()
            SlotTime(day, LocalTime.of(hour, 0), LocalTime.of(hour, 55), if (hour == 8) SlotKind.TUTORIAL else SlotKind.LECTURE)
        }
    }

    private val labs: Map<String, List<SlotTime>> =
        (listOf("ML" to 9, "AL" to 14)).flatMap { (prefix, hour) ->
            days.values.mapIndexed { i, day ->
                "$prefix${i + 1}" to listOf(SlotTime(day, LocalTime.of(hour, 0), LocalTime.of(hour + 2, 55), SlotKind.LAB))
            }
        }.toMap()

    /** Theory slot names in table order: A to G, then A1 to G1. */
    public val theoryNames: List<String> = theory.keys.toList()

    /** Lab slot names: ML1 to ML5, then AL1 to AL5. */
    public val labNames: List<String> = labs.keys.toList()

    /** The weekly class times of a slot, or null if there is no slot with that name. */
    public fun times(name: String): List<SlotTime>? = theory[name] ?: labs[name]

    /** Names of the slots whose every class time appears in [times] (the kind is ignored). */
    public fun matching(times: Collection<SlotTime>): List<String> =
        (theoryNames + labNames).filter { name ->
            times(name).orEmpty().all { t -> times.any { it.day == t.day && it.start == t.start && it.end == t.end } }
        }
}
