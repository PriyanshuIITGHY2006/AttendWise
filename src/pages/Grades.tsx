import { useEffect, useState, useCallback, useMemo } from "react"
import { useAuth } from "../context/AuthContext"
import { listCourses, updateCourse, type Course } from "../features/courses/api"
import { listAllEventsForUser, createEvent, updateEvent, deleteEvent, type CourseEvent } from "../features/events/api"
import { courseGrade, gradePointFor, computeSgpa } from "../features/grades/gpa"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"

const TYPE_LABELS: Record<string, string> = { quiz: "Quiz", assignment: "Assignment", exam: "Exam", other: "Other" }

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// A single assessment row with local, controlled numeric fields that persist on
// blur -- so typing feels instant and we only write to the DB when a value
// actually settles.
function AssessmentRow({
  event,
  onSave,
  onDelete,
}: {
  event: CourseEvent
  onSave: (patch: { score?: number | null; max_score?: number | null; weightage?: number | null }) => void
  onDelete: () => void
}) {
  const [score, setScore] = useState(event.score?.toString() ?? "")
  const [max, setMax] = useState(event.max_score?.toString() ?? "")
  const [weight, setWeight] = useState(event.weightage?.toString() ?? "")

  const num = (v: string) => (v.trim() === "" ? null : Number(v))

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 py-2.5 first:border-t-0 dark:border-neutral-800">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{event.title}</p>
        <Badge tone="neutral">{TYPE_LABELS[event.event_type] ?? event.event_type}</Badge>
      </div>
      <div className="flex items-center gap-1 text-sm">
        <input
          type="number"
          inputMode="decimal"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          onBlur={() => onSave({ score: num(score) })}
          placeholder="—"
          className="w-14 rounded-md border border-neutral-200 bg-white px-2 py-1 text-right dark:border-neutral-700 dark:bg-neutral-800"
          aria-label="Score"
        />
        <span className="text-neutral-400">/</span>
        <input
          type="number"
          inputMode="decimal"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => onSave({ max_score: num(max) })}
          placeholder="max"
          className="w-14 rounded-md border border-neutral-200 bg-white px-2 py-1 text-right dark:border-neutral-700 dark:bg-neutral-800"
          aria-label="Out of"
        />
      </div>
      <div className="flex items-center gap-1 text-sm">
        <input
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => onSave({ weightage: num(weight) })}
          placeholder="wt"
          className="w-12 rounded-md border border-neutral-200 bg-white px-2 py-1 text-right dark:border-neutral-700 dark:bg-neutral-800"
          aria-label="Weightage percent"
        />
        <span className="text-neutral-400">%</span>
      </div>
      <button onClick={onDelete} className="text-sm text-neutral-400 hover:text-red-600" aria-label="Delete assessment">
        ✕
      </button>
    </div>
  )
}

