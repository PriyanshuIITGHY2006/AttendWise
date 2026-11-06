import { useState } from 'react'
import { dayFmt } from '../../domain'
import { thresholdPreview } from '../../copy'
import { useStore } from '../../data/store'
import { Dialog, initials, Panel, Segmented, Toggle } from '../common'
import { SemesterForm } from './Onboarding'

export function Profile() {
  const s = useStore()
  const d = s.derived
  const profile = d.data.profile
  const name = profile?.full_name ?? (s.session?.user.user_metadata?.full_name as string | undefined) ?? (s.session?.user.user_metadata?.name as string | undefined) ?? ''
  const email = s.session?.user.email ?? ''
  const [editingName, setEditingName] = useState(false)
  const [value, setValue] = useState(name)
  const [signOut, setSignOut] = useState(false)
  const [semester, setSemester] = useState(false)
  const sem = d.data.semester

  return (
    <div className="page">
      <div className="row" style={{ padding: 4 }}>
        <div style={{ width: 52, height: 52, borderRadius: 18, background: 'var(--primary)', color: 'var(--on-primary)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 18 }}>{initials(name || email)}</div>
        <div className="grow" style={{ marginLeft: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{name || 'Add your name'}</div>
          <div className="caption">{email}</div>
        </div>
        <button className="link" onClick={() => { setValue(name); setEditingName(true) }}>Edit</button>
      </div>

      <div className="caps">Semester</div>
      <Panel onClick={() => setSemester(true)}>
        <div className="pad">
          <div>{sem?.name ?? 'No semester'}</div>
          {sem && <div className="small">{dayFmt(sem.start)} – {dayFmt(sem.end)}, {d.data.courses.filter((c) => !c.archived).length} courses</div>}
        </div>
      </Panel>
      <Panel><div style={{ padding: '4px 16px' }}><Toggle title="First-year UG" subtitle="Follow first-year-only day swaps" checked={d.data.isFirstYearUg} onChange={(v) => s.saveProfile(profile?.full_name ?? null, v, d.data.humor)} /></div></Panel>

      <div className="caps">Voice</div>
      <Panel>
        <div style={{ padding: 12, display: 'grid', gap: 10 }}>
          <Segmented value={d.data.humor} options={[['roast', 'Roast'], ['plain', 'Plain'], ['kuchupuchu', 'Kuchupuchu']]} onChange={(v) => s.saveProfile(profile?.full_name ?? null, d.data.isFirstYearUg, v)} />
          <div className="caption">“{thresholdPreview('EE 203', 70, d.data.humor, 'preview')}”</div>
          <div className="small">The voice sets the "Can I bunk today?" line here. The Android app also uses it in notifications.</div>
        </div>
      </Panel>

      <div className="caps">Appearance</div>
      <Segmented value={s.theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} onChange={s.setTheme} />

      <div className="caps">Account</div>
      <Panel>
        <div style={{ padding: '4px 8px' }}>
          <div className="row" style={{ padding: '0 8px' }}>
            <div className="grow"><div>Sync</div><div className="small">{s.error ?? 'Changes save to your account as you make them.'}</div></div>
            <button className="link" onClick={() => void s.reload()}>Refresh</button>
          </div>
          <button className="link danger" onClick={() => setSignOut(true)}>Sign out</button>
        </div>
      </Panel>

      {editingName && (
        <Dialog title="Your name" onClose={() => setEditingName(false)} actions={<><button className="link" onClick={() => setEditingName(false)}>Cancel</button><button className="link" onClick={() => { s.saveProfile(value, d.data.isFirstYearUg, d.data.humor); setEditingName(false) }}>Save</button></>}>
          <input className="input" autoFocus value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} aria-label="Your name" />
        </Dialog>
      )}
      {signOut && (
        <Dialog title="Sign out?" onClose={() => setSignOut(false)} actions={<><button className="link" onClick={() => setSignOut(false)}>Cancel</button><button className="link danger" onClick={() => { setSignOut(false); void s.signOut() }}>Sign out</button></>}>
          <p className="muted">Everything you have entered is saved in your account. You can sign back in any time.</p>
        </Dialog>
      )}
      {semester && (
        <Dialog title="Semester" onClose={() => setSemester(false)}>
          <SemesterForm existing={d.data.semesterRow} onSave={async (row) => { if (await s.saveSemester(row)) setSemester(false) }} />
        </Dialog>
      )}
    </div>
  )
}
