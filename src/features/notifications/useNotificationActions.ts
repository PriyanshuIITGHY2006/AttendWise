import { useEffect } from "react"
import { markAttendance } from "../courses/api"
import { registerNotificationActions, addNotificationActionListener } from "./schedule"

/**
 * Registers the Present/Absent notification actions and handles taps by writing
 * the attendance straight to the DB -- so the user can mark a class from the
 * lock-screen notification without opening the app. No-ops off native.
 */
export function useNotificationActions(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    registerNotificationActions()
    const unsubscribe = addNotificationActionListener(async (sessionId, uid, status) => {
      // uid rides along in the notification payload; fall back to the current
      // user just in case, but they should always match.
      await markAttendance(sessionId, uid || userId, status)
    })
    return unsubscribe
  }, [userId])
}
