import { useEffect, useMemo, useState, useCallback, type FormEvent } from "react"
import { useAuth } from "../context/AuthContext"
import { listCourses, type Course } from "../features/courses/api"
import { listEventsWithCourse, setEventDone, createEvent, deleteEvent, type CourseEvent } from "../features/events/api"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"
import { Input, Label } from "../components/ui/Input"

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

  function toggleDone(e: EventWithCourse) {
    const next = !e.done
    setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, done: next } : x)))
    setEventDone(e.id, next).catch(() => load())
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
        <p className="mt-6 text-sm text-neutral-400">Loading…</p>
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
          {overdue.length > 0 && <Section title="Overdue" events={overdue} onToggle={toggleDone} onRemove={remove} />}
          <Section title="Upcoming" events={upcoming} onToggle={toggleDone} onRemove={remove} emptyText="Nothing upcoming — you're all caught up." />
          {done.length > 0 && (
            <div>
              <button onClick={() => setShowDone((v) => !v)} className="text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                {showDone ? "Hide" : "Show"} completed ({done.length})
              </button>
              {showDone && (
                <div className="mt-2 space-y-2">
                  {done.map((e) => (
                    <EventRow key={e.id} event={e} onToggle={toggleDone} onRemove={remove} />
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

function Section({
  title,
  events,
  onToggle,
  onRemove,
  emptyText,
}: {
  title: string
  events: EventWithCourse[]
  onToggle: (e: EventWithCourse) => void
  onRemove: (e: EventWithCourse) => void
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
            <EventRow key={e.id} event={e} onToggle={onToggle} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  )
}

function EventRow({ event, onToggle, onRemove }: { event: EventWithCourse; onToggle: (e: EventWithCourse) => void; onRemove: (e: EventWithCourse) => void }) {
  const cd = event.done ? null : countdownLabel(event.event_date)
  const dateStr = new Date(`${event.event_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  return (
    <Card className="flex items-center gap-3 py-3">
      <button
        onClick={() => onToggle(event)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          event.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-neutral-300 hover:border-neutral-400 dark:border-neutral-600"
        }`}
        aria-label={event.done ? "Mark not done" : "Mark done"}
      >
        {event.done && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`flex items-center gap-2 truncate text-sm font-medium ${event.done ? "text-neutral-400 line-through" : ""}`}>
          <span className="truncate">{event.title}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-neutral-500">
          {event.courses && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: event.courses.color }} />}
          <span className="truncate">{[event.courses?.name, dateStr].filter(Boolean).join(" · ")}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone="neutral">{TYPE_LABELS[event.event_type] ?? "Other"}</Badge>
        {cd && <Badge tone={cd.tone}>{cd.text}</Badge>}
        <button onClick={() => onRemove(event)} className="text-neutral-300 hover:text-red-600" aria-label="Delete">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </Card>
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
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Close">
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
