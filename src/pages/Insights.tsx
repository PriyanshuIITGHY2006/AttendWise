import { useEffect, useState, useCallback, useMemo } from "react"
import { useAuth } from "../context/AuthContext"
import { listAllAttendance, listCourses, type Course } from "../features/courses/api"
import { computeInsights, type Insights as InsightsData } from "../features/attendance/insights"
import { Card } from "../components/ui/Card"
import { Badge } from "../components/ui/Badge"

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" | "neutral" }) {
  const valueColor =
    tone === "green" ? "text-emerald-600 dark:text-emerald-400" : tone === "red" ? "text-red-600 dark:text-red-400" : ""
  return (
    <Card className="text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </Card>
  )
}

// Single-hue magnitude bars (brand indigo), with the best/worst day accented in
// the reserved status colors and always labelled -- never color alone.
function WeekdayChart({ data }: { data: InsightsData }) {
  const bars = data.byWeekday.filter((w) => w.total > 0)
  if (bars.length === 0) return null
  return (
    <Card>
      <h2 className="font-medium">Attendance by day of week</h2>
      <div className="mt-4 flex items-end justify-between gap-2" style={{ height: 140 }}>
        {data.byWeekday.map((w) => {
          const isBest = w.dow === data.bestWeekday && w.total > 0
          const isWorst = w.dow === data.worstWeekday && w.total > 0
          const color = isBest ? "bg-emerald-500" : isWorst ? "bg-red-500" : "bg-indigo-500"
          const height = w.total > 0 ? Math.max(4, (w.rate / 100) * 108) : 0
          return (
            <div key={w.dow} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-neutral-400">{w.total > 0 ? `${w.rate.toFixed(0)}%` : ""}</span>
              <div className="flex w-full flex-1 items-end justify-center">
                {w.total > 0 ? (
                  <div className={`w-full max-w-[28px] rounded-t ${color}`} style={{ height }} />
                ) : (
                  <div className="w-full max-w-[28px] rounded-t bg-neutral-100 dark:bg-neutral-800" style={{ height: 4 }} />
                )}
              </div>
              <span className="text-[11px] text-neutral-500">{WEEKDAY_SHORT[w.dow]}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.bestWeekday !== null && <Badge tone="green">Best: {WEEKDAY[data.bestWeekday]}</Badge>}
        {data.worstWeekday !== null && <Badge tone="red">Weakest: {WEEKDAY[data.worstWeekday]}</Badge>}
      </div>
    </Card>
  )
}

// Single-series line: overall cumulative attendance % over time. One series, so
// no legend -- the title names it. A faint 75% guide gives the number context.
function TrendChart({ data }: { data: InsightsData }) {
  if (data.cumulative.length < 2) return null
  const W = 320
  const H = 120
  const n = data.cumulative.length
  const points = data.cumulative.map((p, i) => {
    const x = (i / (n - 1)) * W
    const y = H - (p.percent / 100) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const guideY = H - (75 / 100) * H
  const last = data.cumulative[n - 1].percent
  return (
    <Card>
      <h2 className="font-medium">Overall attendance over time</h2>
      <p className="mt-0.5 text-xs text-neutral-500">Running % across all courses, {n} classes marked.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-32 w-full overflow-visible" preserveAspectRatio="none">
        <line x1="0" y1={guideY} x2={W} y2={guideY} stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-neutral-300 dark:text-neutral-700" />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-indigo-500"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
        <span>75% line</span>
        <span className="font-medium text-neutral-700 dark:text-neutral-300">Now: {last.toFixed(0)}%</span>
      </div>
    </Card>
  )
}

export function Insights() {
  const { user } = useAuth()
  const [records, setRecords] = useState<{ status: string; date: string; courseId: string }[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [recs, cs] = await Promise.all([listAllAttendance(user.id), listCourses(user.id)])
    setRecords(recs)
    setCourses(cs)
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const data = useMemo(() => computeInsights(records), [records])
  const courseName = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])

  const mom =
    data.thisMonthPercent !== null && data.lastMonthPercent !== null
      ? data.thisMonthPercent - data.lastMonthPercent
      : null

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>

  if (data.present + data.absent === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <Card className="mt-6">
          <p className="text-sm text-neutral-500">
            No attendance marked yet. Once you start marking classes present or absent, your streaks, trends and best/worst days show up here.
          </p>
        </Card>
      </div>
    )
  }

  const perCourseList = [...data.perCourse.values()].sort((a, b) => a.percent - b.percent)

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {data.present} present · {data.absent} absent across all courses.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Overall"
          value={`${data.overallPercent.toFixed(0)}%`}
          tone={data.overallPercent >= 75 ? "green" : "red"}
        />
        <StatTile label="Current streak" value={`${data.currentStreak}`} sub={data.currentStreak === 1 ? "class present" : "classes present"} />
        <StatTile label="Best streak" value={`${data.longestStreak}`} sub="in a row" />
        <StatTile
          label="This month"
          value={data.thisMonthPercent !== null ? `${data.thisMonthPercent.toFixed(0)}%` : "—"}
          sub={mom !== null ? `${mom >= 0 ? "+" : ""}${mom.toFixed(0)}% vs last month` : undefined}
          tone={mom === null ? "neutral" : mom >= 0 ? "green" : "red"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TrendChart data={data} />
        <WeekdayChart data={data} />
      </div>

      <Card className="mt-6">
        <h2 className="font-medium">By course</h2>
        <div className="mt-4 space-y-3">
          {perCourseList.map((cp) => {
            const course = courseName.get(cp.courseId)
            const tone = cp.percent >= 75 ? "green" : cp.percent >= 65 ? "yellow" : "red"
            const bar = tone === "green" ? "bg-emerald-500" : tone === "yellow" ? "bg-amber-500" : "bg-red-500"
            return (
              <div key={cp.courseId}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: course?.color ?? "#999" }} />
                    <span className="truncate font-medium">{course?.name ?? "Course"}</span>
                  </span>
                  <span className="tabular-nums text-neutral-500">
                    {cp.present}/{cp.present + cp.absent} · {cp.percent.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, cp.percent)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
