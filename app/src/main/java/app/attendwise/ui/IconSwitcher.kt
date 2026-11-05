package app.attendwise.ui

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import app.attendwise.data.Derived

/**
 * The launcher icon follows attendance: green when every course is at or above
 * its requirement, red when most are below it, blue otherwise (or before any
 * class is marked). Switching is done by enabling one of three launcher
 * aliases, and only while the app is in the background, since some launchers
 * close the app when its launcher entry changes.
 */
object IconSwitcher {
    private enum class Look(val alias: String) { DEFAULT("LauncherDefault"), GOOD("LauncherGood"), BAD("LauncherBad") }

    private fun lookFor(d: Derived): Look {
        val measured = d.stats.values.mapNotNull { s -> s.currentPercent?.let { it < s.thresholdPercent } }
        if (measured.isEmpty()) return Look.DEFAULT
        val below = measured.count { it }
        return when {
            below == 0 -> Look.GOOD
            below * 2 > measured.size -> Look.BAD
            else -> Look.DEFAULT
        }
    }

    fun apply(context: Context, d: Derived?) {
        val want = if (d == null) return else lookFor(d)
        val pm = context.packageManager
        val base = "app.attendwise."
        val current = Look.entries.firstOrNull { look ->
            val state = pm.getComponentEnabledSetting(ComponentName(context.packageName, base + look.alias))
            state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && look == Look.DEFAULT)
        }
        if (current == want) return
        runCatching {
            // Enable the new entry before disabling the old one so there is never no launcher entry.
            pm.setComponentEnabledSetting(
                ComponentName(context.packageName, base + want.alias),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP,
            )
            Look.entries.filter { it != want }.forEach { other ->
                pm.setComponentEnabledSetting(
                    ComponentName(context.packageName, base + other.alias),
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP,
                )
            }
        }
    }
}
