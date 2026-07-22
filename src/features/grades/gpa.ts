// Grade & GPA math, kept pure. Assessments are course_events carrying a
// score / max_score / weightage. A course's grade is the weightage-weighted
// average of its graded components; SGPA is the credit-weighted average of the
// courses' grade points.
//
// NOTE: institutes grade *relatively*, so mapping an absolute % to a grade
// point is only an estimate -- the UI labels it as such. The scale below is a
// common 10-point absolute fallback.

export type Assessment = {
  score: number | null
  max_score: number | null
  weightage: number | null
}

export type CourseGrade = {
  gradedWeight: number // sum of weightage across graded components
  lockedPercent: number // points earned so far, out of 100 total weight
  currentPercent: number | null // grade within the graded portion (0-100), null if nothing graded
  gradedCount: number
}

const GRADE_SCALE: { min: number; point: number; letter: string }[] = [
  { min: 90, point: 10, letter: "AA" },
  { min: 80, point: 9, letter: "AB" },
  { min: 70, point: 8, letter: "BB" },
  { min: 60, point: 7, letter: "BC" },
  { min: 50, point: 6, letter: "CC" },
  { min: 45, point: 5, letter: "CD" },
  { min: 40, point: 4, letter: "DD" },
  { min: 0, point: 0, letter: "F" },
]

export function gradePointFor(percent: number): { point: number; letter: string } {
  const band = GRADE_SCALE.find((b) => percent >= b.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1]
  return { point: band.point, letter: band.letter }
}

function isGraded(a: Assessment): a is { score: number; max_score: number; weightage: number } {
  return a.score !== null && a.max_score !== null && a.max_score > 0 && a.weightage !== null
}

export function courseGrade(assessments: Assessment[]): CourseGrade {
  const graded = assessments.filter(isGraded)
  let gradedWeight = 0
  let lockedPercent = 0
  for (const a of graded) {
    gradedWeight += a.weightage
    lockedPercent += (a.score / a.max_score) * a.weightage
  }
  return {
    gradedWeight,
    lockedPercent,
    currentPercent: gradedWeight > 0 ? (lockedPercent / gradedWeight) * 100 : null,
    gradedCount: graded.length,
  }
}

export type CourseForGpa = { credits: number | null; gradePoint: number | null }

/** Credit-weighted SGPA over courses that have both credits and a grade point. */
export function computeSgpa(courses: CourseForGpa[]): { sgpa: number | null; totalCredits: number } {
  let creditSum = 0
  let weighted = 0
  for (const c of courses) {
    if (c.credits && c.credits > 0 && c.gradePoint !== null) {
      creditSum += c.credits
      weighted += c.credits * c.gradePoint
    }
  }
  return { sgpa: creditSum > 0 ? weighted / creditSum : null, totalCredits: creditSum }
}
