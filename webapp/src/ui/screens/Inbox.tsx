import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../data/supabase'
import { Icon } from '../Icon'
import { Chip } from '../common'

/** The address of the developer inbox. It is not linked anywhere. The database only returns reports to an admin account. */
export const INBOX_ROUTE = 'inbox-d28add3cb529e1d0'

type Status = 'new' | 'seen' | 'planned' | 'fixed' | 'wont_fix'
interface Row {
  id: string; kind: 'bug' | 'idea' | 'other'; area: string | null; message: string; platform: 'android' | 'web'; app_version: string | null
  device: Record<string, string | number> | null; reporter_name: string | null; reporter_email: string | null; status: Status; admin_note: string | null; created_at: string
}
interface FileRow { id: string; report_id: string; path: string; name: string | null }

const STATUSES: Array<[Status, string]> = [['new', 'New'], ['seen', 'Seen'], ['planned', 'Planned'], ['fixed', 'Fixed'], ['wont_fix', "Won't fix"]]
const KIND_LABEL = { bug: 'Problem', idea: 'Idea', other: 'Other' } as const
const KIND_TONE = { bug: 'risk', idea: 'safe', other: 'neutral' } as const

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

function Card({ r, files, onChange }: { r: Row; files: FileRow[]; onChange: (patch: Partial<Row>) => void }) {
  const [open, setOpen] = useState(r.status === 'new')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [note, setNote] = useState(r.admin_note ?? '')
  const [zoom, setZoom] = useState<string | null>(null)
  useEffect(() => {
    if (!open || files.length === 0) return
    void supabase.storage.from('report-files').createSignedUrls(files.map((f) => f.path), 3600).then(({ data }) => {
      const m: Record<string, string> = {}
      data?.forEach((d) => { if (d.path && d.signedUrl) m[d.path] = d.signedUrl })
      setUrls(m)
    })
  }, [open, files])
  const set = async (patch: Partial<Row>) => {
    const { error } = await supabase.from('reports').update(patch).eq('id', r.id)
    if (!error) onChange(patch)
  }
  return (
    <article className={`ib-card${r.status === 'new' ? ' new' : ''}`}>
      <button type="button" className="ib-head" aria-expanded={open} onClick={() => { setOpen(!open); if (!open && r.status === 'new') void set({ status: 'seen' }) }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Chip text={KIND_LABEL[r.kind]} tone={KIND_TONE[r.kind]} />
          {r.area && <Chip text={r.area.replace('_', ' ')} tone="neutral" />}
          <Chip text={r.platform === 'android' ? 'Android' : 'Web'} tone="swap" />
          {files.length > 0 && <span className="small">{files.length} picture{files.length > 1 ? 's' : ''}</span>}
          <span className="grow" />
          <span className="small">{when(r.created_at)}</span>
        </div>
        <div className="ib-msg-line">{r.message}</div>
      </button>
      {open && (
        <div className="ib-body">
          <p className="ib-msg">{r.message}</p>
          {files.length > 0 && (
            <ul className="rep-thumbs ib-shots">
              {files.map((f) => <li key={f.id}>{urls[f.path] ? <button type="button" className="ib-shot" onClick={() => setZoom(urls[f.path])}><img src={urls[f.path]} alt={f.name ?? 'Screenshot'} /></button> : <div className="ib-wait" />}</li>)}
            </ul>
          )}
          <div className="small ib-meta">
            <div>{r.reporter_name || 'No name'}{r.reporter_email && <>, <a href={`mailto:${r.reporter_email}?subject=${encodeURIComponent('Your AttendWise report')}`}>{r.reporter_email}</a></>}</div>
            {r.app_version && <div>Version {r.app_version}</div>}
            {r.device && <div>{Object.entries(r.device).map(([k, v]) => `${k}: ${v}`).join('  |  ')}</div>}
          </div>
          <div className="seg ib-status" role="group" aria-label="Status">
            {STATUSES.map(([id, label]) => <button key={id} type="button" aria-pressed={r.status === id} onClick={() => void set({ status: id })}>{label}</button>)}
          </div>
          <label className="field"><span>Private note</span>
            <textarea className="input" style={{ height: 'auto', minHeight: 70, padding: '10px 14px', fontFamily: 'inherit' }} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== (r.admin_note ?? '')) void set({ admin_note: note || null }) }} />
          </label>
        </div>
      )}
      {zoom && <div className="ib-zoom" role="dialog" aria-label="Screenshot" onClick={() => setZoom(null)}><img src={zoom} alt="" /></div>}
    </article>
  )
}

export function Inbox({ go }: { go: (route: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [files, setFiles] = useState<FileRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const load = useCallback(async () => {
    const [r, f] = await Promise.all([
      supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('report_files').select('id, report_id, path, name').limit(1500),
    ])
    if (r.error) { setError(r.error.message); return }
    setError(null)
    setRows(r.data as Row[])
    setFiles((f.data ?? []) as FileRow[])
  }, [])
  useEffect(() => { void load() }, [load])

  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === filter)
  const count = (s: Status) => (rows ?? []).filter((r) => r.status === s).length
  return (
    <div className="page ib">
      <div className="row">
        <button className="icon-btn" aria-label="Back" onClick={() => go('settings')}><Icon name="back" size={24} /></button>
        <h1 className="title grow">Reports</h1>
        <button className="link" onClick={() => void load()}>Refresh</button>
      </div>
      {error && <div role="alert" className="signin-msg">{error}</div>}
      {rows && rows.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: 40 }}>No reports yet.</div>}
      {rows && rows.length > 0 && (
        <div className="rep-areas">
          <button type="button" className="pill" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All {rows.length}</button>
          {STATUSES.map(([id, label]) => <button key={id} type="button" className="pill" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} {count(id)}</button>)}
        </div>
      )}
      {!rows && !error && <div className="muted">Loading…</div>}
      {shown.map((r) => <Card key={r.id} r={r} files={files.filter((f) => f.report_id === r.id)} onChange={(p) => setRows((cur) => (cur ?? []).map((x) => (x.id === r.id ? { ...x, ...p } : x)))} />)}
    </div>
  )
}
