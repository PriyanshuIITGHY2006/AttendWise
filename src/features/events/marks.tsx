import { useState, type FormEvent } from "react"
import { Button } from "../../components/ui/Button"
import { Badge } from "../../components/ui/Badge"
import type { CourseEvent } from "./api"

// A scored assessment has both a score and a positive max. Weightage is optional
// -- when set, per-course averages weight by it, otherwise every assessment
// counts equally. Deliberately GPA-free: plain percentages only.
export function isScored(e: CourseEvent): e is CourseEvent & { score: number; max_score: number } {
  return e.score != null && e.max_score != null && e.max_score > 0
}

export function pct(score: number, max: number): number {
  return Math.round((score / max) * 1000) / 10
}

export function scoreTone(percent: number): "green" | "yellow" | "red" {
  if (percent >= 75) return "green"
  if (percent >= 40) return "yellow"
  return "red"
}

export type CoursePerformance = {
  average: number
  count: number
}

// Weighted average percentage across a course's scored assessments.
export function coursePerformance(events: CourseEvent[]): CoursePerformance {
  let weighted = 0
  let weight = 0
  let count = 0
  for (const e of events) {
    if (!isScored(e)) continue
    const w = e.weightage && e.weightage > 0 ? e.weightage : 1
    weighted += (e.score / e.max_score) * 100 * w
    weight += w
    count += 1
  }
  return { average: weight > 0 ? weighted / weight : 0, count }
}

// The inline marks affordance for one assessment: a coloured score chip once
// marks exist, or a dashed "+ Marks" prompt otherwise. Clicking toggles editing.
export function MarksChip({ event, onClick }: { event: CourseEvent; onClick: () => void }) {
  if (isScored(event)) {
    const percent = pct(event.score, event.max_score)
    return (
      <button onClick={onClick} className="transition-transform active:scale-95" aria-label="Edit marks">
        <Badge tone={scoreTone(percent)}>
          {event.score}/{event.max_score} · {percent}%
        </Badge>
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700 active:scale-95 dark:border-neutral-600 dark:hover:text-neutral-300"
    >
      + Marks
    </button>
  )
}

// Inline marks entry: score / out-of. Clearing both removes the marks. Kept
// self-contained so any list of assessments can drop it in.
export function ScoreEditor({
  event,
  onCancel,
  onSave,
}: {
  event: CourseEvent
  onCancel: () => void
  onSave: (score: number | null, max: number | null) => void
}) {
  const [score, setScore] = useState(event.score != null ? String(event.score) : "")
  const [max, setMax] = useState(event.max_score != null ? String(event.max_score) : "")

  function submit(e: FormEvent) {
    e.preventDefault()
    const s = score.trim() === "" ? null : Number(score)
    const m = max.trim() === "" ? null : Number(max)
    onSave(Number.isFinite(s as number) ? s : null, Number.isFinite(m as number) ? m : null)
  }

  const inputClass = "w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"

  return (
    <form onSubmit={submit} className="mt-3 flex items-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <div className="flex-1">
        <label className="mb-1 block text-xs font-medium text-neutral-500">Score</label>
        <input type="number" inputMode="decimal" step="any" min="0" value={score} onChange={(e) => setScore(e.target.value)} placeholder="18" className={inputClass} autoFocus />
      </div>
      <span className="pb-2 text-neutral-400">/</span>
      <div className="flex-1">
        <label className="mb-1 block text-xs font-medium text-neutral-500">Out of</label>
        <input type="number" inputMode="decimal" step="any" min="0" value={max} onChange={(e) => setMax(e.target.value)} placeholder="20" className={inputClass} />
      </div>
      <Button type="submit" className="shrink-0">Save</Button>
      <button type="button" onClick={onCancel} className="shrink-0 rounded-lg px-2 py-2 text-sm text-neutral-500 transition-colors hover:text-neutral-700 dark:hover:text-neutral-300">
        Cancel
      </button>
    </form>
  )
}
