import { useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { createCourse, addScheduleSlot, generateSessions } from "../features/courses/api"
import { CourseForm, emptySlot, type CourseFormValues } from "../features/courses/CourseForm"
import { CURRENT_SEMESTER } from "../features/courses/currentSemester"

export function NewCourse() {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(values: CourseFormValues) {
    if (!user) return

    const course = await createCourse({
      user_id: user.id,
      name: values.name,
      code: values.code || null,
      instructor: values.instructor || null,
      semester: values.semester,
      color: values.color,
      course_type: values.courseType,
      attendance_threshold: values.threshold,
      semester_start: values.semesterStart,
      semester_end: values.semesterEnd,
    })

    for (const s of values.slots) {
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
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Add course</h1>
      <div className="mt-6">
        <CourseForm
          submitLabel="Create course"
          onSubmit={handleSubmit}
          initialValues={{
            courseType: "course",
            name: "",
            code: "",
            instructor: "",
            semester: CURRENT_SEMESTER.label,
            color: "#2563eb",
            threshold: 75,
            semesterStart: CURRENT_SEMESTER.start,
            semesterEnd: CURRENT_SEMESTER.end,
            slots: [emptySlot()],
          }}
        />
      </div>
    </div>
  )
}
