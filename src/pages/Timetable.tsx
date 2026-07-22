import { useEffect, useMemo, useState, useCallback } from "react"
import { useAuth } from "../context/AuthContext"
import { listSessionsInRange, type TimetableSession } from "../features/courses/api"
import { listInstituteCalendar, type InstituteCalendarDay } from "../features/calendar/api"
import { Card } from "../components/ui/Card"
import { Badge } from "../components/ui/Badge"

const WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
// App weekday convention: 0 = Monday … 6 = Sunday (matches course_schedule).
function appDow(d: Date) {
  return (d.getDay() + 6) % 7
}
function mondayOf(d: Date) {
  const m = new Date(d)
  m.setDate(m.getDate() - appDow(d))
  m.setHours(0, 0, 0, 0)
  return m
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

type DayColumn = {
  date: Date
  iso: string
  isToday: boolean
  holiday: string | null
  swapFrom: number | null // app-dow whose timetable this day runs, if swapped
  sessions: TimetableSession[]
}

export function Timetable() {
  const { user, profile } = useAuth()
  const [weekOffset, setWeekOffset] = useState(0)
  const [sessions, setSessions] = useState<TimetableSession[]>([])
  const [calendar, setCalendar] = useState<InstituteCalendarDay[]>([])
  const [loading, setLoading] = useState(true)

  const isFirstYear = profile?.is_first_year_ug ?? false
  const todayISO = toISO(new Date())

  const weekStart = useMemo(() => addDays(mondayOf(new Date()), weekOffset * 7), [weekOffset])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [sess, cal] = await Promise.all([
      listSessionsInRange(user.id, toISO(weekStart), toISO(weekEnd)),
      listInstituteCalendar(),
    ])
    setSessions(sess)
    setCalendar(cal)
    setLoading(false)
  }, [user, weekStart, weekEnd])

  useEffect(() => {
    load()
  }, [load])

  const columns = useMemo<DayColumn[]>(() => {
    const calByDate = new Map<string, InstituteCalendarDay[]>()
    for (const c of calendar) {
      if (!calByDate.has(c.date)) calByDate.set(c.date, [])
      calByDate.get(c.date)!.push(c)
    }
    const byDate = new Map<string, TimetableSession[]>()
    for (const s of sessions) {
      if (!byDate.has(s.session_date)) byDate.set(s.session_date, [])
      byDate.get(s.session_date)!.push(s)
    }
    const applies = (c: InstituteCalendarDay) =>
      c.audience === "all" || (c.audience === "first_year_ug" && isFirstYear)

    // Mon–Sat always; add Sunday only if it actually has classes that week.
    const dayCount = byDate.has(toISO(addDays(weekStart, 6))) ? 7 : 6
    return Array.from({ length: dayCount }, (_, i) => {
      const date = addDays(weekStart, i)
      const iso = toISO(date)
      const entries = calByDate.get(iso) ?? []
      const holidayEntry = entries.find((e) => e.follows_day_of_week === null && applies(e))
      const swapEntry = entries.find((e) => e.follows_day_of_week !== null && applies(e))
      return {
        date,
        iso,
        isToday: iso === todayISO,
        holiday: holidayEntry ? holidayEntry.description || "Holiday" : null,
        swapFrom: swapEntry ? swapEntry.follows_day_of_week : null,
        sessions: byDate.get(iso) ?? [],
      }
    })
  }, [sessions, calendar, weekStart, isFirstYear, todayISO])

  const rangeLabel = `${weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${weekEnd.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timetable</h1>
          <p className="mt-1 text-sm text-neutral-500">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-neutral-400">Loading…</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {columns.map((col, i) => (
            <Card
              key={col.iso}
              index={i}
              className={`flex flex-col ${col.isToday ? "ring-2 ring-indigo-500/40" : ""}`}
            >
              <div className="flex items-baseline justify-between">
                <span className={`text-sm font-semibold ${col.isToday ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                  {WEEKDAY_SHORT[appDow(col.date)]}
                </span>
                <span className="text-xs text-neutral-400">{col.date.getDate()}</span>
              </div>

              {col.swapFrom !== null && (
                <div className="mt-2">
                  <Badge tone="yellow">Runs {WEEKDAY[col.swapFrom]} timetable</Badge>
                </div>
              )}

              <div className="mt-3 flex-1 space-y-2">
                {col.holiday ? (
                  <p className="rounded-lg bg-neutral-50 px-2.5 py-2 text-xs text-neutral-500 dark:bg-neutral-800/60">
                    {col.holiday}
                  </p>
                ) : col.sessions.length === 0 ? (
                  <p className="text-xs text-neutral-300 dark:text-neutral-600">No classes</p>
                ) : (
                  col.sessions.map((s) => {
                    const cancelled = s.status === "cancelled"
                    return (
                      <div
                        key={s.id}
                        className="rounded-lg border border-neutral-100 p-2 dark:border-neutral-800"
                        style={{ borderLeft: `3px solid ${s.courses.color}` }}
                      >
                        <p className={`truncate text-xs font-medium ${cancelled ? "text-neutral-400 line-through" : ""}`}>
                          {s.courses.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge tone="neutral">{s.component_type}</Badge>
                          {cancelled && <Badge tone="red">Cancelled</Badge>}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
