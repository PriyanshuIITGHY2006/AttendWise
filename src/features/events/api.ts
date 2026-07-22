import { supabase } from "../../lib/supabase"
import type { Tables, TablesInsert, TablesUpdate } from "../../types/database"

export type CourseEvent = Tables<"course_events">

export async function listUpcomingEvents(userId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("course_events")
    .select("*, courses(name, color)")
    .eq("user_id", userId)
    .gte("event_date", today)
    .order("event_date", { ascending: true })
  if (error) throw error
  return data
}

/** All of the user's course_events across courses -- the grade tracker groups these by course. */
export async function listAllEventsForUser(userId: string) {
  const { data, error } = await supabase
    .from("course_events")
    .select("*")
    .eq("user_id", userId)
    .order("event_date", { ascending: true })
  if (error) throw error
  return data
}

export async function listEventsForCourse(courseId: string) {
  const { data, error } = await supabase
    .from("course_events")
    .select("*")
    .eq("course_id", courseId)
    .order("event_date", { ascending: true })
  if (error) throw error
  return data
}

export async function createEvent(event: TablesInsert<"course_events">) {
  const { data, error } = await supabase.from("course_events").insert(event).select().single()
  if (error) throw error
  return data
}

export async function updateEvent(eventId: string, patch: TablesUpdate<"course_events">) {
  const { data, error } = await supabase.from("course_events").update(patch).eq("id", eventId).select().single()
  if (error) throw error
  return data
}

export async function deleteEvent(eventId: string) {
  const { error } = await supabase.from("course_events").delete().eq("id", eventId)
  if (error) throw error
}
