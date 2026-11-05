package app.attendwise.notify

import app.attendwise.domain.planner.TodayVerdict

/**
 * Notification and verdict copy in three voices: "roast" (deadpan, never mean),
 * "plain" (facts only) and "kuchupuchu" (clingy Hinglish bestie). Every line
 * still carries the real fact. Variants are picked from a seed, so the same
 * event shows the same line all day instead of changing on every refresh.
 */
object Copy {
    private fun pick(variants: List<String>, seed: String): String {
        var hash = 0
        for (c in seed) hash = hash * 31 + c.code
        return variants[Math.floorMod(hash, variants.size)]
    }

    fun classSoon(course: String, minutes: Int, voice: String, seed: String): String = when (voice) {
        "plain" -> if (minutes <= 0) "$course starts now." else "$course starts in $minutes min."
        "kuchupuchu" -> pick(
            listOf(
                "Kuchupuchu tum kaha ho?? $course $minutes min me start ho raha hai 🥺",
                "Oye kuchupuchu 👀 $course start hone wala hai, sirf $minutes min bache. Chalo chalo!",
                "Meri jaan $course $minutes min me shuru 💕 kuchupuchu late mat hona",
                "$course $minutes min me 😤 kuchupuchu bed chhodo, mujhe nahi",
                "Psst kuchupuchu 🤫 $course $minutes min door hai. Bhaago!",
            ),
            seed,
        )
        else -> pick(
            listOf(
                "$course starts in $minutes min. Bed is not a lecture hall, unfortunately.",
                "$minutes minutes to $course. Time to pretend you did the reading.",
                "$course in $minutes. Moving. Now. Not later.",
                "T-minus $minutes min to $course. This is not a drill.",
            ),
            seed,
        )
    }

    fun markPrompt(course: String, voice: String, seed: String): String = when (voice) {
        "plain" -> "$course just ended. Were you there?"
        "kuchupuchu" -> pick(
            listOf(
                "Kuchupuchu $course khatam 🥺 gaye the na?",
                "$course over kuchupuchu 👀 present ya bunk?",
                "Kuchupuchu sach batao 🫣 $course attend kiya?",
            ),
            seed,
        )
        else -> pick(
            listOf(
                "$course just ended. Were you there, or there in spirit?",
                "$course is over. Present, or a very convincing absence?",
                "Roll call for $course. Be honest, the app can take it.",
            ),
            seed,
        )
    }

    fun threshold(course: String, percent: Int, atRisk: Boolean, voice: String, seed: String): String = when (voice) {
        "plain" ->
            if (atRisk) "$course is at $percent%, below your required attendance. Try not to miss the next classes."
            else "$course is at $percent% with no safe skips left. Attend the upcoming classes to stay above the requirement."
        "kuchupuchu" ->
            if (atRisk) {
                pick(
                    listOf(
                        "Kuchupuchu 😭 $course sirf $percent% pe hai. Ab to jaana hi padega jaan",
                        "Oye kuchupuchu $percent%?! $course ki attendance ICU me hai 🏥",
                        "Meri jaan $course $percent% 🚑 kuchupuchu ab har class must hai, samjhe?",
                    ),
                    seed,
                )
            } else {
                pick(
                    listOf(
                        "Kuchupuchu $course $percent%, ab koi skip nahi bacha 😬 sambhal ke chalo",
                        "Kuchupuchu yellow alert 🟨 $course $percent%. Safe skips = 0. Attend karo",
                        "$percent% $course 😐 kuchupuchu ab bunk ka budget zero. Chalo",
                    ),
                    seed,
                )
            }
        else ->
            if (atRisk) {
                pick(
                    listOf(
                        "$course attendance is in the ICU at $percent%. Might be time for your best sob story.",
                        "$course: $percent%. Even the attendance register has trust issues with you now.",
                        "$course is circling the drain at $percent%. Show your face before it becomes a \"who?\" situation.",
                    ),
                    seed,
                )
            } else {
                pick(
                    listOf(
                        "$course is at $percent% with zero skips left. One bad day from a very bad time.",
                        "$course: walking a tightrope, no net, $percent%. Choose your next skip very wisely.",
                        "$percent% in $course. The margin is now theoretical.",
                    ),
                    seed,
                )
            }
    }

