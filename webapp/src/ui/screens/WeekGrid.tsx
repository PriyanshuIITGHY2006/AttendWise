import { useEffect, useMemo, useState } from 'react'
import {
  addDays, dayFmt, hasEnded, hasStarted, hourRange, isNeutral, layoutDay, mondayOf, toMinutes, weekdayOf, weekDates, weekLabel, WEEKDAY_LONG, WEEKDAY_SHORT,
  type ClassOccurrence, type DayInfo,
} from '../../domain'
import { useStore } from '../../data/store'
import { MarkDialog } from '../common'
import { Icon } from '../Icon'

const HOUR_PX = 56
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

const noClassTitle = (info: Extract<DayInfo, { kind: 'none' }>): string =>
  ({ holiday: 'Holiday', exam: 'Exam day', mid_sem_break: 'Mid-semester exams', end_sem_break: 'End-semester exams', reschedule: 'No classes' }[info.type])

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`

function statusText(o: ClassOccurrence, planned: boolean): string {
  const s = o.mark?.status
  if (s === 'present') return 'Present'
  if (s === 'absent') return planned ? 'Planned skip' : 'Absent'
  if (s === 'cancelled') return 'Cancelled'
  if (s === 'on_duty') return 'On duty'
  return 'Not marked'
}

/** The weekly timetable: one column per day, hours down the side, each class at its real time. */
export function WeekGrid() {
  const s = useStore()
  const d = s.derived
  const [monday, setMonday] = useState(mondayOf(d.now.date))
  const [editing, setEditing] = useState<ClassOccurrence | null>(null)

  const byDate = useMemo(() => {
    const m = new Map<string, ClassOccurrence[]>()
    for (const o of d.schedule.occurrences) m.set(o.key.date, [...(m.get(o.key.date) ?? []), o])
    return m
  }, [d])
  const days = weekDates(monday, (date) => (byDate.get(date) ?? []).length > 0)
  const weekClasses = days.flatMap((date) => byDate.get(date) ?? [])
  const { from, to } = hourRange(weekClasses)
  const hours = Array.from({ length: to - from }, (_, i) => from + i)
  const height = (to - from) * HOUR_PX
  const isThisWeek = monday === mondayOf(d.now.date)

  // The "now" line moves with the clock, so keep it fresh.
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(id) }, [])

  const nowMinutes = toMinutes(d.now.time)
  const showNow = nowMinutes >= from * 60 && nowMinutes <= to * 60

  return (
    <>
      <div className="row" style={{ padding: '0 4px' }}>
        <h1 className="h1 grow">{weekLabel(days)}</h1>
        {!isThisWeek && <button className="link" onClick={() => setMonday(mondayOf(d.now.date))}>Today</button>}
        <button className="icon-btn" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}><Icon name="back" size={20} /></button>
        <button className="icon-btn" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}><Icon name="chevron_right" size={20} /></button>
      </div>

      <div className="wk-scroll">
        <div className="wk" style={{ ['--cols' as string]: days.length }}>
          <div className="wk-gutter">
            <div className="wk-gh" />
            <div className="wk-gbody" style={{ height }}>
              {hours.map((h) => <span key={h} style={{ top: (h - from) * HOUR_PX }}>{hourLabel(h)}</span>)}
            </div>
          </div>

          {days.map((date) => {
            const info = d.dayInfo(date)
            const today = date === d.now.date
            const placed = layoutDay(byDate.get(date) ?? [])
            return (
              <section key={date} className={`wk-lane${today ? ' today' : ''}`} aria-label={dayFmt(date)}>
                <header className="wk-gh">
                  <span className="wk-dow">{WEEKDAY_SHORT[weekdayOf(date) - 1]}</span>
                  <span className="wk-date">{Number(date.slice(8))}</span>
                  {info.kind === 'swapped' && <span className="wk-swap" title={`Follows the ${WEEKDAY_LONG[info.follows - 1]} timetable`}>{'↻ ' + WEEKDAY_SHORT[info.follows - 1]}</span>}
                </header>
                <div className="wk-body" style={{ height }}>
                  {hours.map((h) => <i key={h} className="wk-line" style={{ top: (h - from) * HOUR_PX }} />)}
                  {info.kind === 'none' && (
                    <div className="wk-off"><Icon name="swap" size={22} /><b>{noClassTitle(info)}</b>{info.description && <span>{info.description}</span>}</div>
                  )}
                  {placed.map(({ occ, lane, lanes }) => {
                    const start = toMinutes(occ.key.start)
                    const end = toMinutes(occ.end)
                    const color = d.color(occ.key.courseId)
                    const status = occ.mark?.status
                    const off = status === 'cancelled' || status === 'on_duty'
                    const planned = d.isPlannedSkip(occ)
                    const px = ((end - start) / 60) * HOUR_PX - 4
                    const name = d.course(occ.key.courseId)?.name ?? d.code(occ.key.courseId)
                    const label = `${name}, ${occ.key.start} to ${occ.end}${occ.room ? `, ${occ.room}` : ''}, ${statusText(occ, planned)}`
                    const badge = hasStarted(occ, d.now)
                      ? status === 'present' ? 'ok' : status === 'absent' ? 'no' : !status && hasEnded(occ, d.now) ? 'un' : null
                      : null
                    return (
                      <button
                        key={occ.key.courseId + occ.key.start}
                        type="button"
                        className={`wk-block${off ? ' off' : ''}${planned ? ' planned' : ''}${status === 'cancelled' ? ' cancelled' : ''}${px < 40 ? ' tiny' : ''}`}
                        title={label}
                        aria-label={label}
                        style={{
                          top: ((start - from * 60) / 60) * HOUR_PX + 2,
                          height: Math.max(px, 24),
                          left: `calc(${(lane / lanes) * 100}% + 6px)`,
                          width: `calc(${100 / lanes}% - 12px)`,
                          ['--c' as string]: color,
                        }}
                        onClick={() => setEditing(occ)}
                      >
                        <span className="wk-top">
                          <i className="wk-sq" />
                          <b className="wk-code">{d.code(occ.key.courseId)}</b>
                          {badge === 'ok' && <span className="wk-st ok"><Icon name="check" size={14} /></span>}
                          {badge === 'no' && <span className="wk-st no"><Icon name="close" size={14} /></span>}
                          {badge === 'un' && <span className="wk-st un">?</span>}
                          {planned && <span className="wk-skip">Skip</span>}
                        </span>
                        {px >= 44 && <span className="wk-name">{name}</span>}
                        {px >= 74 && <span className="wk-time">{occ.key.start} to {occ.end}</span>}
                        {px >= 96 && <span className="wk-kind">{[cap(occ.kind), occ.room].filter(Boolean).join(', ')}</span>}
                      </button>
                    )
                  })}
                  {today && showNow && <div className="wk-now" style={{ top: ((nowMinutes - from * 60) / 60) * HOUR_PX }} />}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {editing && (
        <MarkDialog
          title={d.course(editing.key.courseId)?.name ?? d.code(editing.key.courseId)}
          current={editing.mark?.status}
          details={
            <div className="wk-detail">
              <div><b>{d.code(editing.key.courseId)}</b> <span className="muted">{cap(editing.kind)}</span></div>
              <div>{dayFmt(editing.key.date)}, {editing.key.start} to {editing.end}</div>
              {editing.room && <div className="muted">{editing.room}</div>}
              <div className="small" style={{ color: isNeutral(editing.mark?.status) ? 'var(--muted)' : undefined }}>{statusText(editing, d.isPlannedSkip(editing))}</div>
            </div>
          }
          onPick={(st) => { s.mark(editing.key, editing.end, st); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
