import { NavLink, Outlet } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { WelcomeSplash } from "./WelcomeSplash"
import { Logomark } from "../ui/Logomark"

const ICONS = {
  today: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  ),
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

export function AppLayout() {
  const { profile, hasMaterialAccess, signOut } = useAuth()
  const navItems: { to: string; label: string; icon: keyof typeof ICONS; end?: boolean }[] = [
    { to: "/", label: "Today", icon: "today", end: true },
    { to: "/courses", label: "Courses", icon: "courses" },
    { to: "/calendar", label: "Calendar", icon: "calendar" },
    ...(hasMaterialAccess ? [{ to: "/materials", label: "Materials", icon: "materials" as const }] : []),
    { to: "/settings", label: "Settings", icon: "settings" },
  ]

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <WelcomeSplash />
      <aside className="flex shrink-0 flex-col border-b border-neutral-200 bg-neutral-50/60 px-4 py-4 md:w-56 md:border-b-0 md:border-r md:px-5 md:py-9 dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="mb-7 flex items-center gap-2">
          <Logomark />
          <span className="text-[15px] font-semibold tracking-tight">AttendWise</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-600 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`
              }
            >
              <NavIcon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden pt-6 md:block">
          <div className="truncate text-xs text-neutral-500">{profile?.email}</div>
          <button
            onClick={signOut}
            className="mt-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-10 md:py-9">
        <Outlet />
      </main>
    </div>
  )
}
