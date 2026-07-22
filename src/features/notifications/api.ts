import { supabase } from "../../lib/supabase"
import type { Tables } from "../../types/database"

export type NotificationSettings = Tables<"notification_settings">

export type HumorLevel = "roast" | "plain"

/** The per-type switches + quiet hours + digests that live on the global row. */
export type NotificationPrefs = {
  muted: boolean
  lead_time_minutes: number
  class_reminders: boolean
  quiz_reminders: boolean
  threshold_alerts: boolean
  unmarked_nudges: boolean
  planned_skip_reminders: boolean
  daily_digest: boolean
  daily_digest_time: string // "HH:MM" or "HH:MM:SS"
  quiet_start: string | null
  quiet_end: string | null
  humor_level: HumorLevel
}

export const DEFAULT_PREFS: NotificationPrefs = {
  muted: false,
  lead_time_minutes: 15,
  class_reminders: true,
  quiz_reminders: true,
  threshold_alerts: true,
  unmarked_nudges: true,
  planned_skip_reminders: true,
  daily_digest: false,
  daily_digest_time: "07:30",
  quiet_start: null,
  quiet_end: null,
  humor_level: "roast",
}

function rowToPrefs(row: NotificationSettings | null): NotificationPrefs {
  if (!row) return { ...DEFAULT_PREFS }
  return {
    muted: row.muted,
    lead_time_minutes: row.lead_time_minutes,
    class_reminders: row.class_reminders,
    quiz_reminders: row.quiz_reminders,
    threshold_alerts: row.threshold_alerts,
    unmarked_nudges: row.unmarked_nudges,
    planned_skip_reminders: row.planned_skip_reminders,
    daily_digest: row.daily_digest,
    daily_digest_time: row.daily_digest_time,
    quiet_start: row.quiet_start,
    quiet_end: row.quiet_end,
    humor_level: row.humor_level === "plain" ? "plain" : "roast",
  }
}

/** The user's global defaults -- the one row per user with course_id = null. */
export async function getGlobalNotificationSettings(userId: string): Promise<NotificationPrefs> {
  const { data } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("user_id", userId)
    .is("course_id", null)
    .maybeSingle()
  return rowToPrefs(data)
}

export async function updateGlobalNotificationSettings(
  userId: string,
  patch: Partial<NotificationPrefs>,
) {
  const { data: existing } = await supabase
    .from("notification_settings")
    .select("id")
    .eq("user_id", userId)
    .is("course_id", null)
    .maybeSingle()

  if (existing) {
    await supabase.from("notification_settings").update(patch).eq("id", existing.id)
  } else {
    await supabase
      .from("notification_settings")
      .insert({ user_id: userId, course_id: null, ...DEFAULT_PREFS, ...patch })
  }
}
