import { useMemo, useState } from 'react'
import { dayFmt, hasEnded, hasStarted, isNeutral, longDay, type ClassOccurrence } from '../../domain'
import { useStore } from '../../data/store'
import { ClassCard, DayBanner, MarkDialog, Panel, Segmented } from '../common'
import { Icon } from '../Icon'
import { MonthGrid, monthOf, monthTitle, shiftMonth } from './MonthGrid'
import { WeekGrid } from './WeekGrid'

const VIEW = 'attendwise.calview'
type View = 'week' | 'month'

export function Calendar() {
  const [view, setViewState] = useState<View>(() => {
    try { return localStorage.getItem(VIEW) === 'month' ? 'month' : 'week' } catch { return 'week' }
  })
  const setView = (v: View) => {
    setViewState(v)
    try { localStorage.setItem(VIEW, v) } catch { /* private window */ }
  }
  return (
    <div className={view === 'week' ? 'page wide' : 'page'}>
      <Segmented value={view} options={[['week', 'Week'], ['month', 'Month']]} onChange={setView} />
      {view === 'week' ? <WeekGrid /> : <MonthView />}
    </div>
  )
}

function MonthView() {
  const s = useStore()
  const d = s.derived
  const [month, setMonth] = useState(monthOf(d.now.date))
  const [selected, setSelected] = useState(d.now.date)
  const [editing, setEditing] = useState<ClassOccurrence | null>(null)
  const byDate = useMemo(() => {
    const m = new Map<string, ClassOccurrence[]>()
    for (const o of d.schedule.occurrences) m.set(o.key.date, [...(m.get(o.key.date) ?? []), o])
    return m
  }, [d])
  const dayClasses = byDate.get(selected) ?? []
  const thisYear = d.now.date.slice(0, 4)

  return (
    <>
      <div className="row" style={{ padding: '0 4px' }}>
        <h1 className="h1 grow">{monthTitle(month, month.slice(0, 4) !== thisYear)}</h1>
        <button className="icon-btn" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="back" size={20} /></button>
        <button className="icon-btn" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron_right" size={20} /></button>
      </div>
      <Panel>
        <MonthGrid
          month={month}
          cell={(date) => {
            const info = d.dayInfo(date)
            const classes = byDate.get(date) ?? []
            const started = classes.filter((o) => hasStarted(o, d.now))
            const missed = started.some((o) => o.mark?.status === 'absent')
            const allPresent = started.length > 0 && started.every((o) => o.mark?.status === 'present' || isNeutral(o.mark?.status))
            const planned = classes.some((o) => d.isPlannedSkip(o))
            const unmarked = classes.some((o) => o.mark == null && hasEnded(o, d.now))
            const cls = ['day', date === selected ? 'sel' : info.kind === 'none' ? 'noclass' : '', date === d.now.date ? 'today' : '', classes.length === 0 ? 'dim' : ''].join(' ')
            return (
              <button type="button" className={cls} aria-label={dayFmt(date)} aria-pressed={date === selected} onClick={() => setSelected(date)}>
                <span>{Number(date.slice(8))}</span>
                <span className="dots">
                  {missed ? <i className="d" style={{ background: 'var(--risk)' }} /> : allPresent ? <i className="d" style={{ background: 'var(--present)' }} /> : unmarked ? <i className="d" style={{ background: 'var(--tight)' }} /> : null}
                  {planned && <i className="d ring" />}
                  {info.kind === 'swapped' && <b style={{ fontSize: 9, color: 'var(--swap)' }}>⇄</b>}
                </span>
              </button>
            )
          }}
        />
      </Panel>
      <div className="legend">
        <span><i className="d" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--present)' }} />All present</span>
        <span><i className="d" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--risk)' }} />Missed one</span>
        <span><i className="d" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--tight)' }} />Unmarked</span>
        <span><i className="d" style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--risk)' }} />Planned skip</span>
        <span><i style={{ width: 12, height: 8, borderRadius: 3, background: 'var(--swap-bg)' }} />No classes</span>
        <span><b style={{ color: 'var(--swap)' }}>⇄</b>Day swap</span>
      </div>
      <DayBanner info={d.dayInfo(selected)} />
      <h2 className="title" style={{ padding: '0 4px' }}>{(selected === d.now.date ? 'Today, ' : '') + longDay(selected).replace(',', '')}</h2>
      {dayClasses.length === 0 && <div className="muted" style={{ padding: '0 4px' }}>No classes.</div>}
      {dayClasses.map((o) => <ClassCard key={o.key.courseId + o.key.start} occ={o} derived={d} onMark={(st) => s.mark(o.key, o.end, st)} onMore={() => setEditing(o)} />)}
      {editing && (
        <MarkDialog title={`${d.code(editing.key.courseId)}, ${dayFmt(editing.key.date)} at ${editing.key.start}`} current={editing.mark?.status} onPick={(st) => { s.mark(editing.key, editing.end, st); setEditing(null) }} onClose={() => setEditing(null)} />
      )}
    </>
  )
}
