import { useState } from 'react'
import { AVATARS, avatarById, dayFmt, hasStarted, type Badge } from '../../domain'
import { thresholdPreview } from '../../copy'
import { useStore } from '../../data/store'
import { Icon } from '../Icon'
import { Avatar, BadgeArt, Dialog, Flame, Panel, Segmented, Toggle } from '../common'
import { SemesterForm } from './Onboarding'

function useIdentity() {
  const s = useStore()
  const profile = s.derived.data.profile
  const name = profile?.full_name ?? (s.session?.user.user_metadata?.full_name as string | undefined) ?? (s.session?.user.user_metadata?.name as string | undefined) ?? ''
  const email = s.session?.user.email ?? ''
  return { s, d: s.derived, profile, name, email }
}

/** The last classes you attended or missed, newest on the right, as a row of dots. */
function RecentDots() {
  const { d } = useIdentity()
  const recent = d.schedule.occurrences
    .filter((o) => hasStarted(o, d.now) && (o.mark?.status === 'present' || o.mark?.status === 'absent'))
    .slice(-16)
  if (recent.length === 0) return null
  return (
    <div className="dots" aria-label="Recent classes">
      {recent.map((o) => <i key={o.key.date + o.key.start + o.key.courseId} className={o.mark?.status === 'present' ? 'p' : 'a'} title={`${dayFmt(o.key.date)} ${o.key.start}`} />)}
    </div>
  )
}

