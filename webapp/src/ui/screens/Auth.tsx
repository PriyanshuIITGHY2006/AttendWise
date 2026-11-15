import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../data/store'
import { dayPeriodOf, greeting, nowOf } from '../../domain'
import { Segmented } from '../common'
import { SIGNIN_DOODLES } from '../doodle'
import { LoaderScene } from '../LoaderScene'

const base = import.meta.env.BASE_URL
/** The landing page, one level up from the web app. */
export const WEBSITE = `${base.replace(/app\/$/, '')}?landing=1`

const GOOGLE_G = (
  <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

export function AuthScreen() {
  const s = useStore()
  const [creating, setCreating] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [slide, setSlide] = useState(0)
  const [heroH, setHeroH] = useState<number | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = window.setInterval(() => setSlide((i) => (i + 1) % SIGNIN_DOODLES.length), 4200)
    return () => window.clearInterval(t)
  }, [])
  const openEmail = () => {
    // Keep the picture exactly where it is; the form grows below and the page scrolls.
    if (heroRef.current) setHeroH(heroRef.current.offsetHeight)
    setEmailOpen(true)
    window.setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 320)
  }
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  // A failed Google sign-in comes back with the reason in the address.
  const [message, setMessage] = useState<string | null>(() => {
    const m = /[?&#]error_description=([^&]+)/.exec(location.search + location.hash)
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null
  })
  const period = dayPeriodOf(nowOf().time)
  const site = base.replace(/app\/$/, '')

  const go = async () => {
    setBusy(true)
    setMessage(null)
    const err = creating ? await s.signUp(email, password, name) : await s.signIn(email, password)
    setMessage(err)
    setBusy(false)
  }

  return (
    <div className="signin-wrap">
      <div className="signin">
        <div className="signin-hero" ref={heroRef} style={heroH ? { flex: `0 0 ${heroH}px` } : undefined}>
          <div className="signin-art" aria-hidden="true">
            {SIGNIN_DOODLES.map((d, i) => <div key={d.name} className={`signin-slide${i === slide ? ' on' : ''}`} dangerouslySetInnerHTML={{ __html: d.svg }} />)}
          </div>
          <div className="brand"><img src={`${base}favicon.svg`} alt="" />AttendWise</div>
          <a className="signin-back" href={WEBSITE}>Website</a>
        </div>

        <div className="signin-body">
          <div className="caption">{greeting(period, null)}</div>
          <h1 className="h1">Know which classes you can skip.</h1>
          <p className="muted">Attendance, timetable and safe skips in one place. Sign in with the account you use in the Android app.</p>

          <button type="button" className="g-btn" disabled={busy} onClick={() => void s.google()}>{GOOGLE_G}<span>Continue with Google</span></button>

          {message && <div role="status" className="signin-msg">{message}</div>}

          {!emailOpen && <button type="button" className="link signin-alt" onClick={openEmail}>Use email instead</button>}
          <div className={`signin-reveal${emailOpen ? ' open' : ''}`} ref={formRef} aria-hidden={!emailOpen}>
            <div>
              <form className="signin-form" onSubmit={(e) => { e.preventDefault(); if (email.includes('@') && password.length >= 6) void go() }}>
              <div className="signin-or"><span>or with email</span></div>
              <Segmented value={creating ? 'new' : 'in'} options={[['in', 'Sign in'], ['new', 'Create account']]} onChange={(v) => { setCreating(v === 'new'); setMessage(null) }} />
              {creating && <label className="field"><span>Your name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
              <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
              <label className="field"><span>Password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={creating ? 'new-password' : 'current-password'} />{creating && <span>At least 6 characters</span>}</label>
              <button type="submit" className="btn block" style={{ minHeight: 54 }} disabled={busy || !email.includes('@') || password.length < 6}>{busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}</button>
              {!creating && <button type="button" className="link" style={{ justifySelf: 'center' }} disabled={!email.includes('@') || busy} onClick={async () => setMessage(await s.resetPassword(email))}>Forgot password?</button>}
            </form>
            </div>
          </div>

          <p className="small signin-legal">
            By continuing you agree to the <a href={`${site}terms.html`}>terms</a> and the <a href={`${site}privacy.html`}>privacy policy</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

export function LoadingScreen({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="center" style={{ textAlign: 'center' }}>
      <div style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
        {!onRetry && <LoaderScene />}
        <div>{text}</div>
        {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  )
}
