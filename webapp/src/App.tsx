import { useCallback, useEffect, useState } from 'react'
import { StoreProvider, useStore } from './data/store'
import { Icon, type IconName } from './ui/Icon'
import { AuthScreen, LoadingScreen } from './ui/screens/Auth'
import { Calendar } from './ui/screens/Calendar'
import { CourseDetail } from './ui/screens/CourseDetail'
import { CourseEditor } from './ui/screens/CourseEditor'
import { Courses } from './ui/screens/Courses'
import { Onboarding } from './ui/screens/Onboarding'
import { Plan } from './ui/screens/Plan'
import { Profile } from './ui/screens/Profile'
import { Today } from './ui/screens/Today'

const TABS: Array<[string, string, IconName]> = [['today', 'Today', 'today'], ['courses', 'Courses', 'courses'], ['plan', 'Plan', 'plan'], ['calendar', 'Calendar', 'calendar'], ['profile', 'Profile', 'profile']]
const base = import.meta.env.BASE_URL

/** The route is the part of the address after #/, so every screen can be bookmarked. */
function useRoute(): [string, (route: string) => void] {
  const read = () => location.hash.replace(/^#\/?/, '') || 'today'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((r: string) => { location.hash = `/${r}` }, [])
  return [route, go]
}

function Shell() {
  const s = useStore()
  const [route, go] = useRoute()
  const [path, query] = route.split('?')
  const [head, arg] = path.split('/')

  if (s.boot === 'loading') return <LoadingScreen text="Getting your data…" />
  if (s.boot === 'error') return <LoadingScreen text={`Couldn't reach the server. ${s.error ?? ''}`} onRetry={() => void s.reload()} />
  if (s.boot === 'signed_out') return <AuthScreen />
  if (!s.onboarded) return <Onboarding />

  const tab = head === 'course' || head === 'edit' ? 'courses' : head
  let page
  if (head === 'courses') page = <Courses go={go} />
  else if (head === 'course' && arg) page = <CourseDetail courseId={arg} go={go} />
  else if (head === 'edit') page = <div className="page"><h1 className="h1">{arg === 'new' ? 'New course' : 'Edit course'}</h1><CourseEditor courseId={arg === 'new' ? null : arg} onDone={() => go(arg === 'new' ? 'courses' : `course/${arg}`)} onCancel={() => go(arg === 'new' ? 'courses' : `course/${arg}`)} /></div>
  else if (head === 'plan') page = <Plan key={query} preselectToday={query === 'today=1'} />
  else if (head === 'calendar') page = <Calendar />
  else if (head === 'profile') page = <Profile />
  else page = <Today go={go} />

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="brand"><img src={`${base}favicon.svg`} alt="" />AttendWise</div>
        {TABS.map(([key, label, icon]) => (
          <button key={key} type="button" className="nav-item" aria-current={tab === key || (key === 'today' && !TABS.some(([k]) => k === tab)) ? 'page' : undefined} onClick={() => go(key)}>
            <Icon name={icon} size={24} />{label}
          </button>
        ))}
        <div className="grow" />
        <div className="update">Web version. Reminders are in the Android app.</div>
      </nav>
      <main className="content">{page}</main>
      {s.toast && (
        <div className="toast" role="status" key={s.toast.id}>
          <span>{s.toast.text}</span>
          {s.toast.undo && <button className="link" onClick={() => { s.toast?.undo?.(); s.dismissToast() }}>Undo</button>}
          <button className="link" aria-label="Dismiss" onClick={s.dismissToast}>Close</button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
