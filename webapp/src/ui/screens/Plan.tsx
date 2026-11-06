import { useEffect, useMemo, useState } from 'react'
import { dayFmt, Planner, type ClassOccurrence, type SkipVerdict } from '../../domain'
import { useStore } from '../../data/store'
import { Chip, Dialog, Dot, Panel } from '../common'
import { Icon } from '../Icon'
import { MonthGrid, monthOf, monthTitle, shiftMonth } from './MonthGrid'

const VERDICT: Record<SkipVerdict, { label: (budget: number) => string; tone: 'safe' | 'tight' | 'risk' | 'neutral' }> = {
  safe: { label: () => 'Safe', tone: 'safe' },
  risky: { label: () => 'Risky', tone: 'tight' },
  partial: { label: (b) => `Only ${b}`, tone: 'tight' },
  must_attend: { label: () => 'Go', tone: 'risk' },
  locked: { label: () => 'Locked', tone: 'neutral' },
  nothing_to_skip: { label: () => '—', tone: 'neutral' },
}

export function Plan({ preselectToday }: { preselectToday: boolean }) {
  const s = useStore()
  const d = s.derived
  const today = d.now.date
  const [month, setMonth] = useState(monthOf(today))
  const [dates, setDates] = useState<Set<string>>(new Set(preselectToday ? [today] : []))
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [showPlans, setShowPlans] = useState(false)

  const proposal = useMemo(() => Planner.propose(d.data.courses, d.schedule, dates, d.now), [d, dates])
  useEffect(() => { setSelection(new Set(proposal.defaultSelection)) }, [dates]) // eslint-disable-line react-hooks/exhaustive-deps
  const outcome = useMemo(() => Planner.evaluate(d.data.courses, d.schedule, selection, d.now), [d, selection])
  const withinBudget = outcome.violations.size === 0
  const classDays = useMemo(() => new Set(d.schedule.occurrences.map((o) => o.key.date)), [d])

  const plans = new Map<string, typeof d.data.marks>()
  for (const m of d.data.marks) if (m.planId && m.key.date >= today) plans.set(m.planId, [...(plans.get(m.planId) ?? []), m])

  const overall = {
    all_skippable: ['All clear', 'Every class on those days can be skipped.', 'safe'],
    partly: ['Mostly doable', 'Some classes need you. Ticked ones are safe to skip.', 'tight'],
    none_skippable: ['Not those days', 'None of those classes can be skipped safely.', 'risk'],
    nothing_to_skip: ['No classes', 'Nothing to skip on those days.', 'neutral'],
  }[proposal.overall]

  const keysOf = (cands: ClassOccurrence[]) => cands.map((o) => `${o.key.courseId}|${o.key.date}|${o.key.start}`)
  const strictHit = [...outcome.violations].some((id) => d.course(id)?.strictNoSkip)

  return (
    <div className="page">
      <div className="row" style={{ padding: '0 4px' }}>
        <div className="grow">
          <div className="caption">Pick days you want off</div>
          <h1 className="h1">Plan</h1>
        </div>
        <button className="link" onClick={() => setShowPlans(true)}>My plans ({plans.size})</button>
      </div>
      <Panel>
        <div style={{ padding: 12 }}>
          <div className="row">
            <button className="icon-btn" aria-label="Previous month" disabled={month <= monthOf(today)} onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="back" size={18} /></button>
            <b className="grow">{monthTitle(month, true)}</b>
            <span className="small">{dates.size === 0 ? 'Click days' : `${dates.size} day${dates.size === 1 ? '' : 's'}`}</span>
            <button className="icon-btn" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron_right" size={18} /></button>
          </div>
          <MonthGrid
            month={month}
            cell={(date) => {
              const picked = dates.has(date)
              const past = date < today
              const info = d.dayInfo(date)
              const cls = ['day', 'small-h', picked ? 'picked' : info.kind === 'none' ? 'noclass' : '', date === today ? 'today' : '', past ? 'past' : !classDays.has(date) ? 'dim' : ''].join(' ')
              return (
                <button type="button" className={cls} disabled={past} aria-pressed={picked} aria-label={dayFmt(date)} onClick={() => setDates((cur) => { const n = new Set(cur); picked ? n.delete(date) : n.add(date); return n })}>
                  {Number(date.slice(8))}
                </button>
              )
            }}
          />
        </div>
      </Panel>
      {dates.size > 0 && (
        <>
          <div style={{ padding: 14, borderRadius: 16, background: `var(--${overall[2]}-bg)`, color: `var(--${overall[2]})` }}>
            <b>{overall[0]}</b>
            <div style={{ fontSize: 12 }}>{overall[1]}</div>
          </div>
          {proposal.lines.map((line) => {
            const keys = keysOf(line.candidates)
            const checked = keys.length > 0 && keys.every((k) => selection.has(k))
            const locked = line.verdict === 'locked'
            const after = outcome.after.get(line.course.id)
            const v = VERDICT[line.verdict]
            let sub: string
            if (locked) sub = 'Never-skip course'
            else if (checked && after && after.overBudget > 0) sub = `Over budget by ${after.overBudget}`
            else if (checked && after) sub = `${after.safeSkipsLeft} safe skips left after, ending at ${Math.trunc(after.projectedIfPlanFollowed ?? 0)}%`
            else if (line.verdict === 'risky') sub = `Allowed, but you're below ${line.course.thresholdPercent}% now`
            else if (line.verdict === 'must_attend') sub = 'No skips left' + (line.before.counts.plannedSkips > 0 ? `, ${line.before.counts.plannedSkips} already planned` : '')
            else sub = `${line.budget} safe skips available`
            return (
              <Panel key={line.course.id}>
                <label className="row" style={{ padding: '10px 14px', cursor: locked ? 'default' : 'pointer' }}>
                  <input type="checkbox" className="check" checked={checked} disabled={locked}
                    onChange={(e) => setSelection((cur) => { const n = new Set(cur); keys.forEach((k) => (e.target.checked ? n.add(k) : n.delete(k))); return n })} />
                  <div className="grow">
                    <div className="row" style={{ gap: 6 }}>
                      <Dot color={d.color(line.course.id)} /><b>{line.course.code}</b>
                      <span className="small">{line.candidates.length} class{line.candidates.length === 1 ? '' : 'es'}</span>
                    </div>
                    <div className="small">{sub}</div>
                  </div>
                  <Chip text={v.label(line.budget)} tone={v.tone} />
                </label>
              </Panel>
            )
          })}
          {proposal.lines.length > 0 && (
            <button className="btn block" style={{ minHeight: 52 }} disabled={selection.size === 0 || strictHit}
              onClick={() => { s.applyPlan(selection, !withinBudget); setDates(new Set()) }}>
              {!withinBudget ? `Plan ${selection.size} skips anyway` : `Plan ${selection.size} skip${selection.size === 1 ? '' : 's'}`}
            </button>
          )}
        </>
      )}
      {showPlans && (
        <Dialog title="My plans" onClose={() => setShowPlans(false)} actions={<button className="link" onClick={() => setShowPlans(false)}>Close</button>}>
          {plans.size === 0 && <p className="muted">No upcoming plans.</p>}
          {[...plans.entries()].map(([planId, marks]) => {
            const dts = marks.map((m) => m.key.date).sort()
            const first = dts[0]
            const last = dts[dts.length - 1]
            return (
              <div className="row" key={planId}>
                <div className="grow">
                  <b>{first === last ? dayFmt(first) : `${dayFmt(first)} – ${dayFmt(last)}`}</b>
                  <div className="small">{[...new Set(marks.map((m) => d.code(m.key.courseId)))].join(', ')}: {marks.length} skip{marks.length === 1 ? '' : 's'}</div>
                </div>
                <button className="link" onClick={() => s.undoPlan(planId)}>Remove</button>
              </div>
            )
          })}
        </Dialog>
      )}
    </div>
  )
}
