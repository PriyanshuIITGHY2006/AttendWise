import { useState } from 'react'
import { useStore } from '../../data/store'
import { Dot, Panel, Ring, ringColor, StatusText } from '../common'
import { Icon } from '../Icon'

export function Courses({ go }: { go: (route: string) => void }) {
  const { derived: d } = useStore()
  const [showArchived, setShowArchived] = useState(false)
  const active = d.data.courses.filter((c) => !c.archived)
  const archived = d.data.courses.filter((c) => c.archived)
  const risk = [...d.stats.values()].filter((s) => s.status === 'at_risk').length
  const tight = [...d.stats.values()].filter((s) => s.status === 'tight').length

  let summary: { text: string; tone: string } | null = null
  if (active.length > 0) {
    summary = risk > 0 ? { text: `${risk} course${risk === 1 ? ' needs' : 's need'} attention`, tone: 'var(--risk)' }
      : tight > 0 ? { text: `${tight} course${tight === 1 ? ' has' : 's have'} no skips left`, tone: 'var(--tight)' }
      : { text: 'All courses are safe', tone: 'var(--safe)' }
  }

  return (
    <div className="page">
      <div className="row" style={{ padding: '0 4px' }}>
        <div className="grow">
          <div className="caption">{active.length} course{active.length === 1 ? '' : 's'} in {d.data.semester?.name ?? 'this semester'}</div>
          <h1 className="h1">Courses</h1>
        </div>
        <button className="icon-btn filled" aria-label="Add course" onClick={() => go('edit/new')}><Icon name="add" /></button>
      </div>
      {summary && <div style={{ padding: '0 4px', fontWeight: 600, color: summary.tone }}>{summary.text}</div>}
      {active.length === 0 && <div className="info panel"><b className="title">No courses yet</b><span className="muted">Click + to add a course and its timetable.</span></div>}
      {active.map((c) => {
        const s = d.stats.get(c.id)
        return (
          <Panel key={c.id} onClick={() => go(`course/${c.id}`)}>
            <div className="course-card">
              <Ring percent={s?.currentPercent ?? null} color={ringColor(s?.status)} size={60} stroke={6}>
                <b className="num" style={{ fontSize: 15 }}>{s?.currentPercentFloor != null ? `${s.currentPercentFloor}%` : '—'}</b>
              </Ring>
              <div className="grow">
                <div className="code"><Dot color={c.color} />{c.code}</div>
                <div className="name">{c.name}</div>
                {s && <StatusText s={s} />}
              </div>
              <span className="muted"><Icon name="chevron_right" size={20} /></span>
            </div>
          </Panel>
        )
      })}
      {archived.length > 0 && (
        <>
          <div><button className="link" onClick={() => setShowArchived(!showArchived)}>{showArchived ? `Hide archived (${archived.length})` : `Show archived (${archived.length})`}</button></div>
          {showArchived && archived.map((c) => (
            <Panel key={c.id} onClick={() => go(`course/${c.id}`)}>
              <div className="row pad"><Dot color={c.color} /><span className="muted">{c.code}  {c.name}</span></div>
            </Panel>
          ))}
        </>
      )}
    </div>
  )
}
