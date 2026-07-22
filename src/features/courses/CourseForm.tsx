import { useState, type FormEvent } from "react"
import { Card } from "../../components/ui/Card"
import { Button } from "../../components/ui/Button"
import { Input, Label } from "../../components/ui/Input"
import { CURRENT_SEMESTER } from "./currentSemester"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777"]

export type CourseTerm = "full" | "pre_mid" | "post_mid"

const TERM_OPTIONS: { value: CourseTerm; label: string; hint: string }[] = [
  { value: "full", label: "Full semester", hint: "Runs the whole semester" },
  { value: "pre_mid", label: "First half", hint: "Start of semester → mid-sem" },
  { value: "post_mid", label: "Second half", hint: "Mid-sem → end of semester" },
]

// Default date span for each term, so switching duration snaps the two date
// fields to sensible bounds the user can still fine-tune.
function defaultSpanFor(term: CourseTerm): { start: string; end: string } {
  if (term === "pre_mid") return { start: CURRENT_SEMESTER.start, end: CURRENT_SEMESTER.mid }
  if (term === "post_mid") return { start: CURRENT_SEMESTER.mid, end: CURRENT_SEMESTER.end }
  return { start: CURRENT_SEMESTER.start, end: CURRENT_SEMESTER.end }
}

// The two date inputs hold the effective span (what session generation uses),
// so their labels change with the term to stay meaningful.
function dateLabels(term: CourseTerm): { start: string; end: string } {
  if (term === "pre_mid") return { start: "Semester start", end: "Mid-sem date" }
  if (term === "post_mid") return { start: "Mid-sem date", end: "Semester end" }
  return { start: "Semester start", end: "Semester end" }
}

/** Short badge label for a half-semester course, or null for a full-semester one. */
export function termLabel(term: string | null | undefined): string | null {
  if (term === "pre_mid") return "First half"
  if (term === "post_mid") return "Second half"
  return null
}

export type ScheduleDraft = {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
  room: string
  componentType: "lecture" | "lab" | "tutorial"
}

export function emptySlot(componentType: ScheduleDraft["componentType"] = "lecture"): ScheduleDraft {
  return { dayOfWeek: 0, startTime: "09:00", endTime: "10:00", room: "", componentType }
}

export type CourseFormValues = {
  courseType: "course" | "lab"
  name: string
  code: string
  instructor: string
  semester: string
  color: string
  threshold: number
  strictNoSkip: boolean
  term: CourseTerm
  semesterStart: string
  semesterEnd: string
  slots: ScheduleDraft[]
}

export function CourseForm({
  initialValues,
  submitLabel,
  onSubmit,
}: {
  initialValues: CourseFormValues
  submitLabel: string
  onSubmit: (values: CourseFormValues) => Promise<void>
}) {
  const [courseType, setCourseType] = useState(initialValues.courseType)
  const [name, setName] = useState(initialValues.name)
  const [code, setCode] = useState(initialValues.code)
  const [instructor, setInstructor] = useState(initialValues.instructor)
  const [semester, setSemester] = useState(initialValues.semester)
  const [color, setColor] = useState(initialValues.color)
  const [threshold, setThreshold] = useState(initialValues.threshold)
  const [strictNoSkip, setStrictNoSkip] = useState(initialValues.strictNoSkip)
  const [term, setTerm] = useState<CourseTerm>(initialValues.term)
  const [semesterStart, setSemesterStart] = useState(initialValues.semesterStart)
  const [semesterEnd, setSemesterEnd] = useState(initialValues.semesterEnd)
  const [slots, setSlots] = useState<ScheduleDraft[]>(initialValues.slots)

  // Switching duration snaps both dates to that term's default span. The user
  // can still tweak either date afterward (e.g. a first-half course that
  // actually starts a week late).
  function changeTerm(next: CourseTerm) {
    setTerm(next)
    const span = defaultSpanFor(next)
    setSemesterStart(span.start)
    setSemesterEnd(span.end)
  }

  const labels = dateLabels(term)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateSlot(index: number, patch: Partial<ScheduleDraft>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!semesterStart || !semesterEnd) {
      setError("Set the semester start and end dates.")
      return
    }
    if (slots.length === 0) {
      setError("Add at least one weekly class slot.")
      return
    }
    for (const s of slots) {
      if (s.endTime <= s.startTime) {
        setError("Each slot's end time must be after its start time.")
        return
      }
    }

    setSubmitting(true)
    try {
      await onSubmit({ courseType, name, code, instructor, semester, color, threshold, strictNoSkip, term, semesterStart, semesterEnd, slots })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="space-y-4">
        <div>
          <Label>Type</Label>
          <div className="inline-flex rounded-md border border-neutral-300 p-0.5 dark:border-neutral-700">
            {(["course", "lab"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setCourseType(t)}
                className={`rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  courseType === t
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Duration</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TERM_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => changeTerm(opt.value)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                  term === opt.value
                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500/30 dark:border-indigo-500 dark:bg-indigo-500/10"
                    : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700"
                }`}
              >
                <span className={`block text-sm font-medium ${term === opt.value ? "text-indigo-700 dark:text-indigo-300" : "text-neutral-800 dark:text-neutral-200"}`}>
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Course name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Data Structures" />
          </div>
          <div>
            <Label htmlFor="code">Course code</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS201" />
          </div>
          <div>
            <Label htmlFor="instructor">Instructor</Label>
            <Input id="instructor" value={instructor} onChange={(e) => setInstructor(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="semester">Semester</Label>
            <Input id="semester" required value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Monsoon 2026" />
          </div>
          <div>
            <Label htmlFor="semesterStart">{labels.start}</Label>
            <Input id="semesterStart" type="date" required value={semesterStart} onChange={(e) => setSemesterStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="semesterEnd">{labels.end}</Label>
            <Input id="semesterEnd" type="date" required value={semesterEnd} onChange={(e) => setSemesterEnd(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="threshold">Attendance criterion (%)</Label>
            <Input
              id="threshold"
              type="number"
              min={0}
              max={100}
              required
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={strictNoSkip}
                onChange={(e) => setStrictNoSkip(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 dark:border-neutral-700"
              />
              Zero-tolerance (never plan a skip for this one)
            </label>
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 pt-1">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-neutral-900 dark:ring-offset-neutral-950 dark:ring-neutral-100" : ""}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Weekly schedule</h2>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSlots((prev) => [...prev, emptySlot(courseType === "lab" ? "lab" : "lecture")])}
          >
            Add slot
          </Button>
        </div>
        <div className="space-y-3">
          {slots.map((slot, i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-5 dark:border-neutral-800"
            >
              <select
                value={slot.dayOfWeek}
                onChange={(e) => updateSlot(i, { dayOfWeek: Number(e.target.value) })}
                className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                {DAYS.map((d, idx) => (
                  <option key={d} value={idx}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={slot.componentType}
                onChange={(e) => updateSlot(i, { componentType: e.target.value as ScheduleDraft["componentType"] })}
                className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="lecture">Lecture</option>
                <option value="lab">Lab</option>
                <option value="tutorial">Tutorial</option>
              </select>
              <Input type="time" value={slot.startTime} onChange={(e) => updateSlot(i, { startTime: e.target.value })} />
              <Input type="time" value={slot.endTime} onChange={(e) => updateSlot(i, { endTime: e.target.value })} />
              <div className="flex gap-2">
                <Input placeholder="Room" value={slot.room} onChange={(e) => updateSlot(i, { room: e.target.value })} />
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSlots((prev) => prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 text-sm text-neutral-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  )
}