function AddAssessment({ onAdd }: { onAdd: (title: string, type: string, max: number | null, weight: number | null) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [type, setType] = useState("quiz")
  const [max, setMax] = useState("")
  const [weight, setWeight] = useState("")

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        + Add assessment
      </button>
    )
  }
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Quiz 1"
        className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        >
          <option value="quiz">Quiz</option>
          <option value="assignment">Assignment</option>
          <option value="exam">Exam</option>
          <option value="other">Other</option>
        </select>
        <input
          type="number"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder="Out of"
          className="w-20 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Weight %"
          className="w-24 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            if (!title.trim()) return
            onAdd(title.trim(), type, max.trim() === "" ? null : Number(max), weight.trim() === "" ? null : Number(weight))
            setTitle("")
            setMax("")
            setWeight("")
            setOpen(false)
          }}
        >
          Add
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function Grades() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [events, setEvents] = useState<CourseEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [cs, evs] = await Promise.all([listCourses(user.id), listAllEventsForUser(user.id)])
    setCourses(cs)
    setEvents(evs)
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Grade-relevant events = those carrying any grade field.
  const assessmentsByCourse = useMemo(() => {
    const m = new Map<string, CourseEvent[]>()
    for (const e of events) {
      if (e.weightage === null && e.score === null && e.max_score === null) continue
      if (!m.has(e.course_id)) m.set(e.course_id, [])
      m.get(e.course_id)!.push(e)
    }
    return m
  }, [events])

  const sgpaInput = courses.map((c) => {
    const grade = courseGrade(assessmentsByCourse.get(c.id) ?? [])
    return { credits: c.credits, gradePoint: grade.currentPercent !== null ? gradePointFor(grade.currentPercent).point : null }
  })
  const { sgpa, totalCredits } = computeSgpa(sgpaInput)

  async function saveCredits(courseId: string, value: string) {
    const credits = value.trim() === "" ? null : Number(value)
    setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, credits } : c)))
    await updateCourse(courseId, { credits })
  }

  async function addAssessment(courseId: string, title: string, type: string, max: number | null, weight: number | null) {
    if (!user) return
    const created = await createEvent({
      course_id: courseId,
      user_id: user.id,
      title,
      event_type: type,
      event_date: todayISO(),
      max_score: max,
      weightage: weight,
    })
    setEvents((prev) => [...prev, created])
  }

  async function saveAssessment(id: string, patch: { score?: number | null; max_score?: number | null; weightage?: number | null }) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    await updateEvent(id, patch)
  }

  async function removeAssessment(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    await deleteEvent(id)
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Grades &amp; GPA</h1>
      <p className="mt-1 text-sm text-neutral-500">Log each assessment's marks and weight to project your grade.</p>

      <Card className="mt-6 flex items-center justify-between bg-indigo-50/60 dark:bg-indigo-500/10">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-500/80">Projected SGPA</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
            {sgpa !== null ? sgpa.toFixed(2) : "—"}
          </p>
        </div>
        <div className="text-right text-xs text-neutral-500">
          <p>{totalCredits} credits counted</p>
          <p className="mt-1 max-w-[10rem]">Estimate from an absolute scale — real grading is relative.</p>
        </div>
      </Card>

      {courses.length === 0 ? (
        <Card className="mt-6">
          <p className="text-sm text-neutral-500">Add a course first to start tracking grades.</p>
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          {courses.map((c) => {
            const list = assessmentsByCourse.get(c.id) ?? []
            const grade = courseGrade(list)
            const gp = grade.currentPercent !== null ? gradePointFor(grade.currentPercent) : null
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="truncate font-medium">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {gp && (
                      <div className="text-right">
                        <span className="text-sm font-semibold tabular-nums">{grade.currentPercent!.toFixed(1)}%</span>
                        <Badge tone={gp.point >= 6 ? "green" : gp.point >= 4 ? "yellow" : "red"}>
                          {gp.letter} · {gp.point}
                        </Badge>
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                      Credits
                      <input
                        type="number"
                        defaultValue={c.credits ?? ""}
                        onBlur={(e) => saveCredits(c.id, e.target.value)}
                        placeholder="—"
                        className="w-14 rounded-md border border-neutral-200 bg-white px-2 py-1 text-right text-sm dark:border-neutral-700 dark:bg-neutral-800"
                      />
                    </label>
                  </div>
                </div>

                {list.length > 0 && (
                  <div className="mt-3">
                    {list.map((e) => (
                      <AssessmentRow
                        key={e.id}
                        event={e}
                        onSave={(patch) => saveAssessment(e.id, patch)}
                        onDelete={() => removeAssessment(e.id)}
                      />
                    ))}
                    <p className="mt-2 text-xs text-neutral-500">
                      {grade.gradedWeight.toFixed(0)}% of the grade weighted so far · {grade.lockedPercent.toFixed(1)} points locked in
                    </p>
                  </div>
                )}

                <AddAssessment onAdd={(title, type, max, weight) => addAssessment(c.id, title, type, max, weight)} />
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
