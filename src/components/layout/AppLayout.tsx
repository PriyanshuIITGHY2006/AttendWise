import { useEffect, useRef, useState, type ComponentType } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { WelcomeSplash } from "./WelcomeSplash"
import { CommandPalette } from "./CommandPalette"
import { ProductTour } from "./ProductTour"
import { Logomark } from "../ui/Logomark"
import { RevealProvider } from "../../context/RevealContext"
import { useOverallStatus } from "../../features/courses/useOverallStatus"
import { useNotificationActions } from "../../features/notifications/useNotificationActions"
import { TodayIcon, CoursesIcon, PlanIcon, CalendarIcon, MaterialsIcon } from "./navIcons"

const SPLASH_FLAG_KEY = "attendwise_just_signed_in"

const STATUS_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
}

type NavEntry = {
  to: string
  label: string
  shortLabel: string
  end?: boolean
  tourId?: string
  icon: ComponentType<{ className?: string }>
}

const NAV: NavEntry[] = [
  { to: "/", label: "Today", shortLabel: "Today", end: true, tourId: "nav-today", icon: TodayIcon },
  { to: "/courses", label: "Courses", shortLabel: "Courses", tourId: "nav-courses", icon: CoursesIcon },
  { to: "/plan", label: "Plan a day off", shortLabel: "Plan", tourId: "nav-plan", icon: PlanIcon },
  { to: "/calendar", label: "Calendar", shortLabel: "Calendar", tourId: "nav-calendar", icon: CalendarIcon },
]

const MATERIALS_ENTRY: NavEntry = { to: "/materials", label: "Materials", shortLabel: "Files", icon: MaterialsIcon }

function TopNavItem({ entry }: { entry: NavEntry }) {
  return (
    <NavLink
      to={entry.to}
      end={entry.end}
      className={({ isActive }) =>
        `whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
          isActive
            ? "bg-indigo-600 text-white shadow-button"
            : "text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`
      }
    >
      {entry.label}
    </NavLink>
  )
}

function BottomNavItem({ entry }: { entry: NavEntry }) {
  const Icon = entry.icon
  return (
    <NavLink
      to={entry.to}
      end={entry.end}
      data-tour={entry.tourId}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors ${
          isActive ? "text-indigo-600" : "text-neutral-400 hover:text-neutral-600"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-8 w-full max-w-[3.5rem] items-center justify-center rounded-full transition-colors ${
              isActive ? "bg-indigo-50" : ""
            }`}
          >
            <Icon className="h-5 w-5" />
          </span>
          {entry.shortLabel}
        </>
      )}
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
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  useNotificationActions(profile?.id)

  useEffect(() => {
    if (showSplash) sessionStorage.removeItem(SPLASH_FLAG_KEY)
  }, [showSplash])

  // <main> is now the scroll container (not the document), and it stays mounted
  // across route changes -- so reset it to the top on navigation, the way a
  // fresh page load used to.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  function handleSplashDone() {
    setShowSplash(false)
    setReady(true)
  }

  const showTour = !showSplash && !!profile && !profile.has_completed_tour
  const navEntries = hasMaterialAccess ? [...NAV, MATERIALS_ENTRY] : NAV

  return (
    <div className="app-shell flex flex-col">
      {showSplash && <WelcomeSplash onDone={handleSplashDone} />}
      {showTour && <ProductTour />}
      <CommandPalette hasMaterialAccess={hasMaterialAccess} />

      {/* pt uses the device's safe-area inset so content clears the status bar /
          notch on phones (viewport-fit=cover draws under it) */}
      <header
        className="shrink-0 z-30 border-b border-neutral-200/60 bg-white/70 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-950/80"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 sm:mr-3">
            <Logomark size={26} />
            <span className="text-[15px] font-semibold tracking-tight">AttendWise</span>
          </div>

          {/* desktop nav -- on mobile this is replaced by the bottom tab bar */}
          <nav className="ml-2 hidden flex-1 items-center gap-1 sm:flex">
            {navEntries.map((entry) => (
              <TopNavItem key={entry.to} entry={entry} />
            ))}
          </nav>

          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
            {courseCount !== null && courseCount > 0 && (
              <span className="hidden items-center gap-1.5 rounded-full border border-neutral-200/70 bg-white/60 px-2.5 py-1 text-xs font-medium text-neutral-600 shadow-xs md:flex dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[worstStatus]}`} />
                {courseCount} course{courseCount === 1 ? "" : "s"}
              </span>
            )}

            <button
              data-tour="command-palette"
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="hidden items-center gap-1.5 rounded-lg border border-neutral-200/70 bg-white/60 px-2.5 py-1.5 text-xs text-neutral-500 shadow-xs transition-colors hover:border-neutral-300 hover:text-neutral-700 sm:flex dark:border-neutral-700 dark:bg-transparent"
            >
              <span>Search</span>
              <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1 font-sans text-[10px] dark:border-neutral-700 dark:bg-neutral-800">⌘K</kbd>
            </button>

            <AccountMenu />
          </div>
        </div>
      </header>

      {/* the only scroll region -- header and bottom bar sit outside it, so they
          stay put no matter how the list scrolls */}
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:px-6">
          <RevealProvider value={ready}>
            <Outlet />
          </RevealProvider>
        </div>
      </main>

      {/* mobile bottom tab bar -- a flex sibling of <main>, not position:fixed,
          so it is physically anchored to the bottom of the shell */}
      <nav
        className="shrink-0 border-t border-neutral-200/70 bg-white/85 backdrop-blur-xl sm:hidden dark:border-neutral-800 dark:bg-neutral-950/85"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-md items-stretch gap-1 px-2 py-1.5">
          {navEntries.map((entry) => (
            <BottomNavItem key={entry.to} entry={entry} />
          ))}
        </div>
      </nav>
    </div>
  )
}
