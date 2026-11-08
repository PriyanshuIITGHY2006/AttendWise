import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AttendanceStats, ClassOccurrence, CourseStatus, DayInfo, MarkStatus } from '../domain'
import { avatarById, dayFmt, hasEnded, hasStarted, WEEKDAY_LONG } from '../domain'
import type { Derived } from '../derived'
import { Icon, type IconName } from './Icon'

export function Panel({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return onClick ? (
    <button type="button" className={`panel ${className}`} onClick={onClick}>{children}</button>
  ) : (
    <div className={`panel ${className}`}>{children}</div>
  )
}

export const Dot = ({ color }: { color: string }) => <i className="dot" style={{ background: color }} />

export function Chip({ text, tone, icon }: { text: string; tone: 'safe' | 'tight' | 'risk' | 'neutral' | 'swap'; icon?: IconName }) {
  return (
    <span className={`chip ${tone}`}>
      {icon && <Icon name={icon} size={14} />}
      {text}
    </span>
  )
}

export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="row" style={{ padding: '4px 4px 0' }}>
      <h2 className="title grow">{title}</h2>
      {children}
    </div>
  )
}

/** The same status in as few words as possible, for lists where several courses sit one above the other. */
export function shortStatus(s: AttendanceStats): string {
  if (s.strictNoSkip && s.status !== 'at_risk') return 'Never skip'
  if (s.status === 'at_risk' && !s.canReachThreshold) return `Can't reach ${s.thresholdPercent}%`
  if (s.status === 'at_risk' && s.overBudget > 0) return `Over by ${s.overBudget}`
  if (s.status === 'at_risk' && s.recoveryClasses != null) return `Attend the next ${s.recoveryClasses}`
  if (s.status === 'at_risk') return 'At risk'
  if (s.status === 'tight') return 'No skips left'
  if (s.counts.attended + s.counts.missed === 0 && s.counts.remaining === 0) return 'No classes yet'
  return `${s.safeSkipsLeft} safe skip${s.safeSkipsLeft === 1 ? '' : 's'}`
}

const STATUS_TONE: Record<CourseStatus, 'safe' | 'tight' | 'risk'> = { safe: 'safe', tight: 'tight', at_risk: 'risk' }

/** Status as one short coloured line with a small icon and no box around it. */
export function StatusText({ s }: { s: AttendanceStats }) {
  const neutral = s.strictNoSkip && s.status !== 'at_risk'
  const tone = neutral ? 'neutral' : STATUS_TONE[s.status]
  const icon: IconName | null = neutral ? 'lock' : s.status === 'safe' ? 'check' : s.status === 'at_risk' ? 'alert' : null
  return (
    <span className={`status ${tone}`}>
      {icon && <Icon name={icon} size={14} />}
      {shortStatus(s)}
    </span>
  )
}

export function StatusChip({ s }: { s: AttendanceStats }) {
  const neutral = s.strictNoSkip && s.status !== 'at_risk'
  const icon: IconName | undefined = neutral ? 'lock' : s.status === 'safe' ? 'check' : s.status === 'at_risk' ? 'alert' : undefined
  return <Chip text={shortStatus(s)} tone={neutral ? 'neutral' : STATUS_TONE[s.status]} icon={icon} />
}

export function ringColor(status: CourseStatus | undefined): string {
  if (status === 'safe') return 'var(--present)'
  if (status === 'tight') return 'var(--ring-tight)'
  if (status === 'at_risk') return 'var(--ring-risk)'
  return 'var(--outline)'
}

