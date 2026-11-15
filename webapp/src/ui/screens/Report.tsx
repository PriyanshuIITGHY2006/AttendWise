import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../data/store'
import { AREAS, KINDS, MAX_FILES, MAX_MESSAGE, MIN_MESSAGE, deviceInfo, describeDevice, prepareImage, submitReport, type Attachment, type ReportArea, type ReportKind } from '../../data/reports'
import { Icon, type IconName } from '../Icon'
import { Panel, Toggle } from '../common'

const VERSION = 'web'

const AREA_ICON: Record<ReportArea, IconName> = { today: 'today', courses: 'courses', plan: 'plan', calendar: 'calendar', profile: 'profile', sign_in: 'lock', widgets: 'sync', notifications: 'alert', other: 'edit' }

/** A drop-down list for choosing the part of the app. Arrow keys, Enter and Escape work; "Not sure" clears the choice. */
function AreaPicker({ value, onChange }: { value: ReportArea | null; onChange: (v: ReportArea | null) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const items: Array<{ id: ReportArea | null; label: string; hint: string }> = [{ id: null, label: 'Not sure', hint: 'Skip this, I will explain below' }, ...AREAS]
  const current = AREAS.find((a) => a.id === value)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  const choose = (i: number) => { onChange(items[i].id); setOpen(false) }
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(Math.max(0, items.findIndex((x) => x.id === value))); setOpen(true) } return }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active) }
  }
  return (
    <div className="pick" ref={ref}>
      <button type="button" className={`pick-btn${open ? ' open' : ''}`} aria-haspopup="listbox" aria-expanded={open} aria-label="Where in the app" onClick={() => { setActive(Math.max(0, items.findIndex((x) => x.id === value))); setOpen((o) => !o) }} onKeyDown={onKey}>
        <span className="pick-ic">{current ? <Icon name={AREA_ICON[current.id]} size={22} /> : <Icon name="chevron_right" size={22} />}</span>
        <span className="grow pick-v"><span className={current ? '' : 'muted'}>{current ? current.label : 'Choose where it happened'}</span>{current && <span className="small">{current.hint}</span>}</span>
        <svg className="pick-chev" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <ul className="pick-list" role="listbox" aria-label="Where in the app">
          {items.map((it, i) => (
            <li key={it.id ?? 'none'} role="option" aria-selected={it.id === value} className={i === active ? 'on' : ''} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(i) }}>
              <span className="pick-ic">{it.id ? <Icon name={AREA_ICON[it.id]} size={20} /> : <Icon name="close" size={18} />}</span>
              <span className="grow"><span className="pick-l">{it.label}</span><span className="small">{it.hint}</span></span>
              {it.id === value && <Icon name="check" size={20} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const KIND_ICON: Record<ReportKind, string> = {
  bug: 'M12 3a4 4 0 0 1 4 4v1h1.5a2.5 2.5 0 0 1 0 5H17v1a5 5 0 0 1-10 0v-1H6.5a2.5 2.5 0 0 1 0-5H8V7a4 4 0 0 1 4-4zM12 10v6',
  idea: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  other: 'M4 5h16v11H9l-5 4z',
}

export function Report({ go }: { go: (route: string) => void }) {
  const s = useStore()
  const profile = s.derived.data.profile
  const name = profile?.full_name ?? (s.session?.user.user_metadata?.full_name as string | undefined) ?? ''
  const email = s.session?.user.email ?? ''
  const [kind, setKind] = useState<ReportKind>('bug')
  const [area, setArea] = useState<ReportArea | null>(null)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [withDevice, setWithDevice] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<[number, number]>([0, 0])
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [over, setOver] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  const device = deviceInfo(s.theme, VERSION)

  const add = async (list: File[]) => {
    setNote(null)
    const room = MAX_FILES - files.length
    if (room <= 0) { setNote(`You can attach up to ${MAX_FILES} pictures.`); return }
    const next: Attachment[] = []
    for (const f of list.slice(0, room)) {
      try { next.push(await prepareImage(f)) } catch (e) { setNote(e instanceof Error ? e.message : 'That picture could not be added.') }
    }
    if (list.length > room) setNote(`Only ${MAX_FILES} pictures fit, the rest were left out.`)
    setFiles((cur) => [...cur, ...next])
  }
  const remove = (id: string) => setFiles((cur) => { const f = cur.find((x) => x.id === id); if (f) URL.revokeObjectURL(f.url); return cur.filter((x) => x.id !== id) })

  // Paste a screenshot straight from the clipboard.
  const addRef = useRef(add)
  addRef.current = add
  useEffect(() => {
    const on = (e: ClipboardEvent) => {
      const imgs = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (imgs.length) { e.preventDefault(); void addRef.current(imgs) }
    }
    window.addEventListener('paste', on)
    return () => window.removeEventListener('paste', on)
  }, [])

  const length = message.trim().length
  const ready = length >= MIN_MESSAGE && length <= MAX_MESSAGE && !busy
  const send = async () => {
    const uid = s.session?.user.id
    if (!uid || !ready) return
    setBusy(true); setError(null); setProgress([0, files.length + 1])
    const err = await submitReport({ kind, area, message, files, device: withDevice ? device : null, version: VERSION, name, email }, uid, (a, b) => setProgress([a, b]))
    setBusy(false)
    if (err) { setError(err); return }
    files.forEach((f) => URL.revokeObjectURL(f.url))
    setSent(true)
  }
  const reset = () => { setKind('bug'); setArea(null); setMessage(''); setFiles([]); setError(null); setNote(null); setSent(false) }

  if (sent) {
    return (
      <div className="page">
        <div className="rep-done">
          <div className="rep-done-mark" aria-hidden="true"><Icon name="check" size={40} /></div>
          <h1 className="h1">Thank you, it reached me.</h1>
          <p className="muted">I read every report. If I need more detail I will use the email on your account.</p>
          <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
            <button type="button" className="btn outline" onClick={reset}>Send another</button>
            <button type="button" className="btn" onClick={() => go('settings')}>Done</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page rep">
      <div className="row">
        <button className="icon-btn" aria-label="Back to settings" onClick={() => go('settings')}><Icon name="back" size={24} /></button>
        <h1 className="title grow">Report a problem or idea</h1>
      </div>
      <p className="muted rep-lead">Tell me what happened or what you would like. Pictures help a lot and are optional.</p>

      <div className="rep-kinds" role="radiogroup" aria-label="What is this about">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className="rep-kind" onClick={() => setKind(k.id)}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={KIND_ICON[k.id]} /></svg>
            <span className="rep-kind-t">{k.title}</span>
            <span className="small">{k.hint}</span>
          </button>
        ))}
      </div>

      <div className="caps">Where <span className="small">(optional)</span></div>
      <AreaPicker value={area} onChange={setArea} />

      <div className="caps">Details</div>
      <div className="field">
        <textarea className="input rep-text" value={message} maxLength={MAX_MESSAGE} aria-label="Details" onChange={(e) => setMessage(e.target.value)}
          placeholder={kind === 'idea' ? 'What would you like to see, and what would it help you do?' : 'What did you do, what did you expect, and what happened instead?'} />
        <div className="rep-count small"><span>{length < MIN_MESSAGE ? `Write at least ${MIN_MESSAGE} characters` : ''}</span><span>{message.length} / {MAX_MESSAGE}</span></div>
      </div>

      <div className="caps">Screenshots <span className="small">(optional, up to {MAX_FILES})</span></div>
      <div className={`rep-drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]) }}>
        {files.length > 0 && (
          <ul className="rep-thumbs">
            {files.map((f) => (
              <li key={f.id}>
                <img src={f.url} alt={`Screenshot ${f.name}`} />
                <button type="button" className="rep-x" aria-label={`Remove ${f.name}`} onClick={() => remove(f.id)}><Icon name="close" size={16} /></button>
              </li>
            ))}
            {files.length < MAX_FILES && (
              <li><button type="button" className="rep-add" onClick={() => pick.current?.click()} aria-label="Add another picture"><Icon name="add" size={26} /></button></li>
            )}
          </ul>
        )}
        {files.length === 0 && (
          <button type="button" className="rep-empty" onClick={() => pick.current?.click()}>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 9" /></svg>
            <span><b>Add screenshots</b></span>
            <span className="small">Choose pictures, drop them here, or paste with Ctrl+V</span>
          </button>
        )}
        <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = '' }} />
      </div>
      {note && <div role="status" className="rep-note">{note}</div>}

      <Panel>
        <div style={{ padding: '4px 16px 12px' }}>
          <Toggle title="Include device details" subtitle="Helps me reproduce it. No personal data beyond what you see below." checked={withDevice} onChange={setWithDevice} />
          {withDevice && <div className="small rep-device">{describeDevice(device)}</div>}
        </div>
      </Panel>
      <div className="small rep-who">Sent as {name || 'you'}{email ? `, ${email}` : ''}. Only the developer can read it.</div>

      {error && <div role="alert" className="signin-msg">{error}</div>}
      <button type="button" className="btn block" style={{ minHeight: 54 }} disabled={!ready} onClick={() => void send()}>
        {busy ? (progress[1] > 1 ? `Sending ${Math.min(progress[0] + 1, progress[1])} of ${progress[1]}…` : 'Sending…') : 'Send report'}
      </button>
      {busy && <div className="rep-bar" aria-hidden="true"><i style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} /></div>}
    </div>
  )
}
