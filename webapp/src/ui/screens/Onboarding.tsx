import { useState } from 'react'
import { addDays, dayFmt, validateSemester } from '../../domain'
import { newId, useStore } from '../../data/store'
import type { SemesterRow } from '../../data/rows'
import { Dot, Toggle } from '../common'
import { CourseEditor } from './CourseEditor'

/** Known semesters, used to pre-fill the form. */
function suggestion(today: string): { name: string; start: string; end: string; midStart: string; midEnd: string } | null {
  return today <= '2026-11-12' ? { name: 'Monsoon 2026', start: '2026-07-23', end: '2026-11-12', midStart: '2026-09-13', midEnd: '2026-09-20' } : null
}

export function SemesterForm({ existing, onSave, saveLabel = 'Save' }: { existing: SemesterRow | null; onSave: (row: SemesterRow) => void; saveLabel?: string }) {
  const today = useStore().derived.now.date
  const seed = existing
    ? { name: existing.name, start: existing.start_date, end: existing.end_date, midStart: existing.mid_sem_start ?? '', midEnd: existing.mid_sem_end ?? '' }
    : suggestion(today)
  const [name, setName] = useState(seed?.name ?? '')
  const [start, setStart] = useState(seed?.start ?? today)
  const [end, setEnd] = useState(seed?.end ?? addDays(today, 16 * 7))
  const [hasMid, setHasMid] = useState(!!seed?.midStart)
  const [midStart, setMidStart] = useState(seed?.midStart ?? '')
  const [midEnd, setMidEnd] = useState(seed?.midEnd ?? '')

  const issues = validateSemester({ name, start, end, midSemStart: hasMid ? midStart || null : null, midSemEnd: hasMid ? midEnd || null : null })
  const first = [...issues][0] ?? (name.trim() ? null : 'name')
  const message = {
    semester_ends_before_start: 'The end date must be after the start.',
    mid_sem_incomplete: 'Pick both exam dates.',
    mid_sem_reversed: 'Exam end must be after exam start.',
    mid_sem_outside_semester: 'Exams must fall inside the semester.',
    name: 'Give the semester a name.',
  }[first as string] ?? 'Check the dates.'

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <label className="field"><span>Name, e.g. Winter 2027</span><input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      <div className="row">
        <label className="field grow"><span>Classes start</span><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="field grow"><span>Classes end</span><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <Toggle title="Mid-semester exams" subtitle="Needed for half-semester courses; no classes those days." checked={hasMid} onChange={setHasMid} />
      {hasMid && (
        <div className="row">
          <label className="field grow"><span>Exams start</span><input className="input" type="date" value={midStart} onChange={(e) => setMidStart(e.target.value)} /></label>
          <label className="field grow"><span>Exams end</span><input className="input" type="date" value={midEnd} onChange={(e) => setMidEnd(e.target.value)} /></label>
        </div>
      )}
      {start < today && <span className="small">Already under way? Past classes will show as unmarked. Mark them in bulk from Today, or set the start to today.</span>}
      {first && <span className="small" style={{ color: 'var(--risk)' }}>{message}</span>}
      <button className="btn block" style={{ minHeight: 52 }} disabled={!!first || !name.trim()}
        onClick={() => onSave({ id: existing?.id ?? newId(), name: name.trim(), start_date: start, end_date: end, mid_sem_start: hasMid ? midStart || null : null, mid_sem_end: hasMid ? midEnd || null : null, is_active: true, deleted_at: null })}>
        {saveLabel}
      </button>
    </div>
  )
}

export function Onboarding() {
  const s = useStore()
  const data = s.derived.data
  const [step, setStep] = useState(data.semesterRow ? 2 : 0)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState(data.profile?.full_name ?? '')
  const [firstYear, setFirstYear] = useState(data.isFirstYearUg)

  return (
    <div className="center" style={{ alignItems: 'start' }}>
      <div className="setup">
        <div className="steps">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        {step === 0 && (
          <>
            <div><div className="caption">Step 1 of 3</div><h1 className="h1">About you</h1></div>
            <label className="field"><span>Your name</span><input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
            <Toggle title="First-year UG" subtitle="Follow the day swaps that apply only to first-year students." checked={firstYear} onChange={setFirstYear} />
            <button className="btn block" style={{ minHeight: 52 }} onClick={() => { s.saveProfile({ fullName: name, firstYear }); setStep(1) }}>Next</button>
          </>
        )}
        {step === 1 && (
          <>
            <div><div className="caption">Step 2 of 3</div><h1 className="h1">Your semester</h1></div>
            <SemesterForm existing={data.semesterRow} saveLabel="Next" onSave={async (row) => { if (await s.saveSemester(row)) setStep(2) }} />
          </>
        )}
        {step >= 2 && (
          <>
            <div><div className="caption">Step 3 of 3</div><h1 className="h1">{adding ? 'Add a course' : 'Your courses'}</h1></div>
            {!data.semesterRow ? (
              <button className="btn" onClick={() => setStep(1)}>Set up your semester first</button>
            ) : adding ? (
              <CourseEditor courseId={null} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
            ) : (
              <>
                <div className="row wrap" style={{ gap: 6 }}>
                  {data.courses.map((c) => <span key={c.id} className="chip neutral" style={{ padding: '6px 12px', fontSize: 13 }}><Dot color={c.color} />{c.code}</span>)}
                </div>
                <p className="muted">{data.courses.length === 0 ? 'Add each course with its weekly class times. You can change everything later.' : 'Add every course you attend. You can edit timetables any time.'}</p>
                <button className="btn outline block" style={{ minHeight: 52 }} onClick={() => setAdding(true)}>Add a course</button>
                <button className="btn block" style={{ minHeight: 52 }} disabled={data.courses.length === 0} onClick={() => s.finishOnboarding()}>Finish setup</button>
                <button className="btn outline block" onClick={() => setStep(1)}>Change semester dates</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export { dayFmt }
