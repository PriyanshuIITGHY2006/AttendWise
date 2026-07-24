import { useEffect, useMemo, useState, useCallback } from "react"
import { useAuth } from "../context/AuthContext"
import { listSessionsInRange, type TimetableSession } from "../features/courses/api"
import { listInstituteCalendar, type InstituteCalendarDay } from "../features/calendar/api"

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
function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

const PX_PER_HOUR = 56

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

  // Vertical time window for the grid, derived from the week's classes (padded)
  // so there's no dead space; sensible default when the week is empty.
  const { startHour, hours, gridHeight } = useMemo(() => {
    let min = 8
    let max = 17
    if (sessions.length > 0) {
      min = Math.min(...sessions.map((s) => Math.floor(toMin(s.start_time) / 60)))
      max = Math.max(...sessions.map((s) => Math.ceil(toMin(s.end_time) / 60)))
    }
    min = Math.max(6, Math.min(min, 9))
    max = Math.min(22, Math.max(max, min + 4))
    const hrs = Array.from({ length: max - min }, (_, i) => min + i)
    return { startHour: min, hours: hrs, gridHeight: (max - min) * PX_PER_HOUR }
  }, [sessions])

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
        <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200/70 dark:border-neutral-800">
          <div className="min-w-max">
            {/* header row: day names + dates */}
            <div className="flex border-b border-neutral-200/70 dark:border-neutral-800">
              <div className="sticky left-0 z-20 w-11 shrink-0 bg-white dark:bg-neutral-900" />
              {columns.map((col) => (
                <div
                  key={col.iso}
                  className={`w-[118px] shrink-0 border-l border-neutral-100 px-2 py-2 text-center dark:border-neutral-800 ${
                    col.isToday ? "bg-indigo-50/60 dark:bg-indigo-500/10" : ""
                  }`}
                >
                  <div className={`text-sm font-semibold ${col.isToday ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                    {WEEKDAY_SHORT[appDow(col.date)]}
                  </div>
                  <div className="text-xs text-neutral-400">{col.date.getDate()}</div>
                  {col.swapFrom !== null && (
                    <div className="mt-1 truncate text-[10px] font-medium text-amber-600 dark:text-amber-400" title={`Runs ${WEEKDAY[col.swapFrom]} timetable`}>
                      ↻ {WEEKDAY_SHORT[col.swapFrom]}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* body: time gutter + day columns */}
            <div className="flex">
              <div className="sticky left-0 z-20 w-11 shrink-0 bg-white dark:bg-neutral-900" style={{ height: gridHeight }}>
                {hours.map((h, i) => (
                  <div key={h} className="relative" style={{ height: PX_PER_HOUR }}>
                    {i > 0 && <span className="absolute -top-1.5 right-1 text-[10px] text-neutral-400">{h}:00</span>}
                  </div>
                ))}
              </div>

              {columns.map((col) => (
                <div
                  key={col.iso}
                  className={`relative w-[118px] shrink-0 border-l border-neutral-100 dark:border-neutral-800 ${
                    col.isToday ? "bg-indigo-50/40 dark:bg-indigo-500/[0.06]" : ""
                  }`}
                  style={{ height: gridHeight }}
                >
                  {/* hour gridlines */}
                  {hours.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-neutral-100 dark:border-neutral-800/70" style={{ top: i * PX_PER_HOUR }} />
                  ))}

                  {col.holiday ? (
                    <div className="absolute inset-0 flex items-center justify-center p-1.5 text-center text-[11px] text-neutral-400">{col.holiday}</div>
                  ) : (
                    col.sessions.map((s) => {
                      const cancelled = s.status === "cancelled"
                      const top = ((toMin(s.start_time) - startHour * 60) / 60) * PX_PER_HOUR
                      const height = Math.max(26, ((toMin(s.end_time) - toMin(s.start_time)) / 60) * PX_PER_HOUR - 3)
                      return (
                        <div
                          key={s.id}
                          className="absolute inset-x-1 overflow-hidden rounded-md p-1.5 shadow-sm"
                          style={{ top, height, backgroundColor: `${s.courses.color}22`, borderLeft: `3px solid ${s.courses.color}` }}
                          title={`${s.courses.name} · ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`}
                        >
                          <p className={`truncate text-[11px] font-semibold leading-tight ${cancelled ? "text-neutral-400 line-through" : "text-neutral-800 dark:text-neutral-100"}`}>
                            {s.courses.name}
                          </p>
                          <p className="truncate text-[10px] text-neutral-500">
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          </p>
                          {height > 46 && <span className="mt-0.5 inline-block rounded bg-white/60 px-1 text-[9px] font-medium text-neutral-600 dark:bg-black/30 dark:text-neutral-300">{s.component_type}</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
