package app.attendwise.ui.components

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LoaderPickTest {
    @Test
    fun `the next scene is never the one shown last time`() {
        for (last in 0 until LOADER_SCENES) {
            for (i in 0..99) assertNotEquals(last, nextLoader(last, LOADER_SCENES, i / 100f))
        }
    }

    @Test
    fun `every result is a valid scene, even at the top of the random range`() {
        for (i in 0..100) {
            val n = nextLoader(-1, LOADER_SCENES, i / 100f)
            assertTrue(n in 0 until LOADER_SCENES)
        }
    }

    @Test
    fun `every scene can be reached`() {
        val seen = (0..99).map { nextLoader(-1, LOADER_SCENES, it / 100f) }.toSet()
        assertEquals(LOADER_SCENES, seen.size)
    }
}
