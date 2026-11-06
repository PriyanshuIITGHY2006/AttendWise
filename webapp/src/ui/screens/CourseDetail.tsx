import { useState } from 'react'
import { addMinutes, dayFmt, hasEnded, hasStarted, matchingSlots, WEEKDAY_LONG, WEEKDAY_SHORT, type ClassOccurrence } from '../../domain'
import { newId, useStore } from '../../data/store'
import type { ExtraRow } from '../../data/rows'
import { Dialog, MarkChip, MarkDialog, Panel, Ring, ringColor, SectionHeader, StatusChip } from '../common'
import { Icon } from '../Icon'

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function ProjectionBar({ now, projected, threshold, nowColor }: { now: number; projected: number; threshold: number; nowColor: string }) {
  const a = Math.min(100, Math.max(0, now))
  const b = Math.min(100, Math.max(a, projected))
  return (
    <div className="bar" aria-hidden>
      <div style={{ width: `${a}%`, background: nowColor }} />
      <div style={{ width: `${b - a}%`, background: 'var(--present)', opacity: 0.45 }} />
      <div className="tick" style={{ left: `${threshold}%` }} />
    </div>
  )
}

export function CourseDetail({ courseId, go }: { courseId: string; go: (route: string) => void }) {
  const s = useStore()
  const d = s.derived
  const course = d.course(courseId)
  const [editing, setEditing] = useState<ClassOccurrence | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [addingExtra, setAddingExtra] = useState(false)
  if (!course) {
    return (
      <div className="page">
        <button className="link" onClick={() => go('courses')}>Back to courses</button>
        <p className="muted">This course is no longer here.</p>
      </div>
    )
  }

  const st = d.stats.get(courseId)
  const today = d.now.date
  const slots = d.data.slots
    .filter((x) => x.courseId === courseId && (x.validTo == null || x.validTo >= today))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || (a.start < b.start ? -1 : 1))
  const slotLabel = matchingSlots(slots.map((x) => ({ day: x.dayOfWeek, start: x.start, end: x.end }))).join(' and ')
  const all = d.forCourse(courseId)
  const past = all
    .filter((o) => hasStarted(o, d.now))
    .sort((a, b) => (a.key.date === b.key.date ? (a.key.start < b.key.start ? 1 : -1) : a.key.date < b.key.date ? 1 : -1))
  const upcomingSkips = all.filter((o) => d.isPlannedSkip(o))

  return (
    <div className="page">
      <div className="row">
        <button className="icon-btn" aria-label="Back" onClick={() => go('courses')}><Icon name="back" size={24} /></button>
        <h1 className="title grow">{course.code}</h1>
        <button className="icon-btn" aria-label="Edit course" onClick={() => go(`edit/${courseId}`)}><Icon name="edit" size={22} /></button>
      </div>
      <Panel>
        <div className="row pad" style={{ gap: 18 }}>
          <Ring percent={st?.currentPercent ?? null} color={ringColor(st?.status)} size={128} stroke={12} thresholdPercent={course.thresholdPercent}>
            <div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{st?.currentPercentFloor != null ? `${st.currentPercentFloor}%` : '—'}</div>
            <div className="small">need {course.thresholdPercent}%</div>
          </Ring>
          <div className="grow" style={{ display: 'grid', gap: 6 }}>
            <div className="row" style={{ gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: course.color }} />
              <span className="caption">{slots.length} class{slots.length === 1 ? '' : 'es'} a week</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{course.name}</div>
            {slotLabel && <div className="caption">Slot {slotLabel}</div>}
            {st && <div><StatusChip s={st} /></div>}
          </div>
        </div>
      </Panel>
      {st?.belowThreshold && (
        <div style={{ padding: 16, borderRadius: 20, background: 'var(--risk-bg)', color: 'var(--risk)', display: 'grid', gap: 4 }}>
          {st.recoveryClasses != null && st.canReachThreshold ? (
            <>
              <b>Attend the next {st.recoveryClasses} classes in a row</b>
              <span style={{ fontSize: 13 }}>
                That gets you back to {course.thresholdPercent}%.
                {st.maxSafeSkips > 0 ? ` After that, ${st.maxSafeSkips} safe skip${st.maxSafeSkips === 1 ? '' : 's'} open up.` : ''}
              </span>
            </>
          ) : (
            <>
              <b>Can't reach {course.thresholdPercent}% this semester</b>
              <span style={{ fontSize: 13 }}>Even attending every remaining class ends below the requirement. Talk to your instructor.</span>
            </>
          )}
        </div>
      )}
      {st && (
        <>
          <Panel className="stat-rows">
            {([['Attended', st.counts.attended], ['Missed', st.counts.missed], ['Classes left', st.counts.remaining], ['Planned skips', st.counts.plannedSkips]] as const).map(([k, v]) => (
              <div key={k}><span>{k}</span><b className="num">{v}</b></div>
            ))}
          </Panel>
          <Panel>
            <div className="pad" style={{ display: 'grid', gap: 10 }}>
              <div className="row">
                <h2 className="title grow">End of semester</h2>
                {d.data.semester && <span className="caption">ends {dayFmt(d.data.semester.end)}</span>}
              </div>
              <ProjectionBar now={st.currentPercent ?? 0} projected={st.projectedIfAttendAll ?? 0} threshold={course.thresholdPercent} nowColor={ringColor(st.status)} />
              <div className="muted" style={{ fontSize: 13 }}>
                If you attend all {st.counts.remaining} left you end at {Math.trunc(st.projectedIfAttendAll ?? 0)}%.
                {st.counts.plannedSkips > 0 && <><br />With your planned skips you end at {Math.trunc(st.projectedIfPlanFollowed ?? 0)}%.</>}
              </div>
              {st.counts.unmarkedPast > 0 && (
                <div className="small" style={{ color: 'var(--tight)' }}>
                  {st.counts.unmarkedPast} past class{st.counts.unmarkedPast === 1 ? ' is' : 'es are'} unmarked and counted as attendable.
                </div>
              )}
            </div>
          </Panel>
        </>
      )}
      <SectionHeader title="Timetable"><button className="link" onClick={() => go(`edit/${courseId}`)}>Edit</button></SectionHeader>
      <Panel>
        {slots.length === 0 && <div className="pad muted">No class times yet.</div>}
        {slots.map((x) => (
          <div className="slot-row" key={x.id}>
            <b>{WEEKDAY_SHORT[x.dayOfWeek - 1]}</b>
            <span className="grow num">{x.start} – {x.end}</span>
            <span className="muted">{[cap(x.kind), x.room].filter(Boolean).join(', ')}</span>
          </div>
        ))}
      </Panel>
      <button className="btn outline block" onClick={() => setAddingExtra(true)}>Add an extra class</button>
      {upcomingSkips.length > 0 && (
        <>
          <SectionHeader title={`Planned skips (${upcomingSkips.length})`} />
          {upcomingSkips.map((o) => <HistoryRow key={o.key.date + o.key.start} occ={o} onClick={() => setEditing(o)} />)}
        </>
      )}
      <SectionHeader title="History"><span className="small">Click a class to change it</span></SectionHeader>
      {past.length === 0 && <div className="muted" style={{ padding: '0 4px' }}>Nothing yet.</div>}
      {past.slice(0, 200).map((o) => <HistoryRow key={o.key.date + o.key.start} occ={o} onClick={() => setEditing(o)} />)}
      <div className="row" style={{ paddingTop: 8 }}>
        <button className="btn outline grow" onClick={() => s.setArchived(courseId, !course.archived)}>{course.archived ? 'Restore' : 'Archive'}</button>
        <button className="btn outline danger grow" onClick={() => setConfirmDelete(true)}>Delete</button>
      </div>

      {editing && (
        <MarkDialog
          title={`${course.code}, ${dayFmt(editing.key.date)} at ${editing.key.start}`}
          current={editing.mark?.status}
          onPick={(m) => { s.mark(editing.key, editing.end, m); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}
      {confirmDelete && (
        <Dialog
          title={`Delete ${course.code}?`}
          onClose={() => setConfirmDelete(false)}
          actions={
            <>
              <button className="link" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="link danger" onClick={async () => { setConfirmDelete(false); await s.deleteCourse(courseId); go('courses') }}>Delete</button>
            </>
          }
        >
          <p className="muted">The course, its timetable and its marks disappear from all your devices. Archive it instead to keep the history.</p>
        </Dialog>
      )}
      {addingExtra && <ExtraClassDialog courseId={courseId} today={today} onClose={() => setAddingExtra(false)} onAdd={(row) => { s.addExtraClass(row); setAddingExtra(false) }} />}
    </div>
  )
}

function HistoryRow({ occ, onClick }: { occ: ClassOccurrence; onClick: () => void }) {
  const { derived: d } = useStore()
  const note = occ.swappedFrom
    ? `, ${WEEKDAY_LONG[occ.swappedFrom - 1]} timetable`
    : occ.source === 'extra' ? ', extra class' : occ.source === 'orphaned' ? ', no longer in timetable' : ''
  return (
    <Panel onClick={onClick}>
      <div className="row" style={{ padding: '12px 16px' }}>
        <div className="grow">
          <div style={{ fontWeight: 500 }}>{dayFmt(occ.key.date)}</div>
          <div className="small">{occ.key.start} – {occ.end}{note}</div>
        </div>
        {occ.mark == null
          ? <span style={{ color: 'var(--tight)', fontSize: 12, fontWeight: 600 }}>{hasEnded(occ, d.now) ? 'Unmarked' : 'Now'}</span>
          : <MarkChip occ={occ} derived={d} />}
      </div>
    </Panel>
  )
}

function ExtraClassDialog({ courseId, today, onClose, onAdd }: { courseId: string; today: string; onClose: () => void; onAdd: (row: ExtraRow) => void }) {
  const [date, setDate] = useState(today)
  const [start, setStart] = useState('16:00')
  const [end, setEnd] = useState('16:55')
  const [room, setRoom] = useState('')
  const ok = end > start && !!date
  return (
    <Dialog
      title="Add an extra class"
      onClose={onClose}
      actions={
        <>
          <button className="link" onClick={onClose}>Cancel</button>
          <button className="link" disabled={!ok} onClick={() => onAdd({ id: newId(), course_id: courseId, date, start_time: start, end_time: end, room: room.trim() || null, kind: 'lecture', deleted_at: null })}>Add</button>
        </>
      }
    >
      <label className="field"><span>Date</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="row">
        <label className="field grow"><span>Starts</span><input className="input" type="time" value={start} onChange={(e) => { setStart(e.target.value); if (end <= e.target.value) setEnd(addMinutes(e.target.value, 55)) }} /></label>
        <label className="field grow"><span>Ends</span><input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <label className="field"><span>Room</span><input className="input" value={room} maxLength={40} onChange={(e) => setRoom(e.target.value)} /></label>
      {!ok && <span className="small" style={{ color: 'var(--risk)' }}>The end time must be after the start.</span>}
    </Dialog>
  )
}
