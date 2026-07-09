import { supabase } from "../../lib/supabase"
import type { Tables, TablesInsert } from "../../types/database"

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

export async function deleteEvent(eventId: string) {
  const { error } = await supabase.from("course_events").delete().eq("id", eventId)
  if (error) throw error
}
