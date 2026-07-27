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

export type CourseShare = Tables<"course_shares">

// Courses the user can see for Materials: their own + any shared with them (RLS
// returns both). Compare `user_id` to know which are shared vs owned.
export async function listAccessibleCourses(): Promise<Course[]> {
  const { data, error } = await supabase.from("courses").select("*").eq("archived", false).order("created_at")
  if (error) throw error
  return data
}

export async function shareCourse(courseId: string, ownerId: string, email: string) {
  const { error } = await supabase
    .from("course_shares")
    .insert({ course_id: courseId, owner_id: ownerId, shared_with_email: email.trim().toLowerCase() })
  if (error) throw error
}

export async function listCourseShares(courseId: string): Promise<CourseShare[]> {
  const { data, error } = await supabase.from("course_shares").select("*").eq("course_id", courseId).order("created_at")
  if (error) throw error
  return data
}

export async function unshareCourse(shareId: string) {
  const { error } = await supabase.from("course_shares").delete().eq("id", shareId)
  if (error) throw error
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

/**
 * Regenerates future sessions for every course the user owns. Used to pull in
 * academic-calendar changes (holidays, day-order swaps) or a first-year-status
 * change into existing courses -- generation only rebuilds unmarked future
 * sessions, so recorded attendance is never touched.
 */
export async function regenerateAllCourses(userId: string) {
  const courses = await listCourses(userId)
  for (const c of courses) await generateSessions(c.id)
  return courses.length
}

export type TimetableSession = {
  id: string
  course_id: string
  session_date: string
  start_time: string
  end_time: string
  component_type: string
  status: string
  courses: { name: string; color: string; code: string | null; instructor: string | null }
  course_schedule: { room: string | null } | null
}

/**
 * Class instances between two dates (inclusive) for the timetable grid. Reads
 * generated sessions, so day-order swaps, holidays, half-semester windows and
 * first-year rules are already baked in -- the grid needs no calendar logic.
 */
export async function listSessionsInRange(userId: string, startISO: string, endISO: string): Promise<TimetableSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, course_id, session_date, start_time, end_time, component_type, status, courses!inner(name, color, code, instructor, user_id), course_schedule(room)")
    .eq("courses.user_id", userId)
    .gte("session_date", startISO)
    .lte("session_date", endISO)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as TimetableSession[]
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

// Adds a one-off "extra class" -- an occasional session outside the recurring
// weekly schedule. Stored with schedule_id null so regeneration leaves it be;
// it then shows up in Today / Timetable and counts toward attendance like any
// other session. Throws on a clash with an existing session at the same
// course/date/start (unique constraint).
export async function createExtraSession(input: {
  courseId: string
  date: string
  startTime: string
  endTime: string
  componentType: string
}) {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      course_id: input.courseId,
      schedule_id: null,
      session_date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      component_type: input.componentType,
      status: "scheduled",
    })
    .select()
    .single()
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
  /** Future sessions already marked as a planned skip -- these consume the safe-skip budget. */
  plannedFutureSkips: number
}

export async function getCourseStats(courseId: string, userId: string): Promise<CourseStats> {
  const { count: totalSessions, error: totalError } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId)
    .in("status", ["scheduled", "makeup"])
  if (totalError) throw totalError

  // Only sessions that have actually happened count toward the percentage --
  // marking a future class "present" ahead of time (the "plan to attend"
  // option in the bunk planner) is just a placeholder note of intent, not a
  // fact yet, so it must not inflate attended/absent until that date arrives.
  const todayISO = new Date().toISOString().slice(0, 10)
  const { data: records, error: recordsError } = await supabase
    .from("attendance_records")
    .select("status, sessions!inner(course_id, session_date)")
    .eq("user_id", userId)
    .eq("sessions.course_id", courseId)
    .lte("sessions.session_date", todayISO)
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

  // future sessions the student has already penciled in as a skip -- they still
  // sit in remainingSessions (they haven't happened), so the safe-skip budget
  // has to reserve for them or every planner would re-offer skips already spent
  const { count: plannedFutureSkips, error: plannedError } = await supabase
    .from("attendance_records")
    .select("*, sessions!inner(course_id, session_date)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "absent")
    .eq("sessions.course_id", courseId)
    .gt("sessions.session_date", todayISO)
  if (plannedError) throw plannedError

  return {
    attended,
    absent,
    totalSessions: total,
    remainingSessions: Math.max(0, total - attended - absent - resolvedNeutral),
    plannedFutureSkips: plannedFutureSkips ?? 0,
  }
}

