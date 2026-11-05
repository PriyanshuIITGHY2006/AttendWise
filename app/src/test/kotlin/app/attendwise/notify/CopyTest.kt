package app.attendwise.notify

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class CopyTest {
    private val voices = listOf("roast", "plain", "kuchupuchu")
    private val seeds = listOf("a", "b", "c", "d", "e", "f", "2026-11-05", "x1")

    @Test
    fun `the plain voice states the facts directly`() {
        assertEquals("CS 201 starts in 10 min.", Copy.classSoon("CS 201", 10, "plain", "s"))
        assertEquals("CS 201 starts now.", Copy.classSoon("CS 201", 0, "plain", "s"))
        assertEquals("CS 201 just ended. Were you there?", Copy.markPrompt("CS 201", "plain", "s"))
        assertEquals("Reminder: you planned to skip CS 201 and EE 203 tomorrow.", Copy.plannedSkip("CS 201 and EE 203", "plain", "s"))
    }

    @Test
    fun `every voice still carries the course and the minutes`() {
        for (voice in voices) for (seed in seeds) {
            val line = Copy.classSoon("CS 201", 15, voice, seed)
            assertTrue(line.contains("CS 201"), "$voice/$seed: $line")
            assertTrue(line.contains("15"), "$voice/$seed: $line")
        }
    }

    @Test
    fun `every voice still names the course in a mark prompt`() {
        for (voice in voices) for (seed in seeds) {
            val line = Copy.markPrompt("CS 201", voice, seed)
            assertTrue(line.contains("CS 201"), "$voice/$seed: $line")
        }
    }

    @Test
    fun `every voice still carries the course and the percentage in a threshold alert`() {
        for (voice in voices) for (atRisk in listOf(true, false)) for (seed in seeds) {
            val line = Copy.threshold("EE 203", 62, atRisk, voice, seed)
            assertTrue(line.contains("EE 203"), "$voice/$atRisk/$seed: $line")
            assertTrue(line.contains("62"), "$voice/$atRisk/$seed: $line")
        }
    }

    @Test
    fun `the plain threshold alert tells at risk from tight`() {
        val risk = Copy.threshold("EE 203", 62, true, "plain", "s")
        val tight = Copy.threshold("EE 203", 76, false, "plain", "s")
        assertEquals("EE 203 is at 62%, below your required attendance. Try not to miss the next classes.", risk)
        assertEquals("EE 203 is at 76% with no safe skips left. Attend the upcoming classes to stay above the requirement.", tight)
    }

    @Test
    fun `the unmarked count is always shown and the plain voice handles one and many`() {
        assertEquals("You have 1 unmarked class today. Mark them to keep your attendance accurate.", Copy.unmarked(1, "plain", "s"))
        assertEquals("You have 3 unmarked classes today. Mark them to keep your attendance accurate.", Copy.unmarked(3, "plain", "s"))
        for (voice in voices) for (seed in seeds) {
            val line = Copy.unmarked(7, voice, seed)
            assertTrue(line.contains("7"), "$voice/$seed: $line")
        }
    }

    @Test
    fun `the same seed gives the same line and different seeds give some variety`() {
        for (voice in listOf("roast", "kuchupuchu")) {
            assertEquals(
                Copy.classSoon("CS 201", 10, voice, "2026-11-05"),
                Copy.classSoon("CS 201", 10, voice, "2026-11-05"),
            )
            val lines = ('a'..'z').map { Copy.classSoon("CS 201", 10, voice, it.toString()) }.toSet()
            assertTrue(lines.size >= 2, "$voice gave only ${lines.size} line")
        }
    }

    @Test
    fun `the digest title depends on the voice`() {
        assertEquals("Today in AttendWise", Copy.digestTitle("plain"))
        assertEquals("Today in AttendWise", Copy.digestTitle("roast"))
        assertTrue(Copy.digestTitle("kuchupuchu").startsWith("Kuchupuchu"))
    }
}
