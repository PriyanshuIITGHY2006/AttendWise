// Pure analytics over a flat list of attendance records. Kept free of any
// data-fetching or React so the math can be reasoned about (and unit-tested)
// on its own. Only resolved past classes feed the numbers: present/absent
// count, while cancelled/on_duty are neutral (they happened but belong to
// neither bucket).

export type InsightRecord = {
  status: string // present | absent | cancelled | on_duty
  date: string // YYYY-MM-DD
  courseId: string
}

export type WeekdayStat = { dow: number; present: number; total: number; rate: number }
export type CoursePercent = { courseId: string; present: number; absent: number; percent: number }

export type Insights = {
  present: number
  absent: number
  overallPercent: number
  currentStreak: number
  longestStreak: number
  byWeekday: WeekdayStat[] // length 7, index 0 = Monday
  bestWeekday: number | null
  worstWeekday: number | null
  cumulative: { date: string; percent: number }[]
  thisMonthPercent: number | null
  lastMonthPercent: number | null
  perCourse: Map<string, CoursePercent>
}

// App weekday convention: 0 = Monday … 6 = Sunday.
function appDowOfISO(iso: string): number {
  const d = new Date(`${iso}T00:00:00`)
  return (d.getDay() + 6) % 7
}
function monthKey(iso: string): string {
  return iso.slice(0, 7) // YYYY-MM
}
function rate(present: number, total: number): number {
  return total === 0 ? 0 : (present / total) * 100
}

export function computeInsights(records: InsightRecord[], now = new Date()): Insights {
  // Chronological order; ties within a day are left as-is (order is arbitrary
  // but doesn't affect any aggregate here except streak, where same-day order
  // is immaterial to the notion of a day-to-day streak).
  const graded = records
    .filter((r) => r.status === "present" || r.status === "absent")
    .sort((a, b) => a.date.localeCompare(b.date))

  let present = 0
  let absent = 0
  const byWeekday: WeekdayStat[] = Array.from({ length: 7 }, (_, dow) => ({ dow, present: 0, total: 0, rate: 0 }))
  const perCourse = new Map<string, CoursePercent>()
  const cumulative: { date: string; percent: number }[] = []
  const monthTally = new Map<string, { present: number; total: number }>()

  let runPresent = 0
  let runTotal = 0
  for (const r of graded) {
    const isPresent = r.status === "present"
    if (isPresent) present++
    else absent++
    runPresent += isPresent ? 1 : 0
    runTotal += 1
    cumulative.push({ date: r.date, percent: rate(runPresent, runTotal) })

    const wd = byWeekday[appDowOfISO(r.date)]
    wd.total++
    if (isPresent) wd.present++

    const mk = monthKey(r.date)
    if (!monthTally.has(mk)) monthTally.set(mk, { present: 0, total: 0 })
    const mt = monthTally.get(mk)!
    mt.total++
    if (isPresent) mt.present++

    let cp = perCourse.get(r.courseId)
    if (!cp) {
      cp = { courseId: r.courseId, present: 0, absent: 0, percent: 0 }
      perCourse.set(r.courseId, cp)
    }
    if (isPresent) cp.present++
    else cp.absent++
  }

  for (const wd of byWeekday) wd.rate = rate(wd.present, wd.total)
  for (const cp of perCourse.values()) cp.percent = rate(cp.present, cp.present + cp.absent)

  // Streaks measured over the graded sequence (most-recent-first for current).
  let currentStreak = 0
  for (let i = graded.length - 1; i >= 0; i--) {
    if (graded[i].status === "present") currentStreak++
    else break
  }
  let longestStreak = 0
  let run = 0
  for (const r of graded) {
    if (r.status === "present") {
      run++
      longestStreak = Math.max(longestStreak, run)
    } else run = 0
  }

  // Best / worst weekday among those with at least one graded class.
  const active = byWeekday.filter((w) => w.total > 0)
  let bestWeekday: number | null = null
  let worstWeekday: number | null = null
  if (active.length > 0) {
    bestWeekday = active.reduce((a, b) => (b.rate > a.rate ? b : a)).dow
    worstWeekday = active.reduce((a, b) => (b.rate < a.rate ? b : a)).dow
    if (bestWeekday === worstWeekday) worstWeekday = null // only one distinct day of data
  }

  const thisKey = monthKey(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`)
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastKey = monthKey(`${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-01`)
  const thisMonth = monthTally.get(thisKey)
  const lastMonth = monthTally.get(lastKey)

  return {
    present,
    absent,
    overallPercent: rate(present, present + absent),
    currentStreak,
    longestStreak,
    byWeekday,
    bestWeekday,
    worstWeekday,
    cumulative,
    thisMonthPercent: thisMonth ? rate(thisMonth.present, thisMonth.total) : null,
    lastMonthPercent: lastMonth ? rate(lastMonth.present, lastMonth.total) : null,
    perCourse,
  }
}
