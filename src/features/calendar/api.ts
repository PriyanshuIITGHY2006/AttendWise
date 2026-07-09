import { supabase } from "../../lib/supabase"
import type { Tables } from "../../types/database"

export type InstituteCalendarDay = Tables<"institute_calendar">

export async function listInstituteCalendar() {
  const { data, error } = await supabase
    .from("institute_calendar")
    .select("*")
    .order("date", { ascending: true })
  if (error) throw error
  return data
}
