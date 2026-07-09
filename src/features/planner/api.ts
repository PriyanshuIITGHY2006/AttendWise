import { supabase } from "../../lib/supabase"

export async function listSessionsInRange(userId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "*, courses!inner(id, name, color, attendance_threshold, strict_no_skip, user_id), attendance_records(status, user_id)",
    )
    .eq("courses.user_id", userId)
    .gte("session_date", startDate)
    .lte("session_date", endDate)
    .eq("status", "scheduled")
    .order("session_date", { ascending: true })
  if (error) throw error
  return data
}
