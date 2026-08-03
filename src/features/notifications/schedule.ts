import { Capacitor } from "@capacitor/core"
import { LocalNotifications, type ActionPerformed } from "@capacitor/local-notifications"
import { thresholdRoast, unmarkedNudge, classStartingSoon, quizReminder, dailyDigest, plannedSkipReminder } from "./copy"
import type { NotificationPrefs } from "./api"

const NATIVE = () => Capacitor.isNativePlatform()

// Notification ids are namespaced by type so a fresh sync can cancel exactly
// "our" pending notifications without touching anything else. Capacitor ids
// are 32-bit ints, so seeds are hashed down into a range per namespace.
const NAMESPACE = {
  class: 1_000_000_000,
  quiz: 1_100_000_000,
  threshold: 1_200_000_000,
  unmarked: 1_300_000_000,
  planned: 1_350_000_000,
  digest: 1_400_000_000,
} as const

// A single fixed id for the repeating daily digest (only ever one at a time).
const DIGEST_ID = NAMESPACE.digest + 1

// Action group attached to class reminders so the user can mark attendance
// straight from the notification without opening the app.
export const CLASS_ACTION_TYPE = "ATTEND_CLASS"

// Our own notification channel, created with HIGH importance so notifications
// actually play a sound and pop as heads-up -- Android's default channel was
// landing them silently. A channel's importance/sound are locked once created,
// so this id is versioned: bump the suffix to force a fresh channel if these
// settings ever need to change.
const CHANNEL_ID = "attendwise-alerts-v1"

// Android-only presentation options spread into every scheduled notification:
// the channel (for sound), the monochrome status-bar icon, and the brand tint.
const ANDROID_OPTS = {
  channelId: CHANNEL_ID,
  smallIcon: "ic_stat_attendwise",
  iconColor: "#4F46E5",
} as const

/**
 * Creates the high-importance channel that all AttendWise notifications post to.
 * Idempotent -- safe to call on every app start. Omitting `sound` makes the
 * channel use the system default notification sound (importance HIGH already
 * enables sound + heads-up).
 */
export async function ensureNotificationChannel() {
  if (!NATIVE()) return
  if (Capacitor.getPlatform() !== "android") return
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: "Class reminders & alerts",
    description: "Class reminders, attendance warnings and nudges",
    importance: 5, // HIGH: sound + heads-up banner
    visibility: 1, // show full content on the lock screen
    vibration: true,
    lights: true,
    lightColor: "#4F46E5",
  })
}

function hashToRange(seed: string, base: number, span: number): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return base + (hash % span)
}

let permissionRequested = false

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!NATIVE()) return false
  if (permissionRequested) {
    const status = await LocalNotifications.checkPermissions()
    return status.display === "granted"
  }
  permissionRequested = true
  const status = await LocalNotifications.requestPermissions()
  return status.display === "granted"
}

/**
 * Registers the "Present / Absent" action buttons once, so class reminders can
 * carry them. Safe to call on every app start.
 */
export async function registerNotificationActions() {
  if (!NATIVE()) return
  await ensureNotificationChannel()
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: CLASS_ACTION_TYPE,
        actions: [
          { id: "present", title: "Present" },
          { id: "absent", title: "Absent", destructive: true },
        ],
      },
    ],
  })
}

/**
 * Wires a callback to fire when the user taps Present/Absent on a class
 * reminder. Returns an unsubscribe function. The session + user id ride along
 * in the notification's `extra` payload.
 */
export function addNotificationActionListener(
  onMark: (sessionId: string, userId: string, status: "present" | "absent") => void | Promise<void>,
): () => void {
  if (!NATIVE()) return () => {}
  const handlePromise = LocalNotifications.addListener(
    "localNotificationActionPerformed",
    async (payload: ActionPerformed) => {
      const actionId = payload.actionId
      if (actionId !== "present" && actionId !== "absent") return
      const extra = payload.notification.extra as { sessionId?: string; userId?: string } | undefined
      if (!extra?.sessionId || !extra?.userId) return
      await onMark(extra.sessionId, extra.userId, actionId)
    },
  )
  return () => {
    handlePromise.then((h) => h.remove())
  }
}

