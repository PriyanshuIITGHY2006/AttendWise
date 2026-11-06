package app.attendwise.domain.time

import java.time.LocalTime

/** Which part of the day it is, used for the greeting and the scene on the Today screen. */
public enum class DayPeriod {
    MORNING, AFTERNOON, EVENING, NIGHT;

    public companion object {
        /** Morning from 05:00, afternoon from 12:00, evening from 17:00 and night from 21:00. */
        public fun of(time: LocalTime): DayPeriod = when (time.hour) {
            in 5..11 -> MORNING
            in 12..16 -> AFTERNOON
            in 17..20 -> EVENING
            else -> NIGHT
        }
    }
}

/** "Good morning, Priyanshu", or just "Good morning" when there is no usable name. */
public fun greeting(period: DayPeriod, firstName: String?): String {
    val base = when (period) {
        DayPeriod.MORNING -> "Good morning"
        DayPeriod.AFTERNOON -> "Good afternoon"
        DayPeriod.EVENING -> "Good evening"
        DayPeriod.NIGHT -> "Good night"
    }
    return if (firstName.isNullOrBlank()) base else "$base, $firstName"
}

/** The first name from a full name, capitalised. Null for blanks, single letters and email addresses. */
public fun firstNameOf(fullName: String?): String? {
    val raw = fullName?.trim()?.split(Regex("\\s+"))?.firstOrNull() ?: return null
    if (raw.contains('@')) return null
    val name = raw.filter { it.isLetter() || it == '\'' || it == '-' }.take(24)
    if (name.length < 2) return null
    return name.replaceFirstChar { it.uppercase() }
}
