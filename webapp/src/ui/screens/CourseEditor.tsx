import { useMemo, useState } from 'react'
import {
  addMinutes, findClashes, labNames, matchingSlots, slotTimes, theoryNames, TimetableEdits, validateCourse, WEEKDAY_SHORT,
  type SlotKind, type TimetableSlot, type Term, type Weekday,
} from '../../domain'
import { newId, useStore } from '../../data/store'
import type { CourseRow, SlotRow } from '../../data/rows'
import { hm } from '../../data/rows'
import { Menu, Segmented, Toggle } from '../common'
import { Icon } from '../Icon'

export const COURSE_PALETTE = ['#2463EB', '#0F8B8D', '#E8590C', '#C2255C', '#7C3AED', '#2F9E44', '#1C7ED6', '#8D6E63', '#D9480F', '#5C7CFA', '#E64980', '#495057']

interface Draft {
  key: number
  original: SlotRow | null
  day: Weekday
  start: string
  end: string
  room: string
  kind: SlotKind
}

const KINDS: SlotKind[] = ['lecture', 'tutorial', 'lab']
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function slotDays(name: string): string {
  return (slotTimes(name) ?? [])
    .map((t) => (t.kind === 'lab' ? `${WEEKDAY_SHORT[t.day - 1]} ${Number(t.start.slice(0, 2))} to ${Number(t.end.slice(0, 2)) + 1}` : `${WEEKDAY_SHORT[t.day - 1]} ${Number(t.start.slice(0, 2))}`))
    .join(', ')
}

const differs = (d: Draft, o: SlotRow) =>
  o.day_of_week !== d.day || hm(o.start_time) !== d.start || hm(o.end_time) !== d.end || (o.room ?? '') !== d.room.trim() || o.kind !== d.kind

const toDomain = (r: SlotRow): TimetableSlot => ({
  id: r.id, courseId: r.course_id, dayOfWeek: r.day_of_week as Weekday, start: hm(r.start_time), end: hm(r.end_time), room: r.room, kind: r.kind, validFrom: r.valid_from, validTo: r.valid_to,
})
const toRow = (s: TimetableSlot): SlotRow => ({
  id: s.id, course_id: s.courseId, day_of_week: s.dayOfWeek, start_time: s.start, end_time: s.end, room: s.room, kind: s.kind, valid_from: s.validFrom, valid_to: s.validTo, deleted_at: null,
})

/** Works out which slot rows to save and delete for an edit. History-preserving edits use TimetableEdits. */
function planSlotChanges(courseId: string, drafts: Draft[], originals: SlotRow[], keepHistory: boolean, today: string): { save: SlotRow[]; remove: string[] } {
  const save: SlotRow[] = []
  const remove: string[] = []
  const draftSlot = (d: Draft, id: string): TimetableSlot => ({ id, courseId, dayOfWeek: d.day, start: d.start, end: d.end, room: d.room.trim() || null, kind: d.kind, validFrom: null, validTo: null })
  for (const d of drafts) {
    const o = d.original
    if (!o) save.push(toRow({ ...draftSlot(d, newId()), validFrom: keepHistory ? today : null }))
    else if (!differs(d, o)) continue
    else if (keepHistory) {
      const change = TimetableEdits.change(toDomain(o), draftSlot(d, o.id), today, newId())
      save.push(...change.updated.map(toRow), ...change.added.map(toRow))
    } else save.push(toRow({ ...draftSlot(d, o.id), validFrom: o.valid_from, validTo: o.valid_to }))
  }
  const kept = new Set(drafts.map((d) => d.original?.id).filter(Boolean))
  for (const o of originals.filter((x) => !kept.has(x.id))) {
    if (!keepHistory) remove.push(o.id)
    else {
      const retired = TimetableEdits.retire(toDomain(o), today)
      if (retired == null) remove.push(o.id)
      else save.push(toRow(retired))
    }
  }
  return { save, remove }
}