/**
 * Unmarked scheduled classes from today through the next `days` days, for
 * queuing class reminders ahead of time. Scheduling a rolling window (rather
 * than just today) is what lets reminders keep firing in the background even if
 * the app isn't reopened for a few days. Sessions the student has already marked
 * -- including planned skips (marked absent) -- are excluded here; the planned
 * skip gets its own reminder instead.
 */
export async function listUpcomingClassesForNotify(userId: string, days = 7) {
  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const horizon = new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("sessions")
    .select("id, course_id, session_date, start_time, courses!inner(name, user_id), attendance_records(user_id)")
    .eq("courses.user_id", userId)
    .eq("status", "scheduled")
    .gte("session_date", todayISO)
    .lte("session_date", horizon)
    .order("session_date", { ascending: true })
  if (error) throw error
  return (data ?? [])
    .filter((s) => !(s.attendance_records as unknown[])?.length) // unmarked only
    .map((s) => {
      const course = s.courses as unknown as { name: string }
      return { id: s.id, courseId: s.course_id, courseName: course.name, dateISO: s.session_date, startTime: s.start_time }
    })
}

/**
 * Future sessions the student has already marked as a planned skip, within the
 * next few days -- used to schedule "skipping tomorrow?" reminders.
 */
export async function listUpcomingPlannedSkips(userId: string) {
  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const horizon = new Date(today.getTime() + 4 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("attendance_records")
    .select("session_id, sessions!inner(session_date, course_id, courses!inner(name, user_id))")
    .eq("user_id", userId)
    .eq("status", "absent")
    .gt("sessions.session_date", todayISO)
    .lte("sessions.session_date", horizon)
  if (error) throw error
  return (data ?? []).map((r) => {
    const session = r.sessions as unknown as { session_date: string; courses: { name: string } }
    return { sessionId: r.session_id, courseName: session.courses.name, dateISO: session.session_date }
  })
}

/** Every resolved (past) attendance record for the user, flattened for analytics. */
export async function listAllAttendance(userId: string) {
  const todayISO = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("attendance_records")
    .select("status, sessions!inner(session_date, course_id)")
    .eq("user_id", userId)
    .lte("sessions.session_date", todayISO)
  if (error) throw error
  return (data ?? []).map((r) => {
    const session = r.sessions as unknown as { session_date: string; course_id: string }
    return { status: r.status, date: session.session_date, courseId: session.course_id }
  })
}

/**
 * Attendance stats for ALL of the user's active courses in one round trip, via
 * the course_stats_for_user RPC. Use this instead of calling getCourseStats in a
 * loop -- it collapses N x 3 queries into a single call. Returns a map keyed by
 * course id; a course with no row falls back to zeroed stats.
 */
export async function getAllCourseStats(): Promise<Map<string, CourseStats>> {
  const { data, error } = await supabase.rpc("course_stats_for_user")
  if (error) throw error
  const map = new Map<string, CourseStats>()
  for (const r of data ?? []) {
    map.set(r.course_id, {
      attended: r.attended,
      absent: r.absent,
      totalSessions: r.total_sessions,
      remainingSessions: r.remaining_sessions,
      plannedFutureSkips: r.planned_future_skips,
    })
  }
  return map
}

/** Zeroed stats for a course with no attendance/sessions yet. */
export const EMPTY_COURSE_STATS: CourseStats = {
  attended: 0,
  absent: 0,
  totalSessions: 0,
  remainingSessions: 0,
  plannedFutureSkips: 0,
}

export async function listTodaySessions(userId: string, date: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "*, courses!inner(id, name, color, user_id, attendance_threshold, strict_no_skip), course_schedule(room), attendance_records(status, user_id)",
    )
    .eq("session_date", date)
    .eq("courses.user_id", userId)
    .eq("status", "scheduled")
    .order("start_time", { ascending: true })
  if (error) throw error
  return data
}
