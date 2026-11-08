package app.attendwise.ui.components

/** How many scenes there are: a paper boat, a streak, a paper plane, a class clock and a balloon. */
internal const val LOADER_SCENES = 5

/** The next scene: random, but never the one shown last time. */
internal fun nextLoader(last: Int, count: Int, random: Float): Int {
    if (count <= 1) return 0
    val next = minOf((random * count).toInt(), count - 1)
    return if (next == last) (next + 1) % count else next
}
