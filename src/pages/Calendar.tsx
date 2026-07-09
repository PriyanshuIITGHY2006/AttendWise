import { useEffect, useMemo, useState } from "react"
import { listInstituteCalendar, type InstituteCalendarDay } from "../features/calendar/api"
import { Card } from "../components/ui/Card"

const DAY_TYPE_DOT: Record<InstituteCalendarDay["day_type"], string> = {
  holiday: "bg-emerald-500",
  mid_sem_break: "bg-amber-500",
  end_sem_break: "bg-red-500",
}

const DAY_TYPE_BG: Record<InstituteCalendarDay["day_type"], string> = {
  holiday: "bg-emerald-50 dark:bg-emerald-500/10",
  mid_sem_break: "bg-amber-50 dark:bg-amber-500/10",
  end_sem_break: "bg-red-50 dark:bg-red-500/10",
}

const DAY_TYPE_LABELS: Record<InstituteCalendarDay["day_type"], string> = {
  holiday: "Holiday",
  mid_sem_break: "Mid-sem exams",
  end_sem_break: "End-sem exams",
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function toISO(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function Calendar() {
  const [days, setDays] = useState<InstituteCalendarDay[] | null>(null)
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })

  useEffect(() => {
    listInstituteCalendar().then(setDays)
  }, [])

  const byDate = useMemo(() => {
    const map = new Map<string, InstituteCalendarDay>()
    for (const d of days ?? []) map.set(d.date, d)
    return map
  }, [days])

  const { year, month } = cursor
  const firstOfMonth = new Date(year, month, 1)
  // getDay(): 0=Sun..6=Sat -> convert to 0=Mon..6=Sun so the grid starts on Monday
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate())

  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  function shiftMonth(delta: number) {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Institute calendar</h1>
      <p className="mt-1 text-sm text-neutral-500">Holidays and exam weeks, shared across all courses.</p>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Previous month"
          >
            ‹
          </button>
          <h2 className="font-medium">{firstOfMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-neutral-400">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />
            const iso = toISO(year, month, day)
            const entry = byDate.get(iso)
            const isToday = iso === todayISO
            return (
              <div
                key={i}
                className={`group relative flex aspect-square flex-col items-center justify-center rounded-md text-sm ${
                  entry ? DAY_TYPE_BG[entry.day_type] : ""
                } ${isToday ? "ring-2 ring-neutral-900 dark:ring-neutral-100" : ""}`}
              >
                <span className={isToday ? "font-semibold" : ""}>{day}</span>
                {entry && <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${DAY_TYPE_DOT[entry.day_type]}`} />}
                {entry && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max max-w-[10rem] -translate-x-1/2 rounded-md bg-neutral-900 px-2 py-1 text-xs text-white group-hover:block dark:bg-neutral-100 dark:text-neutral-900">
                    {DAY_TYPE_LABELS[entry.day_type]}
                    {entry.description ? ` — ${entry.description}` : ""}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-800">
          {(Object.keys(DAY_TYPE_LABELS) as InstituteCalendarDay["day_type"][]).map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${DAY_TYPE_DOT[type]}`} />
              {DAY_TYPE_LABELS[type]}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
