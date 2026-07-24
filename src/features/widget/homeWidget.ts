import { Capacitor, registerPlugin } from "@capacitor/core"
import { Preferences } from "@capacitor/preferences"

// The glance snapshot the Android home-screen widget renders. Kept as plain
// pre-formatted strings so the native side does zero business logic -- it just
// paints these into text views.
export type WidgetSnapshot = {
  nextTitle: string
  nextMeta: string
  attendanceMain: string
  attendanceSub: string
  deadlinesMain: string
  skipMain: string
  updated: string
}

// Tiny native plugin (android/.../WidgetBridge.java) whose only job is to poke
// the widget to redraw after we write fresh data. registerPlugin resolves to a
// no-op proxy on the web, so calls are safe to make anywhere.
interface WidgetBridgePlugin {
  refresh(): Promise<void>
}
const WidgetBridge = registerPlugin<WidgetBridgePlugin>("WidgetBridge")

// Persists the snapshot to native storage (the same SharedPreferences file the
// widget reads) and asks the widget to redraw. No-op on the web, and tolerant
// of an older APK that doesn't yet have the native widget/bridge.
export async function updateHomeWidget(snap: WidgetSnapshot): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await Preferences.set({ key: "widget_payload", value: JSON.stringify(snap) })
    await WidgetBridge.refresh()
  } catch {
    /* widget or bridge not present in this build -- ignore */
  }
}
