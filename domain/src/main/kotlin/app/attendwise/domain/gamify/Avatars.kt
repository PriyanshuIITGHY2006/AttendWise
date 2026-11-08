package app.attendwise.domain.gamify

/**
 * Profile pictures. Anyone can pick any of them. The drawings are Open Peeps by
 * Pablo Stanley (CC0, public domain), rendered with DiceBear. The id is what is
 * stored in the profile, and it is the same on the web app.
 */
public data class Avatar(val id: String, val title: String, val line: String)

public val AVATARS: List<Avatar> = listOf(
    Avatar("sleepyhead", "Sleepyhead", "8 AM is a rumour."),
    Avatar("latecomer", "Latecomer", "Arrives with the professor."),
    Avatar("front-bencher", "Front Bencher", "First row. First question."),
    Avatar("back-bencher", "Back Bencher", "Sees everything from the last row."),
    Avatar("chai-champion", "Chai Break Champion", "Back in five minutes. Always."),
    Avatar("night-owl", "Night Owl", "Wide awake at 3 AM."),
    Avatar("last-minute", "Last Minute Legend", "Starts studying when the exam starts."),
    Avatar("strategist", "The Strategist", "Knows how many safe skips are left."),
    Avatar("lab-rat", "Lab Rat", "Lives in the lab. Smells like solder."),
    Avatar("comeback-kid", "Comeback Kid", "Was at 62%. Now at 81%."),
    Avatar("perfect-streak", "Perfect Streak", "Never missed one. Show-off."),
    Avatar("notes-hoarder", "Notes Hoarder", "Has the notes. You will be borrowing them."),
)

public fun avatarById(id: String?): Avatar? = AVATARS.firstOrNull { it.id == id }