type UpcomingClassForNotify = {
  id: string
  courseId: string
  courseName: string
  dateISO: string // "YYYY-MM-DD"
  startTime: string // "HH:MM:SS"
}

type UpcomingEventForNotify = {
  id: string
  title: string
  courseName: string
  eventDateISO: string
}

type PlannedSkipForNotify = {
  sessionId: string
  courseName: string
  dateISO: string
}

// Parses "HH:MM" / "HH:MM:SS" into minutes-since-midnight.
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

// True if the given moment falls inside the user's quiet-hours window. Handles
// windows that wrap past midnight (e.g. 22:00 -> 07:00).
function inQuietHours(at: Date, quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) return false
  const start = toMinutes(quietStart)
  const end = toMinutes(quietEnd)
  if (start === end) return false
  const cur = at.getHours() * 60 + at.getMinutes()
  return start < end ? cur >= start && cur < end : cur >= start || cur < end
}

type SyncInput = {
  upcomingClasses: UpcomingClassForNotify[]
  upcomingEvents: UpcomingEventForNotify[]
  plannedSkips: PlannedSkipForNotify[]
  prefs: NotificationPrefs
  userId: string
}

/**
 * Cancels every notification AttendWise previously scheduled (identified by
 * id range) and reschedules a fresh batch from the current data + preferences.
 * Cheap to call on every app load/refresh since there's no background server to
 * push updates otherwise.
 */
export async function syncScheduledNotifications({ upcomingClasses, upcomingEvents, plannedSkips, prefs, userId }: SyncInput) {
  if (!NATIVE()) return
  const granted = await ensureNotificationPermission()
  if (!granted) return

  // Clear our whole id range first, so toggling any preference off actually
  // removes the pending notifications it used to produce.
  const pending = await LocalNotifications.getPending()
  const ours = pending.notifications.filter((n) => n.id >= NAMESPACE.class && n.id <= DIGEST_ID)
  if (ours.length > 0) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) })

  if (prefs.muted) return // master switch: nothing scheduled while muted

  const voice = prefs.humor_level
  const now = Date.now()
  const notifications: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = []

  if (prefs.class_reminders) {
    // upcomingClasses spans a rolling window (today .. +N days), so the whole
    // week's reminders are queued with the OS and fire in the background even if
    // the app isn't opened again before then.
    for (const s of upcomingClasses) {
      const start = new Date(`${s.dateISO}T${s.startTime}`)
      const fireAt = new Date(start.getTime() - prefs.lead_time_minutes * 60_000)
      if (fireAt.getTime() <= now) continue
      if (inQuietHours(fireAt, prefs.quiet_start, prefs.quiet_end)) continue
      notifications.push({
        ...ANDROID_OPTS,
        id: hashToRange(`class-${s.id}`, NAMESPACE.class, 100_000_000),
        title: "Class starting soon",
        body: classStartingSoon(s.courseName, prefs.lead_time_minutes, `${s.id}-${s.startTime}`, voice),
        schedule: { at: fireAt },
        actionTypeId: CLASS_ACTION_TYPE,
        extra: { sessionId: s.id, userId },
      })
    }
  }

  if (prefs.quiz_reminders) {
    for (const ev of upcomingEvents) {
      const eventDate = new Date(`${ev.eventDateISO}T09:00:00`)
      const daysAway = Math.ceil((eventDate.getTime() - now) / 86_400_000)
      if (daysAway < 0 || daysAway > 3) continue
      const fireAt = daysAway === 0 ? new Date(now + 60_000) : new Date(eventDate.getTime() - 86_400_000)
      if (fireAt.getTime() <= now) continue
      if (inQuietHours(fireAt, prefs.quiet_start, prefs.quiet_end)) continue
      notifications.push({
        ...ANDROID_OPTS,
        id: hashToRange(`quiz-${ev.id}`, NAMESPACE.quiz, 100_000_000),
        title: "Coming up",
        body: quizReminder(ev.title, ev.courseName, Math.max(1, daysAway), ev.id, voice),
        schedule: { at: fireAt },
      })
    }
  }

  // Planned-skip reminders: the evening (18:00) before a class the student has
  // already penciled in as a skip -- a last call to change their mind.
  if (prefs.planned_skip_reminders) {
    for (const skip of plannedSkips) {
      const dayBefore = new Date(`${skip.dateISO}T18:00:00`)
      dayBefore.setDate(dayBefore.getDate() - 1)
      if (dayBefore.getTime() <= now) continue
      if (inQuietHours(dayBefore, prefs.quiet_start, prefs.quiet_end)) continue
      notifications.push({
        ...ANDROID_OPTS,
        id: hashToRange(`planned-${skip.sessionId}`, NAMESPACE.planned, 50_000_000),
        title: "Skipping tomorrow?",
        body: plannedSkipReminder(skip.courseName, skip.sessionId, voice),
        schedule: { at: dayBefore },
      })
    }
  }

  // Repeating morning digest at the user's chosen time. `on: {hour, minute}`
  // makes Capacitor refire it every day; the body stays generic on purpose.
  if (prefs.daily_digest) {
    const [dh, dm] = prefs.daily_digest_time.split(":").map(Number)
    notifications.push({
      ...ANDROID_OPTS,
      id: DIGEST_ID,
      title: "AttendWise",
      body: dailyDigest(`digest-${prefs.daily_digest_time}`, voice),
      schedule: { on: { hour: dh, minute: dm }, allowWhileIdle: true },
    })
  }

  if (notifications.length > 0) await LocalNotifications.schedule({ notifications })
}