    fun unmarked(count: Int, voice: String, seed: String): String {
        val n = if (count == 1) "class" else "classes"
        return when (voice) {
            "plain" -> "You have $count unmarked $n today. Mark them to keep your attendance accurate."
            "kuchupuchu" -> pick(
                listOf(
                    "Kuchupuchu $count $n unmarked pade hain 🥺 mark kardo na please",
                    "$count $n limbo me 👻 kuchupuchu inko present/absent bata do",
                    "Kuchupuchu $count $n reh gaye 📝 jaldi mark karo warna safe-skip bigad jayega",
                ),
                seed,
            )
            else -> pick(
                listOf(
                    "$count $n still unmarked. Schrödinger's attendance.",
                    "$count unmarked $n sitting there. The app is assuming the worst about your day.",
                    "Your attendance has $count unsolved mysteries. Handle it.",
                ),
                seed,
            )
        }
    }

    fun plannedSkip(courses: String, voice: String, seed: String): String = when (voice) {
        "plain" -> "Reminder: you planned to skip $courses tomorrow."
        "kuchupuchu" -> pick(
            listOf(
                "Kuchupuchu kal $courses bunk karne wale ho na? 🥲 last chance, soch lo",
                "Oye kuchupuchu 👀 kal $courses skip? sach me? mujhe chhod ke?",
                "Kuchupuchu reminder: kal $courses skip. No judgment... thoda judgment 🙃",
            ),
            seed,
        )
        else -> pick(
            listOf(
                "Reminder: you're skipping $courses tomorrow. Last call to back out like a responsible adult.",
                "Tomorrow: skipping $courses, allegedly. Still feeling brave?",
                "$courses tomorrow. You already told the app you're not going. No judgment. Some judgment.",
            ),
            seed,
        )
    }

    /** One line for the "Can I bunk today?" card and widget. */
    fun todayVerdict(kind: TodayVerdict.Kind, skippable: List<String>, mustAttend: List<String>, voice: String, seed: String): String {
        val skip = skippable.joinToString(", ")
        val worst = mustAttend.firstOrNull()
        return when (kind) {
            TodayVerdict.Kind.NO_CLASSES_TODAY -> when (voice) {
                "plain" -> "No classes today."
                "kuchupuchu" -> "Aaj koi class nahi kuchupuchu 🥳 aaram karo"
                else -> "No classes today. Rest is also productive, apparently."
            }
            TodayVerdict.Kind.DAY_DONE -> when (voice) {
                "plain" -> "No classes left today."
                "kuchupuchu" -> "Aaj ka kaam khatam kuchupuchu 😌"
                else -> "Day's over. Whatever happened, happened."
            }
            TodayVerdict.Kind.ALL_SKIPPABLE -> when (voice) {
                "plain" -> "You can skip all of today's remaining classes."
                "kuchupuchu" -> "Kuchupuchu aaj sab skip kar sakte ho... par mat karo na 🥺"
                else -> pick(listOf("Technically you could skip everything today. Technically.", "Every class today is skippable. Use this power wisely."), seed)
            }
            TodayVerdict.Kind.SOME_SKIPPABLE -> when (voice) {
                "plain" -> "You can skip $skip today. Attend the rest."
                "kuchupuchu" -> "Kuchupuchu sirf $skip skip ho sakta hai 😌 baaki attend karo"
                else -> "Only $skip. The rest need you" + (worst?.let { ", $it most of all." } ?: ".")
            }
            TodayVerdict.Kind.NONE_SKIPPABLE -> when (voice) {
                "plain" -> "Attend every class today."
                "kuchupuchu" -> "Aaj ek bhi bunk nahi kuchupuchu 😤"
                else -> pick(listOf("Not today. Every class needs you.", "Zero bunks available today. Shoes on."), seed)
            }
        }
    }

    fun digestTitle(voice: String): String = when (voice) {
        "kuchupuchu" -> "Kuchupuchu, din kaisa raha? 🌙"
        else -> "Today in AttendWise"
    }
}
