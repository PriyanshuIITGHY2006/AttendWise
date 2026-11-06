import { useState } from 'react'
import { dayPeriodOf, firstNameOf, greeting, longDay, dayFmt, type ClassOccurrence } from '../../domain'
import { useStore } from '../../data/store'
import { ClassCard, DayBanner, MarkDialog, SectionHeader } from '../common'
import { Icon } from '../Icon'
import { SCENE_SVG } from '../scene'

export function TodayHeader() {
  const { derived: d, session } = useStore()
  const period = dayPeriodOf(d.now.time)
  const name = firstNameOf(d.data.profile?.full_name ?? (session?.user.user_metadata?.full_name as string | undefined) ?? (session?.user.user_metadata?.name as string | undefined))
  const marked = d.today.filter((o) => o.mark).length
  return (
    <div className="today-head" data-period={period}>
      <svg className="scene" viewBox="0 0 230 170" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SCENE_SVG.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') }} />
      <div className="hello">
        <div className="caption">{d.today.length === 0 ? 'No classes' : `${marked} of ${d.today.length} marked`}</div>
        <h1 className="h1">{greeting(period, name)}</h1>
        <div className="muted">{longDay(d.now.date)}</div>
      </div>
    </div>
  )
}

export function Today({ go }: { go: (route: string) => void }) {
  const s = useStore()
  const d = s.derived
  const [editing, setEditing] = useState<ClassOccurrence | null>(null)
  const sem = d.data.semester
  const pending = d.unmarkedPast.filter((o) => o.key.date !== d.now.date)

  return (
    <div className="page">
      <TodayHeader />
      {sem && d.now.date < sem.start && <div className="info panel"><b className="title">{`${sem.name} starts ${dayFmt(sem.start)}`}</b><span className="muted">Your classes will appear here from then.</span></div>}
      {sem && d.now.date > sem.end && <div className="info panel"><b className="title">{`${sem.name} is over`}</b><span className="muted">Start your next semester from Profile.</span></div>}
      <DayBanner info={d.todayInfo} />
      {d.inSemester && (
        <button type="button" className="bunk" onClick={() => go('plan?today=1')}>
          <span className="icon-box"><Icon name="plan" /></span>
          <span><b>CAN I BUNK TODAY?</b><span>{d.verdictLine()}</span></span>
        </button>
      )}
      {d.today.length > 0 && (
        <>
          <SectionHeader title="Classes"><span className="small">Click a class for more options</span></SectionHeader>
          {d.today.map((o) => (
            <ClassCard key={`${o.key.courseId}${o.key.start}`} occ={o} derived={d} onMark={(st) => s.mark(o.key, o.end, st)} onMore={() => setEditing(o)} />
          ))}
        </>
      )}
      {pending.length > 0 && (
        <>
          <SectionHeader title={`Unmarked from earlier (${pending.length})`}>
            <button className="link" onClick={() => s.markAll(pending.map((o) => ({ key: o.key, end: o.end })), 'present')}>Mark all present</button>
          </SectionHeader>
          {pending.slice(0, 15).map((o) => (
            <ClassCard key={`${o.key.courseId}${o.key.date}${o.key.start}`} occ={o} derived={d} showDate onMark={(st) => s.mark(o.key, o.end, st)} onMore={() => setEditing(o)} />
          ))}
          {pending.length > 15 && <div className="small" style={{ color: 'var(--tight)', padding: '0 4px' }}>…and {pending.length - 15} more. Mark them from Calendar.</div>}
        </>
      )}
      {editing && (
        <MarkDialog
          title={`${d.code(editing.key.courseId)}, ${dayFmt(editing.key.date)} at ${editing.key.start}`}
          current={editing.mark?.status}
          onPick={(st) => { s.mark(editing.key, editing.end, st); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

