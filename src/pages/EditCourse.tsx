import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  getCourse,
  listSchedule,
  updateCourse,
  replaceSchedule,
  type Course,
  type CourseSchedule,
} from "../features/courses/api"
import { CourseForm, type CourseFormValues, type ScheduleDraft } from "../features/courses/CourseForm"

function toDraft(slot: CourseSchedule): ScheduleDraft {
  return {
    id: slot.id,
    dayOfWeek: slot.day_of_week,
    startTime: slot.start_time.slice(0, 5),
    endTime: slot.end_time.slice(0, 5),
    room: slot.room ?? "",
    componentType: slot.component_type as ScheduleDraft["componentType"],
  }
}

export function EditCourse() {
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const [course, setCourse] = useState<Course | null>(null)
  const [slots, setSlots] = useState<ScheduleDraft[] | null>(null)

  useEffect(() => {
    if (!courseId) return
    Promise.all([getCourse(courseId), listSchedule(courseId)]).then(([c, s]) => {
      setCourse(c)
      setSlots(s.map(toDraft))
    })
  }, [courseId])

  async function handleSubmit(values: CourseFormValues) {
    if (!courseId) return

    await updateCourse(courseId, {
      name: values.name,
      code: values.code || null,
      instructor: values.instructor || null,
      semester: values.semester,
      color: values.color,
      course_type: values.courseType,
      attendance_threshold: values.threshold,
      strict_no_skip: values.strictNoSkip,
      term: values.term,
      semester_start: values.semesterStart,
      semester_end: values.semesterEnd,
    })

    await replaceSchedule(
      courseId,
      values.slots.map((s) => ({
        day_of_week: s.dayOfWeek,
        start_time: s.startTime,
        end_time: s.endTime,
        room: s.room || null,
        component_type: s.componentType,
      })),
    )

    // replaceSchedule now re-projects sessions atomically; no separate generate.
    navigate(`/courses/${courseId}`)
  }

  if (!course || !slots) return <p className="text-sm text-neutral-400">Loading…</p>

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Edit course</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Changing the schedule regenerates future sessions — anything you've already marked attendance for is left untouched.
      </p>
      <div className="mt-6">
        <CourseForm
          submitLabel="Save changes"
          onSubmit={handleSubmit}
          initialValues={{
            courseType: course.course_type as "course" | "lab",
            name: course.name,
            code: course.code ?? "",
            instructor: course.instructor ?? "",
            semester: course.semester,
            color: course.color,
            threshold: course.attendance_threshold,
            strictNoSkip: course.strict_no_skip,
            term: (course.term as CourseFormValues["term"]) ?? "full",
            semesterStart: course.semester_start,
            semesterEnd: course.semester_end,
            slots,
          }}
        />
      </div>
    </div>
  )
}
