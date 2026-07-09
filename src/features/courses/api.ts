import { supabase } from "../../lib/supabase"
import type { Tables, TablesInsert, TablesUpdate } from "../../types/database"

export type Course = Tables<"courses">
export type CourseSchedule = Tables<"course_schedule">
export type Session = Tables<"sessions">
export type AttendanceRecord = Tables<"attendance_records">

export async function listCourses(userId: string) {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data
}

export async function getCourse(courseId: string) {
  const { data, error } = await supabase.from("courses").select("*").eq("id", courseId).single()
  if (error) throw error
  return data
}

export async function createCourse(course: TablesInsert<"courses">) {
  const { data, error } = await supabase.from("courses").insert(course).select().single()
  if (error) throw error
  return data
}

export async function updateCourse(courseId: string, patch: TablesUpdate<"courses">) {
  const { data, error } = await supabase.from("courses").update(patch).eq("id", courseId).select().single()
  if (error) throw error
  return data
}

export async function deleteCourse(courseId: string) {
  const { error } = await supabase.from("courses").delete().eq("id", courseId)
  if (error) throw error
}

export async function listSchedule(courseId: string) {
  const { data, error } = await supabase
    .from("course_schedule")
    .select("*")
    .eq("course_id", courseId)
    .order("day_of_week", { ascending: true })
  if (error) throw error
  return data
}

export async function replaceSchedule(courseId: string, slots: Omit<TablesInsert<"course_schedule">, "course_id">[]) {
  const { error: deleteError } = await supabase.from("course_schedule").delete().eq("course_id", courseId)
  if (deleteError) throw deleteError
  if (slots.length === 0) return
  const { error: insertError } = await supabase
    .from("course_schedule")
    .insert(slots.map((s) => ({ ...s, course_id: courseId })))
  if (insertError) throw insertError
}

export async function addScheduleSlot(slot: TablesInsert<"course_schedule">) {
  const { data, error } = await supabase.from("course_schedule").insert(slot).select().single()
  if (error) throw error
  return data
}

export async function deleteScheduleSlot(slotId: string) {
  const { error } = await supabase.from("course_schedule").delete().eq("id", slotId)
  if (error) throw error
}

export async function generateSessions(courseId: string) {
  const { error } = await supabase.rpc("generate_sessions_for_course", { p_course_id: courseId })
  if (error) throw error
}

export async function listSessionsForCourse(courseId: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("course_id", courseId)
    .order("session_date", { ascending: true })
  if (error) throw error
  return data
}

export async function listAttendanceForCourse(courseId: string, userId: string) {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*, sessions!inner(course_id)")
    .eq("user_id", userId)
    .eq("sessions.course_id", courseId)
  if (error) throw error
  return data
}

export async function markAttendance(sessionId: string, userId: string, status: AttendanceRecord["status"]) {
  const { data, error } = await supabase
    .from("attendance_records")
    .upsert({ session_id: sessionId, user_id: userId, status }, { onConflict: "session_id,user_id" })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function markAttendanceBulk(sessionIds: string[], userId: string, status: AttendanceRecord["status"]) {
  if (sessionIds.length === 0) return
  const { error } = await supabase
    .from("attendance_records")
    .upsert(
      sessionIds.map((session_id) => ({ session_id, user_id: userId, status })),
      { onConflict: "session_id,user_id" },
    )
  if (error) throw error
}

/** Deletes attendance records outright, returning those sessions to "unmarked" -- used to undo a bulk-apply. */
export async function unmarkAttendance(sessionIds: string[], userId: string) {
  if (sessionIds.length === 0) return
  const { error } = await supabase
    .from("attendance_records")
    .delete()
    .eq("user_id", userId)
    .in("session_id", sessionIds)
  if (error) throw error
}

export async function listUnmarkedPastSessions() {
  const { data, error } = await supabase.rpc("list_unmarked_past_sessions")
  if (error) throw error
  return data
}

export type CourseStats = {
  attended: number
  absent: number
  totalSessions: number
  remainingSessions: number
}

export async function getCourseStats(courseId: string, userId: string): Promise<CourseStats> {
  const { count: totalSessions, error: totalError } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId)
    .in("status", ["scheduled", "makeup"])
  if (totalError) throw totalError

  const { data: records, error: recordsError } = await supabase
    .from("attendance_records")
    .select("status, sessions!inner(course_id)")
    .eq("user_id", userId)
    .eq("sessions.course_id", courseId)
  if (recordsError) throw recordsError

  const attended = records.filter((r) => r.status === "present").length
  const absent = records.filter((r) => r.status === "absent").length
  // cancelled/on_duty sessions are resolved (they already happened) but count
  // toward neither attended nor absent, so they must still be subtracted out
  // of the denominator -- otherwise they get miscounted as "still upcoming"
  // forever, which inflates remainingSessions and overstates how many more
  // classes can safely be skipped.
  const resolvedNeutral = records.filter((r) => r.status === "cancelled" || r.status === "on_duty").length
  const total = totalSessions ?? 0

  return {
    attended,
    absent,
    totalSessions: total,
    remainingSessions: Math.max(0, total - attended - absent - resolvedNeutral),
  }
}

export async function listTodaySessions(userId: string, date: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*, courses!inner(id, name, color, user_id), attendance_records(status, user_id)")
    .eq("session_date", date)
    .eq("courses.user_id", userId)
    .eq("status", "scheduled")
    .order("start_time", { ascending: true })
  if (error) throw error
  return data
}