// Threshold roasts and the unmarked nudge fire immediately (not scheduled)
// the moment the app notices the condition, deduped per day via localStorage
// so re-opening the app doesn't spam the same roast repeatedly.
function alreadyFiredToday(key: string): boolean {
  const todayISO = new Date().toISOString().slice(0, 10)
  return localStorage.getItem(key) === todayISO
}

function markFiredToday(key: string) {
  localStorage.setItem(key, new Date().toISOString().slice(0, 10))
}

export async function notifyThresholdIfChanged(
  courseId: string,
  courseName: string,
  percent: number,
  status: "green" | "yellow" | "red",
  prefs: NotificationPrefs,
) {
  if (!NATIVE()) return
  const key = `attendwise_notified_status_${courseId}`
  const lastStatus = localStorage.getItem(key)
  if (lastStatus === status) return
  localStorage.setItem(key, status)
  if (status !== "red" && status !== "yellow") return
  if (prefs.muted || !prefs.threshold_alerts) return
  const granted = await ensureNotificationPermission()
  if (!granted) return
  const today = new Date().toISOString().slice(0, 10)
  await LocalNotifications.schedule({
    notifications: [
      {
        ...ANDROID_OPTS,
        id: hashToRange(`threshold-${courseId}-${status}-${today}`, NAMESPACE.threshold, 100_000_000),
        title: status === "red" ? "Attendance in trouble" : "Cutting it close",
        body: thresholdRoast(courseName, percent, status, `${courseId}-${today}`, prefs.humor_level),
        schedule: { at: new Date(Date.now() + 1000) },
      },
    ],
  })
}

export async function notifyUnmarkedIfNeeded(count: number, prefs: NotificationPrefs) {
  if (!NATIVE() || count === 0) return
  if (prefs.muted || !prefs.unmarked_nudges) return
  const key = "attendwise_notified_unmarked"
  if (alreadyFiredToday(key)) return
  markFiredToday(key)
  const granted = await ensureNotificationPermission()
  if (!granted) return
  const today = new Date().toISOString().slice(0, 10)
  await LocalNotifications.schedule({
    notifications: [
      {
        ...ANDROID_OPTS,
        id: hashToRange(`unmarked-${today}`, NAMESPACE.unmarked, 100_000_000),
        title: "Unmarked classes",
        body: unmarkedNudge(count, `${count}-${today}`, prefs.humor_level),
        schedule: { at: new Date(Date.now() + 1000) },
      },
    ],
  })
}
