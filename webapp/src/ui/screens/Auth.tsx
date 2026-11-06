import { useState } from 'react'
import { useStore } from '../../data/store'
import { Ring } from '../common'
import { Icon } from '../Icon'

const base = import.meta.env.BASE_URL

export function AuthScreen() {
  const s = useStore()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const go = async () => {
    setBusy(true)
    setMessage(null)
    const err = creating ? await s.signUp(email, password, name) : await s.signIn(email, password)
    setMessage(err)
    setBusy(false)
  }

  return (
    <div className="center">
      <form className="auth" onSubmit={(e) => { e.preventDefault(); if (email.includes('@') && password.length >= 6) void go() }}>
        <div className="brand"><img src={`${base}favicon.svg`} alt="" />AttendWise</div>
        <div className="demo">
          <Ring percent={85} color="var(--primary)" size={160} stroke={16} thresholdPercent={75}>
            <div className="h1" style={{ fontWeight: 700, fontFamily: 'var(--body)', fontSize: 40 }}>85%</div>
            <div style={{ color: 'var(--safe)', fontWeight: 600 }}>7 safe skips</div>
          </Ring>
        </div>
        <h1 className="h1">Know exactly how many classes you can skip.</h1>
        <p className="muted">Attendance, timetable and safe skips in one place. Sign in with the same account you use in the Android app.</p>
        <button type="button" className="btn outline block" style={{ minHeight: 54 }} disabled={busy} onClick={() => void s.google()}>Continue with Google</button>
        <div className="muted" style={{ textAlign: 'center' }}>or with email</div>
        {creating && <label className="field"><span>Your name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
        <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="field"><span>Password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={creating ? 'new-password' : 'current-password'} />{creating && <span>At least 6 characters</span>}</label>
        {message && <div className="muted" role="status" style={{ color: 'var(--risk)' }}>{message}</div>}
        <button type="submit" className="btn block" style={{ minHeight: 54 }} disabled={busy || !email.includes('@') || password.length < 6}>{busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}</button>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="link" onClick={() => { setCreating(!creating); setMessage(null) }}>{creating ? 'I have an account' : 'Create an account'}</button>
          {!creating && <button type="button" className="link" disabled={!email.includes('@') || busy} onClick={async () => setMessage(await s.resetPassword(email))}>Forgot password?</button>}
        </div>
      </form>
    </div>
  )
}

export function LoadingScreen({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="center" style={{ textAlign: 'center' }}>
      <div style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
        {!onRetry && <Icon name="sync" size={32} />}
        <div>{text}</div>
        {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  )
}
