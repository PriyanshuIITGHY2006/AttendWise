import { useEffect, useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { WelcomeSplash } from "./WelcomeSplash"
import { SidebarStatus } from "./SidebarStatus"
import { Logomark } from "../ui/Logomark"
import { RevealProvider } from "../../context/RevealContext"

const SPLASH_FLAG_KEY = "attendwise_just_signed_in"

const ICONS = {
  today: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  courses: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 6.5A2.5 2.5 0 0 1 6.5 4H12v16H6.5A2.5 2.5 0 0 0 4 22.5v-16ZM20 6.5A2.5 2.5 0 0 0 17.5 4H12v16h5.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"
    />
  ),
  calendar: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7 3v3m10-3v3M4.5 8.5h15M6 6h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
    />
  ),
  materials: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 7.5a2 2 0 0 1 2-2h3.379a1 1 0 0 1 .707.293L11.5 7.5H18.25a2 2 0 0 1 2 2v8.25a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2v-10Z"
    />
  ),
  settings: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.5 2.25a6.9 6.9 0 0 1 1.9 1.1l2.2-.7 2.25 3.9-1.75 1.5a7 7 0 0 1 0 2.2l1.75 1.5-2.25 3.9-2.2-.7a6.9 6.9 0 0 1-1.9 1.1l-.5 2.25h-4.5l-.5-2.25a6.9 6.9 0 0 1-1.9-1.1l-2.2.7-2.25-3.9 1.75-1.5a7 7 0 0 1 0-2.2l-1.75-1.5 2.25-3.9 2.2.7a6.9 6.9 0 0 1 1.9-1.1l.5-2.25Z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
}

function NavIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
      {ICONS[name]}
    </svg>
  )
}

function NavItem({ to, label, icon, end }: { to: string; label: string; icon: keyof typeof ICONS; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-indigo-600 text-white"
            : "text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`
      }
    >
      <NavIcon name={icon} />
      {label}
    </NavLink>
  )
}

function initialsOf(name: string | null | undefined, email: string | undefined) {
  const source = name?.trim() || email || "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export function AppLayout() {
  const { profile, hasMaterialAccess, signOut } = useAuth()
  const [showSplash, setShowSplash] = useState(() => sessionStorage.getItem(SPLASH_FLAG_KEY) === "1")
  const [ready, setReady] = useState(() => sessionStorage.getItem(SPLASH_FLAG_KEY) !== "1")

  useEffect(() => {
    if (showSplash) sessionStorage.removeItem(SPLASH_FLAG_KEY)
  }, [showSplash])

  function handleSplashDone() {
    setShowSplash(false)
    setReady(true)
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {showSplash && <WelcomeSplash onDone={handleSplashDone} />}

      <aside className="flex shrink-0 flex-col border-b border-neutral-200 bg-neutral-50/60 px-4 py-4 md:w-60 md:border-b-0 md:border-r md:px-5 md:py-9 dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="mb-5 flex items-center gap-2">
          <Logomark />
          <span className="text-[15px] font-semibold tracking-tight">AttendWise</span>
        </div>

        <div className="mb-6 hidden md:block">
          <SidebarStatus />
        </div>

        <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          <p className="hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 md:block">Overview</p>
          <NavItem to="/" label="Today" icon="today" end />
          <NavItem to="/courses" label="Courses" icon="courses" />
          <NavItem to="/calendar" label="Calendar" icon="calendar" />

          {hasMaterialAccess && (
            <>
              <p className="hidden px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 md:block">
                Shared
              </p>
              <NavItem to="/materials" label="Materials" icon="materials" />
            </>
          )}
        </nav>

        <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800 md:mt-auto">
          <NavItem to="/settings" label="Settings" icon="settings" />
          <div className="mt-3 hidden items-center gap-2.5 px-1 md:flex">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              {initialsOf(profile?.full_name, profile?.email)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs text-neutral-500">{profile?.email}</div>
              <button onClick={signOut} className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 px-4 py-6 md:px-10 md:py-9">
        <RevealProvider value={ready}>
          <Outlet />
        </RevealProvider>
      </main>
    </div>
  )
}
