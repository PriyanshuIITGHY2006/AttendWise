import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { createCourse, addScheduleSlot, generateSessions } from "../features/courses/api"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Input, Label } from "../components/ui/Input"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777"]

type ScheduleDraft = {
  dayOfWeek: number
  startTime: string
  endTime: string
  room: string
  componentType: "lecture" | "lab" | "tutorial"
}

function emptySlot(): ScheduleDraft {
  return { dayOfWeek: 0, startTime: "09:00", endTime: "10:00", room: "", componentType: "lecture" }
}

export function NewCourse() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [instructor, setInstructor] = useState("")
  const [semester, setSemester] = useState("")
  const [color, setColor] = useState(COLORS[0])
  const [threshold, setThreshold] = useState(75)
  const [semesterStart, setSemesterStart] = useState("")
  const [semesterEnd, setSemesterEnd] = useState("")
  const [slots, setSlots] = useState<ScheduleDraft[]>([emptySlot()])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateSlot(index: number, patch: Partial<ScheduleDraft>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
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
      const course = await createCourse({
        user_id: user.id,
        name,
        code: code || null,
        instructor: instructor || null,
        semester,
        color,
        attendance_threshold: threshold,
        semester_start: semesterStart,
        semester_end: semesterEnd,
      })

      for (const s of slots) {
        await addScheduleSlot({
          course_id: course.id,
          day_of_week: s.dayOfWeek,
          start_time: s.startTime,
          end_time: s.endTime,
          room: s.room || null,
          component_type: s.componentType,
        })
      }

      await generateSessions(course.id)
      navigate(`/courses/${course.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Add course</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <Card className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Input id="semester" required value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="Autumn 2026" />
            </div>
            <div>
              <Label htmlFor="semesterStart">Semester start</Label>
              <Input id="semesterStart" type="date" required value={semesterStart} onChange={(e) => setSemesterStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="semesterEnd">Semester end</Label>
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
            <Button type="button" variant="secondary" onClick={() => setSlots((prev) => [...prev, emptySlot()])}>
              Add slot
            </Button>
          </div>
          <div className="space-y-3">
            {slots.map((slot, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-5 dark:border-neutral-800">
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
          {submitting ? "Creating…" : "Create course"}
        </Button>
      </form>
    </div>
  )
}