export function CourseEditor({ courseId, onDone, onCancel }: { courseId: string | null; onDone: () => void; onCancel: () => void }) {
  const s = useStore()
  const d = s.derived
  const semester = d.data.semesterRow!
  const existing = courseId ? s.raw.courses.find((c) => c.id === courseId) ?? null : null
  const today = d.now.date
  const originals = useMemo(
    () => (courseId ? s.raw.slots.filter((x) => x.course_id === courseId && (x.valid_to == null || x.valid_to >= today)) : []),
    [courseId, s.raw.slots, today],
  )

  const [code, setCode] = useState(existing?.code ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? COURSE_PALETTE[d.data.courses.length % COURSE_PALETTE.length])
  const [threshold, setThreshold] = useState(existing?.threshold_percent ?? 75)
  const [custom, setCustom] = useState(existing != null && ![75, 80, 85, 100].includes(existing.threshold_percent) ? String(existing.threshold_percent) : '')
  const [term, setTerm] = useState<Term>(existing?.term ?? 'full')
  const [strict, setStrict] = useState(existing?.strict_no_skip ?? false)
  const [nextKey, setNextKey] = useState(originals.length)
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    [...originals]
      .sort((a, b) => a.day_of_week - b.day_of_week || (a.start_time < b.start_time ? -1 : 1))
      .map((o, i) => ({ key: i, original: o, day: o.day_of_week as Weekday, start: hm(o.start_time), end: hm(o.end_time), room: o.room ?? '', kind: o.kind })),
  )
  const [fromToday, setFromToday] = useState(true)
  const [saving, setSaving] = useState(false)

  const semesterStarted = today > semester.start_date
  const keepHistory = existing != null && semesterStarted && fromToday
  const issues = validateCourse({ code, name, thresholdPercent: threshold })
  const badSlots = new Set(drafts.filter((x) => !(x.end > x.start)).map((x) => x.key))
  const clashes = findClashes(drafts.map((x) => ({ id: String(x.key), courseId: 'c', dayOfWeek: x.day, start: x.start, end: x.end, room: null, kind: 'lecture' as SlotKind, validFrom: null, validTo: null })))
  const canSave = issues.size === 0 && badSlots.size === 0 && !saving

  const chosen = matchingSlots(drafts.map((x) => ({ day: x.day, start: x.start, end: x.end })))
  const update = (key: number, patch: Partial<Draft>) => setDrafts((cur) => cur.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const setSlot = (group: string[], pick: string | null) => {
    let next = drafts
    for (const old of group.filter((n) => chosen.includes(n))) {
      const times = slotTimes(old) ?? []
      next = next.filter((x) => !times.some((t) => t.day === x.day && t.start === x.start && t.end === x.end))
    }
    const times = pick ? slotTimes(pick) : undefined
    if (times) {
      const room = next.find((x) => x.room.trim())?.room ?? ''
      let k = nextKey
      next = [...next, ...times.map((t) => ({ key: k++, original: null, day: t.day, start: t.start, end: t.end, room, kind: t.kind as SlotKind }))]
      setNextKey(k)
      next = [...next].sort((a, b) => a.day - b.day || (a.start < b.start ? -1 : 1))
    }
    setDrafts(next)
  }

  const addTime = () => {
    const last = drafts[drafts.length - 1]
    setDrafts([...drafts, { key: nextKey, original: null, day: last ? ((last.day < 6 ? last.day + 1 : 1) as Weekday) : 1, start: last?.start ?? '09:00', end: last?.end ?? '09:55', room: last?.room ?? '', kind: 'lecture' }])
    setNextKey(nextKey + 1)
  }

  const save = async () => {
    setSaving(true)
    const id = existing?.id ?? newId()
    const row: CourseRow = {
      ...(existing ?? { id, semester_id: semester.id, archived: false, deleted_at: null }),
      id, semester_id: semester.id, code: code.trim(), name: name.trim(), color, threshold_percent: Math.min(100, Math.max(0, threshold)), strict_no_skip: strict, term,
    } as CourseRow
    const { save: toSave, remove } = planSlotChanges(id, drafts, originals, keepHistory, today)
    const ok = await s.saveCourse(row, toSave, remove)
    setSaving(false)
    if (ok) onDone()
  }

  const thresholdOptions = [75, 80, 85, 100]
  const terms: Array<[Term, string]> = [['full', 'Full sem'], ['pre_mid', 'First half'], ['post_mid', 'Second half']]

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ width: 130 }}><span>Code</span><input className="input" value={code} maxLength={80} onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
        <label className="field grow"><span>Name</span><input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      </div>

      <div className="field"><span>Colour</span>
        <div className="row wrap" style={{ gap: 8 }}>
          {COURSE_PALETTE.map((hex) => (
            <button key={hex} type="button" aria-label={`Colour ${hex}${hex.toLowerCase() === color.toLowerCase() ? ', selected' : ''}`} onClick={() => setColor(hex)}
              style={{ width: 36, height: 36, borderRadius: 12, border: hex.toLowerCase() === color.toLowerCase() ? '3px solid var(--fg)' : '0', background: hex }} />
          ))}
        </div>
      </div>

      <div className="field"><span>Attendance needed</span>
        <div className="row wrap" style={{ gap: 8 }}>
          {thresholdOptions.map((p) => <button key={p} type="button" className="pill" aria-pressed={threshold === p && custom === ''} onClick={() => { setThreshold(p); setCustom('') }}>{p}%</button>)}
          <label className="row" style={{ gap: 6 }}>
            <input className="input" style={{ width: 90, height: 36 }} inputMode="numeric" placeholder="Custom" value={custom}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setCustom(v); const n = Number(v); if (v && n >= 1 && n <= 100) setThreshold(n) }} />
            <span className="muted">%</span>
          </label>
        </div>
      </div>

      <div className="field"><span>Runs for</span><Segmented value={term} options={terms} onChange={setTerm} /></div>
      {term !== 'full' && (!semester.mid_sem_start || !semester.mid_sem_end) && <span className="small" style={{ color: 'var(--tight)' }}>Add mid-semester exam dates to your semester so half-semester courses split correctly.</span>}
      <Toggle title="Never skip" subtitle="Labs and strict profs" checked={strict} onChange={setStrict} />

      <h2 className="title">Slot</h2>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow"><SlotMenu label="Slot" names={theoryNames} current={chosen.find((n) => theoryNames.includes(n)) ?? null} onPick={(n) => setSlot(theoryNames, n)} /></div>
        <div className="grow"><SlotMenu label="Lab" names={labNames} current={chosen.find((n) => labNames.includes(n)) ?? null} onPick={(n) => setSlot(labNames, n)} /></div>
      </div>
      <span className="small">Pick a slot and its class times fill in. The class at 8:00 is a tutorial. You can change anything below.</span>

      <h2 className="title">Weekly timetable</h2>
      {drafts.map((x) => (
        <div key={x.key} className="panel" style={{ padding: 10, display: 'grid', gap: 8, borderColor: badSlots.has(x.key) ? 'var(--risk)' : undefined }}>
          <div className="row wrap">
            <select className="input" style={{ width: 90 }} aria-label="Day" value={x.day} onChange={(e) => update(x.key, { day: Number(e.target.value) as Weekday })}>
              {WEEKDAY_SHORT.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </select>
            <input className="input" style={{ width: 150 }} type="time" aria-label="Starts" value={x.start} onChange={(e) => update(x.key, { start: e.target.value, end: x.end <= e.target.value ? addMinutes(e.target.value, 55) : x.end })} />
            <span>–</span>
            <input className="input" style={{ width: 150 }} type="time" aria-label="Ends" value={x.end} onChange={(e) => update(x.key, { end: e.target.value })} />
            <span className="grow" />
            <button type="button" className="icon-btn" aria-label="Remove class time" onClick={() => setDrafts(drafts.filter((y) => y.key !== x.key))}><Icon name="close" size={18} /></button>
          </div>
          <div className="row">
            <input className="input grow" placeholder="Room" aria-label="Room" value={x.room} maxLength={40} onChange={(e) => update(x.key, { room: e.target.value })} />
            <select className="input" style={{ width: 130 }} aria-label="Kind" value={x.kind} onChange={(e) => update(x.key, { kind: e.target.value as SlotKind })}>
              {KINDS.map((k) => <option key={k} value={k}>{cap(k)}</option>)}
            </select>
          </div>
          {badSlots.has(x.key) && <span className="small" style={{ color: 'var(--risk)' }}>End time must be after the start.</span>}
        </div>
      ))}
      <div><button type="button" className="btn outline" onClick={addTime}><Icon name="add" size={18} />Add class time</button></div>
      {clashes.length > 0 && <span className="small" style={{ color: 'var(--tight)' }}>Two of these times overlap. Check the timetable.</span>}

      {existing && semesterStarted && (
        <Toggle title="Changes apply from today" subtitle={fromToday ? 'Past classes and marks stay as they were.' : 'The new timetable is used for the whole semester.'} checked={fromToday} onChange={setFromToday} />
      )}
      {issues.size > 0 && <span className="small" style={{ color: 'var(--risk)' }}>Add a course code and name.</span>}
      <div className="row">
        <button type="button" className="btn outline grow" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn grow" disabled={!canSave} onClick={() => void save()}>{saving ? 'Saving…' : 'Save course'}</button>
      </div>
    </div>
  )
}

/** A drop-down that picks one slot, or none. Each entry shows the days it meets. */
function SlotMenu({ label, names, current, onPick }: { label: string; names: string[]; current: string | null; onPick: (n: string | null) => void }) {
  return (
    <Menu label={`${label}: ${current ?? 'none'}`}>
      {(close) => (
        <>
          <button type="button" role="menuitem" onClick={() => { onPick(null); close() }}><b>None</b></button>
          {names.map((n) => (
            <button type="button" role="menuitem" key={n} onClick={() => { onPick(n); close() }}>
              <b className={n === current ? 'sel' : ''}>{n}</b>
              <small>{slotDays(n)}</small>
            </button>
          ))}
        </>
      )}
    </Menu>
  )
}
