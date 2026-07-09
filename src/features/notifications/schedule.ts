import { Capacitor } from "@capacitor/core"
import { LocalNotifications } from "@capacitor/local-notifications"
import { thresholdRoast, unmarkedNudge, classStartingSoon, quizReminder } from "./copy"

const NATIVE = () => Capacitor.isNativePlatform()

// Notification ids are namespaced by type so a fresh sync can cancel exactly
// "our" pending notifications without touching anything else. Capacitor ids
// are 32-bit ints, so seeds are hashed down into a range per namespace.
const NAMESPACE = {
  class: 1_000_000_000,
  quiz: 1_100_000_000,
  threshold: 1_200_000_000,
  unmarked: 1_300_000_000,
} as const

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

type TodaySessionForNotify = {
  id: string
  courseId: string
  courseName: string
  startTime: string // "HH:MM:SS"
  alreadyMarked: boolean
}

type UpcomingEventForNotify = {
  id: string
  title: string
  courseName: string
  eventDateISO: string
}

/**
 * Cancels every notification AttendWise previously scheduled (identified by
 * id range) and reschedules a fresh batch from the current data. Cheap to
 * call on every app load/refresh since there's no background server to push
 * updates otherwise.
 */
export async function syncScheduledNotifications(
  todaySessions: TodaySessionForNotify[],
  upcomingEvents: UpcomingEventForNotify[],
  leadTimeMinutes: number,
) {
  if (!NATIVE()) return
  const granted = await ensureNotificationPermission()
  if (!granted) return

  const pending = await LocalNotifications.getPending()
  const ours = pending.notifications.filter((n) => n.id >= NAMESPACE.class && n.id < NAMESPACE.unmarked + 100_000_000)
  if (ours.length > 0) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) })

  const now = Date.now()
  const notifications: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = []

  for (const s of todaySessions) {
    if (s.alreadyMarked) continue
    const [h, m] = s.startTime.split(":").map(Number)
    const start = new Date()
    start.setHours(h, m, 0, 0)
    const fireAt = new Date(start.getTime() - leadTimeMinutes * 60_000)
    if (fireAt.getTime() <= now) continue
    notifications.push({
      id: hashToRange(`class-${s.id}`, NAMESPACE.class, 100_000_000),
      title: "Class starting soon",
      body: classStartingSoon(s.courseName, leadTimeMinutes, `${s.id}-${s.startTime}`),
      schedule: { at: fireAt },
    })
  }

  for (const ev of upcomingEvents) {
    const eventDate = new Date(`${ev.eventDateISO}T09:00:00`)
    const daysAway = Math.ceil((eventDate.getTime() - now) / 86_400_000)
    if (daysAway < 0 || daysAway > 3) continue
    const fireAt = daysAway === 0 ? new Date(now + 60_000) : new Date(eventDate.getTime() - 86_400_000)
    if (fireAt.getTime() <= now) continue
    notifications.push({
      id: hashToRange(`quiz-${ev.id}`, NAMESPACE.quiz, 100_000_000),
      title: "Coming up",
      body: quizReminder(ev.title, ev.courseName, Math.max(1, daysAway), ev.id),
      schedule: { at: fireAt },
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
) {
  if (!NATIVE()) return
  const key = `attendwise_notified_status_${courseId}`
  const lastStatus = localStorage.getItem(key)
  if (lastStatus === status) return
  localStorage.setItem(key, status)
  if (status !== "red" && status !== "yellow") return
  const granted = await ensureNotificationPermission()
  if (!granted) return
  await LocalNotifications.schedule({
    notifications: [
      {
        id: hashToRange(`threshold-${courseId}-${status}-${new Date().toISOString().slice(0, 10)}`, NAMESPACE.threshold, 100_000_000),
        title: status === "red" ? "Attendance in trouble" : "Cutting it close",
        body: thresholdRoast(courseName, percent, status, `${courseId}-${new Date().toISOString().slice(0, 10)}`),
        schedule: { at: new Date(Date.now() + 1000) },
      },
    ],
  })
}

export async function notifyUnmarkedIfNeeded(count: number) {
  if (!NATIVE() || count === 0) return
  const key = "attendwise_notified_unmarked"
  if (alreadyFiredToday(key)) return
  markFiredToday(key)
  const granted = await ensureNotificationPermission()
  if (!granted) return
  await LocalNotifications.schedule({
    notifications: [
      {
        id: hashToRange(`unmarked-${new Date().toISOString().slice(0, 10)}`, NAMESPACE.unmarked, 100_000_000),
        title: "Unmarked classes",
        body: unmarkedNudge(count, `${count}-${new Date().toISOString().slice(0, 10)}`),
        schedule: { at: new Date(Date.now() + 1000) },
      },
    ],
  })
}
