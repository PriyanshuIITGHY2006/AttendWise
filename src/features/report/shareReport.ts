import { listCourses, getCourseStats } from "../courses/api"
import { computeBunkSafety } from "../attendance/bunkSafety"

export type ReportRow = {
  name: string
  code: string | null
  percent: number
  attended: number
  absent: number
  remaining: number
  threshold: number
  skipsLeft: number
  status: "green" | "yellow" | "red"
}

export type AttendanceReport = {
  rows: ReportRow[]
  text: string
  csv: string
  filename: string
  generatedAt: string
}

/**
 * Builds a per-course attendance summary for sharing/export. skipsLeft nets out
 * skips the student has already planned, matching what the course pages show.
 */
export async function buildAttendanceReport(userId: string, semesterLabel: string): Promise<AttendanceReport> {
  const courses = await listCourses(userId)
  const rows: ReportRow[] = await Promise.all(
    courses.map(async (c) => {
      const stats = await getCourseStats(c.id, userId)
      const safety = computeBunkSafety({
        attended: stats.attended,
        absent: stats.absent,
        remainingSessions: stats.remainingSessions,
        thresholdPercent: c.attendance_threshold,
      })
      return {
        name: c.name,
        code: c.code,
        percent: safety.currentPercent,
        attended: stats.attended,
        absent: stats.absent,
        remaining: stats.remainingSessions,
        threshold: c.attendance_threshold,
        skipsLeft: c.strict_no_skip ? 0 : Math.max(0, safety.maxSafeSkips - stats.plannedFutureSkips),
        status: c.strict_no_skip ? (safety.currentPercent >= c.attendance_threshold ? "green" : "red") : safety.status,
      }
    }),
  )

  const generatedAt = new Date().toLocaleString()
  const dateStamp = new Date().toISOString().slice(0, 10)

  const lines = [
    `AttendWise — Attendance report`,
    `${semesterLabel} · generated ${generatedAt}`,
    ``,
    ...rows.map((r) => {
      const label = [r.name, r.code].filter(Boolean).join(" ")
      return `• ${label}: ${r.percent.toFixed(0)}% (${r.attended} present, ${r.absent} absent; ${r.threshold}% required, ${r.skipsLeft} safe skip${r.skipsLeft === 1 ? "" : "s"} left)`
    }),
  ]
  const text = lines.join("\n")

  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const header = "Course,Code,Attendance %,Present,Absent,Remaining,Required %,Safe skips left"
  const csvRows = rows.map((r) =>
    [r.name, r.code ?? "", r.percent.toFixed(1), r.attended, r.absent, r.remaining, r.threshold, r.skipsLeft]
      .map((v) => esc(String(v)))
      .join(","),
  )
  const csv = [header, ...csvRows].join("\n")

  return { rows, text, csv, filename: `attendwise-${dateStamp}.csv`, generatedAt }
}

/** Shares via the native/OS share sheet if available, else copies to clipboard. Returns which happened. */
export async function shareOrCopy(title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title, text })
      return "shared"
    } catch (err) {
      // AbortError = user dismissed the sheet; treat as a no-op, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return "failed"
      // fall through to clipboard on any other share error
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return "copied"
  } catch {
    return "failed"
  }
}

/** Triggers a CSV file download in the browser/WebView. */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
