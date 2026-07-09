import { supabase } from "../../lib/supabase"
import type { Tables, TablesInsert } from "../../types/database"

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
  const total = totalSessions ?? 0

  return {
    attended,
    absent,
    totalSessions: total,
    remainingSessions: Math.max(0, total - attended - absent),
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
