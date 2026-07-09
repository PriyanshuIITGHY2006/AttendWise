import { NavLink, Outlet } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"

const baseNavItems = [
  { to: "/", label: "Today", end: true },
  { to: "/courses", label: "Courses" },
  { to: "/settings", label: "Settings" },
]

export function AppLayout() {
  const { profile, hasMaterialAccess, signOut } = useAuth()
  const navItems = hasMaterialAccess
    ? [...baseNavItems.slice(0, 2), { to: "/materials", label: "Materials" }, baseNavItems[2]]
    : baseNavItems

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-neutral-200 px-4 py-4 md:w-56 md:border-b-0 md:border-r md:px-5 md:py-6 dark:border-neutral-800">
        <div className="mb-6 text-lg font-semibold tracking-tight">AttendWise</div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`
              }
            >
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
      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}