/** Attendance ring. A null percent draws an empty ring. */
export function Ring({ percent, color, size, stroke, thresholdPercent, children }: { percent: number | null; color: string; size: number; stroke: number; thresholdPercent?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const sweep = Math.min(100, Math.max(0, percent ?? 0)) / 100
  let tick: ReactNode = null
  if (thresholdPercent != null) {
    const a = (thresholdPercent / 100) * 2 * Math.PI - Math.PI / 2
    const outer = size / 2
    const inner = outer - stroke * 1.4
    tick = <line x1={c + inner * Math.cos(a)} y1={c + inner * Math.sin(a)} x2={c + outer * Math.cos(a)} y2={c + outer * Math.sin(a)} stroke="var(--fg)" strokeWidth={2.5} />
  }
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg className="arc" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--variant)" strokeWidth={stroke} />
        {sweep > 0 && <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${circ * sweep} ${circ}`} transform={`rotate(-90 ${c} ${c})`} />}
        {tick}
      </svg>
      <div className="inner">{children}</div>
    </div>
  )
}

export function DayBanner({ info }: { info: DayInfo }) {
  if (info.kind === 'regular') return null
  let title: string
  let sub: string | null
  if (info.kind === 'swapped') {
    title = `Day swap: ${WEEKDAY_LONG[info.follows - 1]}'s timetable today`
    sub = info.description
  } else {
    title = { holiday: 'Holiday', exam: 'Exam day', mid_sem_break: 'Mid-semester exams', end_sem_break: 'End-semester exams', reschedule: 'No classes' }[info.type]
    sub = info.description
  }
  return (
    <div className="banner">
      <Icon name="swap" />
      <div>
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}

export function MarkChip({ occ, derived }: { occ: ClassOccurrence; derived: Derived }) {
  const started = hasStarted(occ, derived.now)
  switch (occ.mark?.status) {
    case 'present': return <Chip text={started ? 'Present' : 'Going'} tone="safe" icon="check" />
    case 'absent': return <Chip text={started ? 'Absent' : 'Planned skip'} tone="risk" icon="close" />
    case 'cancelled': return <Chip text="Cancelled" tone="neutral" />
    case 'on_duty': return <Chip text="On duty" tone="tight" />
    default: return null
  }
}

/** One class: click it for more options, or use the two buttons to mark it. */
export function ClassCard({ occ, derived, onMark, onMore, showDate = false }: { occ: ClassOccurrence; derived: Derived; onMark: (s: MarkStatus) => void; onMore: () => void; showDate?: boolean }) {
  const now = derived.now
  const inProgress = hasStarted(occ, now) && !hasEnded(occ, now)
  const stats = derived.stats.get(occ.key.courseId)
  const meta = [occ.kind !== 'lecture' ? occ.kind[0].toUpperCase() + occ.kind.slice(1) : null, occ.room].filter(Boolean).join(', ')
  return (
    <div className="class-card">
      <div className={`class-row ${inProgress ? 'now' : ''}`}>
        <button type="button" className="class-hit" onClick={onMore} aria-label={`${derived.code(occ.key.courseId)} at ${occ.key.start}, more options`}>
          <span className="time num">
            {inProgress ? <span className="now-tag">NOW</span> : showDate ? <span className="small">{dayFmt(occ.key.date)}</span> : null}
            <b>{occ.key.start}</b>
            {!inProgress && <span className="small">{occ.end}</span>}
          </span>
          <span className="what">
            <span className="top">
              <Dot color={derived.color(occ.key.courseId)} />
              <b>{derived.code(occ.key.courseId)}</b>
              {meta && <span>{meta}</span>}
            </span>
            {occ.mark == null && stats && <StatusText s={stats} />}
          </span>
        </button>
        {occ.mark == null ? (
          <div className="marks">
            <button type="button" className="mbtn absent" aria-label="Mark absent" onClick={() => onMark('absent')}><Icon name="close" size={20} /></button>
            <button type="button" className="mbtn present" aria-label="Mark present" onClick={() => onMark('present')}><Icon name="check" size={20} /></button>
          </div>
        ) : (
          <MarkChip occ={occ} derived={derived} />
        )}
      </div>
    </div>
  )
}

export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <h2>{title}</h2>
        {children}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  )
}

/** Choose what happened in a class. */
export function MarkDialog({ title, current, onPick, onClose }: { title: string; current: MarkStatus | undefined; onPick: (s: MarkStatus | null) => void; onClose: () => void }) {
  const options: Array<[MarkStatus, string]> = [
    ['present', 'Present'],
    ['absent', "Absent (or skip it, if it's later)"],
    ['cancelled', "Cancelled, doesn't count"],
    ['on_duty', "On duty, doesn't count"],
  ]
  return (
    <Dialog title={title} onClose={onClose} actions={<button className="link" onClick={onClose}>Close</button>}>
      <div>
        {options.map(([s, label]) => (
          <button key={s} className="opt" onClick={() => onPick(s)}>{(s === current ? '✓  ' : '') + label}</button>
        ))}
        {current && <button className="opt" style={{ color: 'var(--error)' }} onClick={() => onPick(null)}>Clear mark</button>}
      </div>
    </Dialog>
  )
}

export function Toggle({ title, subtitle, checked, onChange }: { title: string; subtitle?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle">
      <div className="grow">
        <div>{title}</div>
        {subtitle && <div className="small">{subtitle}</div>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={title} className="switch" onClick={() => onChange(!checked)} />
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  )
}

/** A small drop-down menu opened from a button. */
export function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn outline sm block" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && <div className="menu" role="menu">{children(() => setOpen(false))}</div>}
    </div>
  )
}

export const initials = (text: string): string =>
  text.split(/[ .@]/).filter((p) => p.trim()).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?'

const assetBase = import.meta.env.BASE_URL

/** A profile picture: the chosen avatar, or the person's initials until they pick one. */
export function Avatar({ id, name, size = 52 }: { id?: string | null; name: string; size?: number }) {
  const known = id ? avatarById(id) : null
  const radius = Math.round(size * 0.35)
  if (known) {
    return <img className="avatar" src={`${assetBase}avatars/${known.id}.svg`} alt={known.title} width={size} height={size} style={{ width: size, height: size, borderRadius: radius }} />
  }
  return <div className="avatar initials" style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.35) }}>{initials(name)}</div>
}

export function BadgeArt({ id, locked, size = 56 }: { id: string; locked?: boolean; size?: number }) {
  return <img className={locked ? 'badge-art locked' : 'badge-art'} src={`${assetBase}badges/${id}.svg`} alt="" width={size} height={size} />
}

export function Flame({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  )
}
