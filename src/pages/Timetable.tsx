import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { listSessionsInRange, type TimetableSession } from "../features/courses/api"
import { listInstituteCalendar, type InstituteCalendarDay } from "../features/calendar/api"
import { ListSkeleton } from "../components/ui/Skeleton"

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
const COL_WIDTH = 118
const GUTTER_WIDTH = 44

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
  const scrollRef = useRef<HTMLDivElement>(null)
  // The session whose detail card is showing. `locked` = opened by tap/click
  // (stays until dismissed); unlocked = a hover preview that closes on mouse-out.
  const [popover, setPopover] = useState<{ session: TimetableSession; rect: DOMRect; locked: boolean } | null>(null)

  const showPreview = useCallback((session: TimetableSession, el: HTMLElement) => {
    setPopover((p) => (p?.locked ? p : { session, rect: el.getBoundingClientRect(), locked: false }))
  }, [])
  const hidePreview = useCallback(() => {
    setPopover((p) => (p?.locked ? p : null))
  }, [])
  const toggleLock = useCallback((session: TimetableSession, el: HTMLElement) => {
    setPopover((p) => (p && p.session.id === session.id && p.locked ? null : { session, rect: el.getBoundingClientRect(), locked: true }))
  }, [])

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

  // On the current week, horizontally centre today's column so opening the
  // Timetable lands on today instead of Monday (matters on narrow phone
  // screens where only 2-3 columns are visible at once).
  const todayIndex = useMemo(() => columns.findIndex((c) => c.isToday), [columns])
  useEffect(() => {
    const el = scrollRef.current
    if (loading || !el || weekOffset !== 0 || todayIndex < 0) return
    // Only relevant when the week overflows (phones). On a laptop the columns
    // stretch to fill and everything's visible, so there's nothing to scroll to.
    if (el.scrollWidth <= el.clientWidth + 4) return
    const target = GUTTER_WIDTH + todayIndex * COL_WIDTH - (el.clientWidth - GUTTER_WIDTH - COL_WIDTH) / 2
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" })
  }, [loading, weekOffset, todayIndex])

  // Any scroll (the grid scrolls horizontally, the page vertically), a resize,
  // or Escape invalidates the anchor rect -- just dismiss the card.
  useEffect(() => {
    if (!popover) return
    const close = () => setPopover(null)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close()
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [popover])

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
        <ListSkeleton />
      ) : (
        <div ref={scrollRef} className="mt-6 overflow-x-auto rounded-xl border border-neutral-200/70 dark:border-neutral-800">
          {/* min-w-full lets the day columns stretch to fill the width on a
              laptop (flex-1), while their 118px floor forces a horizontal
              scroll on phones where the whole week can't fit at once. */}
          <div className="min-w-full">
            {/* header row: day names + dates */}
            <div className="flex border-b border-neutral-200/70 dark:border-neutral-800">
              <div className="sticky left-0 z-20 w-11 shrink-0 bg-white dark:bg-neutral-900" />
              {columns.map((col) => (
                <div
                  key={col.iso}
                  className={`min-w-[118px] flex-1 border-l border-neutral-100 px-2 py-2 text-center dark:border-neutral-800 ${
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
                {hours.map((h, i) =>
                  i === 0 ? null : (
                    // Centre each label on its hour gridline (which sits at i*PX)
                    // so the labels line up exactly with the blocks' top edges.
                    <span
                      key={h}
                      className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-neutral-400"
                      style={{ top: i * PX_PER_HOUR }}
                    >
                      {h}:00
                    </span>
                  ),
                )}
              </div>

              {columns.map((col) => (
                <div
                  key={col.iso}
                  className={`relative min-w-[118px] flex-1 border-l border-neutral-100 dark:border-neutral-800 ${
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
                      const isOpen = popover?.session.id === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onMouseEnter={(e) => showPreview(s, e.currentTarget)}
                          onMouseLeave={hidePreview}
                          onClick={(e) => toggleLock(s, e.currentTarget)}
                          className={`absolute inset-x-1 overflow-hidden rounded-md p-1.5 text-left shadow-sm transition-shadow hover:z-10 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
                            isOpen ? "z-10 ring-2 ring-indigo-500/50" : ""
                          }`}
                          style={{ top, height, backgroundColor: `${s.courses.color}22`, borderLeft: `3px solid ${s.courses.color}` }}
                        >
                          <p className={`text-[11px] font-semibold leading-tight ${height > 40 ? "line-clamp-2" : "truncate"} ${cancelled ? "text-neutral-400 line-through" : "text-neutral-800 dark:text-neutral-100"}`}>
                            {s.courses.name}
                          </p>
                          <p className="truncate text-[10px] text-neutral-500">
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          </p>
                          {height > 60 && (
                            <span className="mt-0.5 block truncate text-[9px] font-medium uppercase tracking-wide text-neutral-500">
                              {s.component_type}
                              {s.course_schedule?.room ? ` · ${s.course_schedule.room}` : ""}
                            </span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {popover && (
        <>
          {/* click-catcher so a tapped-open card dismisses on any outside tap */}
          {popover.locked && <div className="fixed inset-0 z-30" onClick={() => setPopover(null)} />}
          <SessionPopover session={popover.session} rect={popover.rect} onClose={() => setPopover(null)} />
        </>
      )}
    </div>
  )
}

// A fixed-position detail card anchored to a session block. Positioned in the
// viewport (so the grid's horizontal scroll can't clip it), preferring below the
// block and flipping above when there's no room, clamped to the screen edges.
function SessionPopover({ session, rect, onClose }: { session: TimetableSession; rect: DOMRect; onClose: () => void }) {
  const W = 232
  const margin = 8
  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - W - margin)
  const below = rect.bottom + 8
  const flipUp = below + 150 > window.innerHeight && rect.top - 8 > 150
  const meta = [session.courses.code, session.courses.instructor].filter(Boolean).join(" · ")
  const cancelled = session.status === "cancelled"

  return (
    <div
      className="fixed z-40 rounded-xl border border-neutral-200/80 bg-white p-3 shadow-elevated dark:border-neutral-700 dark:bg-neutral-900"
      style={{
        width: W,
        left,
        top: flipUp ? undefined : below,
        bottom: flipUp ? window.innerHeight - rect.top + 8 : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: session.courses.color }} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold leading-snug ${cancelled ? "text-neutral-400 line-through" : ""}`}>{session.courses.name}</p>
          {meta && <p className="mt-0.5 truncate text-xs text-neutral-500">{meta}</p>}
        </div>
      </div>

      <dl className="mt-2.5 space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <dt className="w-14 shrink-0 text-neutral-400">Time</dt>
          <dd className="font-medium tabular-nums">{session.start_time.slice(0, 5)}–{session.end_time.slice(0, 5)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="w-14 shrink-0 text-neutral-400">Type</dt>
          <dd className="font-medium capitalize">{session.component_type}</dd>
        </div>
        {session.course_schedule?.room && (
          <div className="flex items-center gap-2">
            <dt className="w-14 shrink-0 text-neutral-400">Room</dt>
            <dd className="font-medium">{session.course_schedule.room}</dd>
          </div>
        )}
        {cancelled && (
          <div className="flex items-center gap-2">
            <dt className="w-14 shrink-0 text-neutral-400">Status</dt>
            <dd className="font-medium text-red-600 dark:text-red-400">Cancelled</dd>
          </div>
        )}
      </dl>

      <Link
        to={`/courses/${session.course_id}`}
        onClick={onClose}
        className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-neutral-100 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
      >
        View course
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </Link>
    </div>
  )
}
