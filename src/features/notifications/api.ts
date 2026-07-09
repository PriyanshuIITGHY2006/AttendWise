import { supabase } from "../../lib/supabase"
import type { Tables } from "../../types/database"

export type NotificationSettings = Tables<"notification_settings">

const DEFAULTS = { muted: false, lead_time_minutes: 15 }

/** The user's global defaults -- the one row per user with course_id = null. */
export async function getGlobalNotificationSettings(userId: string) {
  const { data } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("user_id", userId)
    .is("course_id", null)
    .maybeSingle()
  return data ?? { ...DEFAULTS, id: "", user_id: userId, course_id: null, created_at: "" }
}

export async function updateGlobalNotificationSettings(
  userId: string,
  patch: { muted?: boolean; lead_time_minutes?: number },
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
    await supabase.from("notification_settings").insert({ user_id: userId, course_id: null, ...DEFAULTS, ...patch })
  }
}
