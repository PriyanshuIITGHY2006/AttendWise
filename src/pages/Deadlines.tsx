import { useEffect, useMemo, useState, useCallback, type FormEvent } from "react"
import { useAuth } from "../context/AuthContext"
import { listCourses, type Course } from "../features/courses/api"
import { listEventsWithCourse, setEventDone, updateEvent, createEvent, deleteEvent, type CourseEvent } from "../features/events/api"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"
import { Input, Label } from "../components/ui/Input"
import { tapFeedback } from "../lib/haptics"
import { ListSkeleton } from "../components/ui/Skeleton"

type EventWithCourse = CourseEvent & { courses: { name: string; color: string } | null }

const TYPE_LABELS: Record<string, string> = { quiz: "Quiz", assignment: "Assignment", exam: "Exam", other: "Other" }
const TYPES = ["assignment", "quiz", "exam", "other"] as const

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Whole-day difference between an event date and today.
function daysUntil(dateISO: string): number {
  const d = new Date(`${dateISO}T00:00:00`)
  const t = new Date(`${todayISO()}T00:00:00`)
  return Math.round((d.getTime() - t.getTime()) / 86_400_000)
}

function countdownLabel(dateISO: string): { text: string; tone: "green" | "yellow" | "red" | "neutral" } {
  const n = daysUntil(dateISO)
  if (n < 0) return { text: `${-n} day${n === -1 ? "" : "s"} ago`, tone: "red" }
  if (n === 0) return { text: "Today", tone: "red" }
  if (n === 1) return { text: "Tomorrow", tone: "yellow" }
  if (n <= 3) return { text: `in ${n} days`, tone: "yellow" }
  return { text: `in ${n} days`, tone: "neutral" }
}

// A scored event is one with both a score and a positive max — used for the
// marks tracker. Weightage is optional; when present, per-course averages are
// weighted, otherwise every assessment counts equally.
function isScored(e: CourseEvent): e is CourseEvent & { score: number; max_score: number } {
  return e.score != null && e.max_score != null && e.max_score > 0
}

function pct(score: number, max: number): number {
  return Math.round((score / max) * 1000) / 10
}

function scoreTone(percent: number): "green" | "yellow" | "red" {
  if (percent >= 75) return "green"
  if (percent >= 40) return "yellow"
  return "red"
}