export function Profile({ go }: { go: (route: string) => void }) {
  const { s, d, profile, name, email } = useIdentity()
  const [picking, setPicking] = useState(false)
  const [badge, setBadge] = useState<Badge | null>(null)
  const avatar = avatarById(profile?.avatar)
  const streak = d.streak
  const unlocked = d.badges.filter((b) => b.unlocked).length
  const next = d.badges.filter((b) => !b.unlocked).sort((a, b) => b.value / b.goal - a.value / a.goal)[0]

  return (
    <div className="page">
      <section className="hero">
        <button className="avatar-btn" aria-label="Change avatar" onClick={() => setPicking(true)}>
          <Avatar id={profile?.avatar} name={name || email} size={104} />
          <span className="avatar-edit">Change</span>
        </button>
        <h1 className="hero-name">{name || 'Add your name'}</h1>
        <div className="hero-line">{avatar ? `${avatar.title}. ${avatar.line}` : 'Pick an avatar that fits you.'}</div>
        <div className="hero-stats">
          <div><b className="num">{streak.current}</b><span>streak</span></div>
          <div><b className="num">{d.overall.percentFloor != null ? `${d.overall.percentFloor}%` : '-'}</b><span>attendance</span></div>
          <div><b className="num">{unlocked}/{d.badges.length}</b><span>badges</span></div>
        </div>
      </section>

      <Panel>
        <div className="streak-card">
          <span className={streak.current > 0 ? 'flame on' : 'flame'}><Flame size={28} /></span>
          <div className="grow">
            <div className="streak-n"><span className="num">{streak.current}</span> in a row</div>
            <div className="small">{streak.current === 0 ? 'Attend your next class to start one.' : 'Classes attended without a miss. Cancelled and on-duty classes do not break it.'}</div>
          </div>
          <div className="streak-best"><b className="num">{streak.best}</b><span className="small">best</span></div>
        </div>
        <RecentDots />
      </Panel>

      <div className="caps">{`Badges, ${unlocked} of ${d.badges.length}`}</div>
      {next && (
        <button className="next-badge" onClick={() => setBadge(next)}>
          <BadgeArt id={next.id} locked size={44} />
          <span className="grow"><b>Next up: {next.title}</b><span className="small">{next.how}</span></span>
          <span className="next-bar" aria-hidden><i style={{ width: `${Math.round((next.value / next.goal) * 100)}%` }} /></span>
        </button>
      )}
      <div className="badge-grid">
        {d.badges.map((b) => (
          <button key={b.id} className={b.unlocked ? 'badge-tile' : 'badge-tile locked'} onClick={() => setBadge(b)}>
            <BadgeArt id={b.id} locked={!b.unlocked} size={64} />
            <span className="badge-title">{b.title}</span>
            <span className="small">{b.unlocked ? 'Unlocked' : `${b.value} of ${b.goal}`}</span>
          </button>
        ))}
      </div>

      <Panel onClick={() => go('settings')}>
        <div className="set-row">
          <div className="grow"><div>Settings</div><div className="small">Name, semester, voice, appearance and sign out</div></div>
          <Icon name="chevron_right" size={22} />
        </div>
      </Panel>

      {picking && (
        <Dialog title="Choose your avatar" onClose={() => setPicking(false)} actions={<button className="link" onClick={() => setPicking(false)}>Close</button>}>
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <button key={a.id} className={profile?.avatar === a.id ? 'avatar-opt on' : 'avatar-opt'} onClick={() => { s.saveProfile({ avatar: a.id }); setPicking(false) }}>
                <Avatar id={a.id} name={a.title} size={64} />
                <b>{a.title}</b>
                <span className="small">{a.line}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {badge && (
        <Dialog title={badge.title} onClose={() => setBadge(null)} actions={<button className="link" onClick={() => setBadge(null)}>Close</button>}>
          <div style={{ display: 'grid', placeItems: 'center', gap: 10, textAlign: 'center' }}>
            <BadgeArt id={badge.id} locked={!badge.unlocked} size={96} />
            <div className="muted">{badge.how}</div>
            <div className="small">{badge.unlocked ? 'Unlocked' : `Progress ${badge.value} of ${badge.goal}`}</div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

export function Settings({ go }: { go: (route: string) => void }) {
  const { s, d, profile, name } = useIdentity()
  const email = s.session?.user.email ?? ''
  const [editingName, setEditingName] = useState(false)
  const [value, setValue] = useState(name)
  const [signOut, setSignOut] = useState(false)
  const [semester, setSemester] = useState(false)
  const sem = d.data.semester

  return (
    <div className="page">
      <div className="row">
        <button className="icon-btn" aria-label="Back to profile" onClick={() => go('profile')}><Icon name="back" size={24} /></button>
        <h1 className="title grow">Settings</h1>
      </div>

      <div className="caps">Account</div>
      <Panel>
        <div className="set-row" style={{ gap: 12 }}>
          <Avatar id={profile?.avatar} name={name || email} size={44} />
          <div className="grow"><div>{name || 'Add your name'}</div><div className="small">{email}</div></div>
          <button className="link" onClick={() => { setValue(name); setEditingName(true) }}>Edit name</button>
        </div>
      </Panel>

      <div className="caps">Semester</div>
      <Panel onClick={() => setSemester(true)}>
        <div className="pad">
          <div>{sem?.name ?? 'No semester'}</div>
          {sem && <div className="small">{dayFmt(sem.start)} – {dayFmt(sem.end)}, {d.data.courses.filter((c) => !c.archived).length} courses</div>}
        </div>
      </Panel>
      <Panel><div style={{ padding: '4px 16px' }}><Toggle title="First-year UG" subtitle="Follow first-year-only day swaps" checked={d.data.isFirstYearUg} onChange={(v) => s.saveProfile({ firstYear: v })} /></div></Panel>

      <div className="caps">Voice</div>
      <Panel>
        <div style={{ padding: 12, display: 'grid', gap: 10 }}>
          <Segmented value={d.data.humor} options={[['roast', 'Roast'], ['plain', 'Plain'], ['kuchupuchu', 'Kuchupuchu']]} onChange={(v) => s.saveProfile({ humor: v })} />
          <div className="caption">“{thresholdPreview('EE 203', 70, d.data.humor, 'preview')}”</div>
          <div className="small">The voice sets the "Can I bunk today?" line here. The Android app also uses it in notifications.</div>
        </div>
      </Panel>

      <div className="caps">Appearance</div>
      <Segmented value={s.theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} onChange={s.setTheme} />

      <div className="caps">Sync</div>
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
        <Dialog title="Your name" onClose={() => setEditingName(false)} actions={<><button className="link" onClick={() => setEditingName(false)}>Cancel</button><button className="link" onClick={() => { s.saveProfile({ fullName: value }); setEditingName(false) }}>Save</button></>}>
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
