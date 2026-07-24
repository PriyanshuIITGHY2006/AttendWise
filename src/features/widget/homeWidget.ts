import { Capacitor, registerPlugin } from "@capacitor/core"

// The glance snapshot the Android home-screen widgets render. Kept as plain
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

// Small native plugin (android/.../WidgetBridge.java): it persists the snapshot
// to native storage and redraws every widget. registerPlugin resolves to a
// no-op proxy on the web, so calls are safe to make anywhere. Writing through
// our own plugin means no extra Capacitor storage dependency.
interface WidgetBridgePlugin {
  update(options: { payload: string }): Promise<void>
}
const WidgetBridge = registerPlugin<WidgetBridgePlugin>("WidgetBridge")

// Hands the latest snapshot to the native widgets. No-op on the web, and
// tolerant of an older APK that doesn't yet have the bridge.
export async function updateHomeWidget(snap: WidgetSnapshot): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await WidgetBridge.update({ payload: JSON.stringify(snap) })
  } catch {
    /* widget/bridge not present in this build -- ignore */
  }
}
