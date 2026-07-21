import { useEffect, useRef, useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { WelcomeSplash } from "./WelcomeSplash"
import { CommandPalette } from "./CommandPalette"
import { ProductTour } from "./ProductTour"
import { Logomark } from "../ui/Logomark"
import { RevealProvider } from "../../context/RevealContext"
import { useOverallStatus } from "../../features/courses/useOverallStatus"

const SPLASH_FLAG_KEY = "attendwise_just_signed_in"

const STATUS_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
}

function NavItem({ to, label, end, tourId }: { to: string; label: string; end?: boolean; tourId?: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      data-tour={tourId}
      className={({ isActive }) =>
        `whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
          isActive
            ? "bg-indigo-600 text-white shadow-button"
            : "text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`
      }
    >
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

function AccountMenu() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref} data-tour="account-menu">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-[11px] font-semibold text-white shadow-button ring-1 ring-inset ring-white/10 transition-transform active:scale-95"
      >
        {initialsOf(profile?.full_name, profile?.email)}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-xl border border-neutral-200/70 bg-white p-1.5 shadow-elevated dark:border-neutral-800 dark:bg-neutral-900">
          <div className="truncate px-2.5 py-1.5 text-xs text-neutral-500">{profile?.email}</div>
          <NavLink
            to="/settings"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Settings
          </NavLink>
          <button
            onClick={signOut}
            className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function AppLayout() {
  const { profile, hasMaterialAccess } = useAuth()
  const [showSplash, setShowSplash] = useState(() => sessionStorage.getItem(SPLASH_FLAG_KEY) === "1")
  const [ready, setReady] = useState(() => sessionStorage.getItem(SPLASH_FLAG_KEY) !== "1")
  const { courseCount, worstStatus } = useOverallStatus()

  useEffect(() => {
    if (showSplash) sessionStorage.removeItem(SPLASH_FLAG_KEY)
  }, [showSplash])

  function handleSplashDone() {
    setShowSplash(false)
    setReady(true)
  }

  const showTour = !showSplash && !!profile && !profile.has_completed_tour

  return (
    <div className="min-h-screen">
      {showSplash && <WelcomeSplash onDone={handleSplashDone} />}
      {showTour && <ProductTour />}
      <CommandPalette hasMaterialAccess={hasMaterialAccess} />

      <header className="sticky top-0 z-30 border-b border-neutral-200/60 bg-white/70 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3 sm:px-6">
          <div className="mr-3 flex items-center gap-2">
            <Logomark size={26} />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">AttendWise</span>
          </div>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            <NavItem to="/" label="Today" end tourId="nav-today" />
            <NavItem to="/courses" label="Courses" tourId="nav-courses" />
            <NavItem to="/plan" label="Plan a day off" tourId="nav-plan" />
            <NavItem to="/calendar" label="Calendar" tourId="nav-calendar" />
            {hasMaterialAccess && <NavItem to="/materials" label="Materials" />}
          </nav>

          {courseCount !== null && courseCount > 0 && (
            <span className="mr-1 hidden items-center gap-1.5 rounded-full border border-neutral-200/70 bg-white/60 px-2.5 py-1 text-xs font-medium text-neutral-600 shadow-xs md:flex dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[worstStatus]}`} />
              {courseCount} course{courseCount === 1 ? "" : "s"}
            </span>
          )}

          <button
            data-tour="command-palette"
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="mr-2 hidden items-center gap-1.5 rounded-lg border border-neutral-200/70 bg-white/60 px-2.5 py-1.5 text-xs text-neutral-500 shadow-xs transition-colors hover:border-neutral-300 hover:text-neutral-700 sm:flex dark:border-neutral-700 dark:bg-transparent"
          >
            <span>Search</span>
            <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1 font-sans text-[10px] dark:border-neutral-700 dark:bg-neutral-800">⌘K</kbd>
          </button>

          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <RevealProvider value={ready}>
          <Outlet />
        </RevealProvider>
      </main>
    </div>
  )
}
