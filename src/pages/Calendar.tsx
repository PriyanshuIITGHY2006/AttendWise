import { useEffect, useState } from "react"
import { listInstituteCalendar, type InstituteCalendarDay } from "../features/calendar/api"
import { Card } from "../components/ui/Card"
import { Badge } from "../components/ui/Badge"

const DAY_TYPE_LABELS: Record<InstituteCalendarDay["day_type"], string> = {
  holiday: "Holiday",
  mid_sem_break: "Mid-sem exams",
  end_sem_break: "End-sem exams",
}

const DAY_TYPE_TONES: Record<InstituteCalendarDay["day_type"], "green" | "yellow" | "red" | "neutral"> = {
  holiday: "green",
  mid_sem_break: "yellow",
  end_sem_break: "red",
}

function monthKey(date: string) {
  return date.slice(0, 7) // YYYY-MM
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

export function Calendar() {
  const [days, setDays] = useState<InstituteCalendarDay[] | null>(null)

  useEffect(() => {
    listInstituteCalendar().then(setDays)
  }, [])

  if (days === null) return <p className="text-sm text-neutral-400">Loading…</p>

  if (days.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Institute calendar</h1>
        <Card className="mt-6">
          <p className="text-sm text-neutral-500">No calendar data has been added yet.</p>
        </Card>
      </div>
    )
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  const groups = new Map<string, InstituteCalendarDay[]>()
  for (const day of days) {
    const key = monthKey(day.date)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(day)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Institute calendar</h1>
      <p className="mt-1 text-sm text-neutral-500">Holidays and exam weeks, shared across all courses.</p>

      <div className="mt-6 space-y-6">
        {[...groups.entries()].map(([key, entries]) => (
          <div key={key}>
            <h2 className="text-sm font-medium text-neutral-500">{monthLabel(key)}</h2>
            <Card className="mt-2">
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {entries.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between gap-3 py-2.5 text-sm ${d.date < todayISO ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-24 shrink-0 font-medium">
                        {new Date(d.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      {d.description && <span className="text-neutral-500">{d.description}</span>}
                    </div>
                    <Badge tone={DAY_TYPE_TONES[d.day_type]}>{DAY_TYPE_LABELS[d.day_type]}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