export function Deadlines() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [events, setEvents] = useState<EventWithCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [c, e] = await Promise.all([listCourses(user.id), listEventsWithCourse(user.id)])
    setCourses(c)
    setEvents(e as EventWithCourse[])
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const { overdue, upcoming, done } = useMemo(() => {
    const overdue: EventWithCourse[] = []
    const upcoming: EventWithCourse[] = []
    const done: EventWithCourse[] = []
    for (const e of events) {
      if (e.done) done.push(e)
      else if (daysUntil(e.event_date) < 0) overdue.push(e)
      else upcoming.push(e)
    }
    return { overdue, upcoming, done }
  }, [events])

  // Per-course marks summary from every scored assessment (weighted by
  // weightage when set). No GPA/letter grades -- just plain averages.
  const performance = useMemo(() => {
    const byCourse = new Map<string, { name: string; color: string; weighted: number; weight: number; count: number }>()
    let allWeighted = 0
    let allWeight = 0
    for (const e of events) {
      if (!isScored(e)) continue
      const p = (e.score / e.max_score) * 100
      const w = e.weightage && e.weightage > 0 ? e.weightage : 1
      const key = e.course_id
      const cur = byCourse.get(key) ?? { name: e.courses?.name ?? "Course", color: e.courses?.color ?? "#a3a3a3", weighted: 0, weight: 0, count: 0 }
      cur.weighted += p * w
      cur.weight += w
      cur.count += 1
      byCourse.set(key, cur)
      allWeighted += p * w
      allWeight += w
    }
    const rows = [...byCourse.values()].map((c) => ({ ...c, avg: c.weight > 0 ? c.weighted / c.weight : 0 })).sort((a, b) => b.avg - a.avg)
    return { rows, overall: allWeight > 0 ? allWeighted / allWeight : 0, total: rows.reduce((n, r) => n + r.count, 0) }
  }, [events])

  function toggleDone(e: EventWithCourse) {
    tapFeedback()
    const next = !e.done
    setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, done: next } : x)))
    setEventDone(e.id, next).catch(() => load())
  }

  // Persist marks with an optimistic update; on failure we reload to resync.
  function saveScore(e: EventWithCourse, score: number | null, max: number | null) {
    tapFeedback()
    setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, score, max_score: max } : x)))
    updateEvent(e.id, { score, max_score: max }).catch(() => load())
  }

  async function remove(e: EventWithCourse) {
    if (!confirm(`Delete "${e.title}"?`)) return
    setEvents((prev) => prev.filter((x) => x.id !== e.id))
    try {
      await deleteEvent(e.id)
    } catch {
      load()
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Deadlines</h1>
        <Button onClick={() => setAddOpen(true)} disabled={courses.length === 0}>
          Add
        </Button>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : events.length === 0 ? (
        <Card className="mx-auto mt-6 max-w-md text-center">
          <p className="text-sm text-neutral-500">No deadlines yet.</p>
          {courses.length > 0 ? (
            <Button className="mt-3" onClick={() => setAddOpen(true)}>Add your first deadline</Button>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">Add a course first.</p>
          )}
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {performance.total > 0 && <MarksSummary performance={performance} />}
          {overdue.length > 0 && <Section title="Overdue" events={overdue} onToggle={toggleDone} onRemove={remove} onScore={saveScore} />}
          <Section title="Upcoming" events={upcoming} onToggle={toggleDone} onRemove={remove} onScore={saveScore} emptyText="Nothing upcoming — you're all caught up." />
          {done.length > 0 && (
            <div>
              <button onClick={() => setShowDone((v) => !v)} className="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-700 dark:hover:text-neutral-300">
                {showDone ? "Hide" : "Show"} completed ({done.length})
              </button>
              {showDone && (
                <div className="mt-2 space-y-2">
                  {done.map((e) => (
                    <EventRow key={e.id} event={e} onToggle={toggleDone} onRemove={remove} onScore={saveScore} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {addOpen && (
        <AddDeadline
          courses={courses}
          userId={user!.id}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

type Performance = {
  rows: { name: string; color: string; avg: number; count: number }[]
  overall: number
  total: number
}

// Marks tracker header: overall average plus a per-course breakdown with a
// little progress meter. Deliberately GPA-free -- just percentages.
function MarksSummary({ performance }: { performance: Performance }) {
  const overall = Math.round(performance.overall * 10) / 10
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Marks tracker</p>
          <p className="mt-0.5 text-sm text-neutral-500">
            {performance.total} scored assessment{performance.total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-semibold tabular-nums ${overall >= 75 ? "text-emerald-600 dark:text-emerald-400" : overall >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
            {overall}%
          </p>
          <p className="text-xs text-neutral-400">overall avg</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {performance.rows.map((r) => {
          const avg = Math.round(r.avg * 10) / 10
          return (
            <div key={r.name} className="flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300">{r.name}</span>
              <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800 sm:w-28">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, avg)}%`, backgroundColor: r.color }} />
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-neutral-600 dark:text-neutral-300">{avg}%</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function Section({
  title,
  events,
  onToggle,
  onRemove,
  onScore,
  emptyText,
}: {
  title: string
  events: EventWithCourse[]
  onToggle: (e: EventWithCourse) => void
  onRemove: (e: EventWithCourse) => void
  onScore: (e: EventWithCourse, score: number | null, max: number | null) => void
  emptyText?: string
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</p>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">{emptyText}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {events.map((e) => (
            <EventRow key={e.id} event={e} onToggle={onToggle} onRemove={onRemove} onScore={onScore} />
          ))}
        </div>
      )}
    </div>
  )
}

function EventRow({
  event,
  onToggle,
  onRemove,
  onScore,
}: {
  event: EventWithCourse
  onToggle: (e: EventWithCourse) => void
  onRemove: (e: EventWithCourse) => void
  onScore: (e: EventWithCourse, score: number | null, max: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const cd = event.done ? null : countdownLabel(event.event_date)
  const dateStr = new Date(`${event.event_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  const scored = isScored(event)
  const percent = scored ? pct(event.score, event.max_score) : null

  return (
    <Card className="py-3">
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(event)}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors active:scale-90 ${
            event.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-neutral-300 hover:border-neutral-400 dark:border-neutral-600"
          }`}
          aria-label={event.done ? "Mark not done" : "Mark done"}
        >
          {event.done && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${event.done ? "text-neutral-400 line-through" : ""}`}>{event.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
            <span className="flex min-w-0 items-center gap-1.5">
              {event.courses && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: event.courses.color }} />}
              <span className="truncate">{[event.courses?.name, dateStr].filter(Boolean).join(" · ")}</span>
            </span>
            <Badge tone="neutral">{TYPE_LABELS[event.event_type] ?? "Other"}</Badge>
            {percent != null ? (
              <button onClick={() => setEditing((v) => !v)} className="transition-transform active:scale-95" aria-label="Edit marks">
                <Badge tone={scoreTone(percent)}>
                  {event.score}/{event.max_score} · {percent}%
                </Badge>
              </button>
            ) : (
              <button
                onClick={() => setEditing((v) => !v)}
                className="rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700 active:scale-95 dark:border-neutral-600 dark:hover:text-neutral-300"
              >
                + Marks
              </button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {cd && <Badge tone={cd.tone}>{cd.text}</Badge>}
          <button onClick={() => onRemove(event)} className="text-neutral-300 transition-colors hover:text-red-600" aria-label="Delete">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
      {editing && (
        <ScoreEditor
          event={event}
          onCancel={() => setEditing(false)}
          onSave={(score, max) => {
            onScore(event, score, max)
            setEditing(false)
          }}
        />
      )}
    </Card>
  )
}

// Inline marks entry: score / max plus optional weightage (% of final grade).
// Clearing both score and max removes the marks for this assessment.
function ScoreEditor({
  event,
  onCancel,
  onSave,
}: {
  event: EventWithCourse
  onCancel: () => void
  onSave: (score: number | null, max: number | null) => void
}) {
  const [score, setScore] = useState(event.score != null ? String(event.score) : "")
  const [max, setMax] = useState(event.max_score != null ? String(event.max_score) : "")

  function submit(e: FormEvent) {
    e.preventDefault()
    const s = score.trim() === "" ? null : Number(score)
    const m = max.trim() === "" ? null : Number(max)
    onSave(Number.isFinite(s as number) ? s : null, Number.isFinite(m as number) ? m : null)
  }

  const inputClass = "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"

  return (
    <form onSubmit={submit} className="mt-3 flex items-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <div className="flex-1">
        <label className="mb-1 block text-xs font-medium text-neutral-500">Score</label>
        <input type="number" inputMode="decimal" step="any" min="0" value={score} onChange={(e) => setScore(e.target.value)} placeholder="18" className={inputClass} autoFocus />
      </div>
      <span className="pb-2 text-neutral-400">/</span>
      <div className="flex-1">
        <label className="mb-1 block text-xs font-medium text-neutral-500">Out of</label>
        <input type="number" inputMode="decimal" step="any" min="0" value={max} onChange={(e) => setMax(e.target.value)} placeholder="20" className={inputClass} />
      </div>
      <Button type="submit" className="shrink-0">Save</Button>
      <button type="button" onClick={onCancel} className="shrink-0 rounded-lg px-2 py-2 text-sm text-neutral-500 transition-colors hover:text-neutral-700 dark:hover:text-neutral-300">
        Cancel
      </button>
    </form>
  )
}

function AddDeadline({ courses, userId, onClose, onAdded }: { courses: Course[]; userId: string; onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState("")
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "")
  const [type, setType] = useState<string>("assignment")
  const [date, setDate] = useState(todayISO())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!courseId || !title.trim()) {
      setError("Add a title and pick a course.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createEvent({ course_id: courseId, user_id: userId, title: title.trim(), event_type: type, event_date: date })
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save")
    } finally {
      setSubmitting(false)
    }
  }

  const selectClass = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-neutral-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-elevated dark:bg-neutral-900 sm:rounded-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Add deadline</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="d-title">Title</Label>
            <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Assignment 3" required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="d-course">Course</Label>
              <select id="d-course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className={selectClass}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="d-type">Type</Label>
              <select id="d-type" value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="d-date">Due date</Label>
            <Input id="d-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving…" : "Add deadline"}
          </Button>
        </form>
      </div>
    </div>
  )
}
