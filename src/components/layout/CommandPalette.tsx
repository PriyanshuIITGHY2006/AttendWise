import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { listCourses, type Course } from "../../features/courses/api"

type Item = { id: string; label: string; hint?: string; color?: string; go: () => void }

export function CommandPalette({ hasMaterialAccess }: { hasMaterialAccess: boolean }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [courses, setCourses] = useState<Course[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKeydown)
    return () => document.removeEventListener("keydown", handleKeydown)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 10)
      if (user) listCourses(user.id).then(setCourses)
    }
  }, [open, user])

  const items = useMemo<Item[]>(() => {
    const nav: Item[] = [
      { id: "nav-today", label: "Today", hint: "Go to", go: () => navigate("/") },
      { id: "nav-timetable", label: "Timetable", hint: "Go to", go: () => navigate("/timetable") },
      { id: "nav-courses", label: "Courses", hint: "Go to", go: () => navigate("/courses") },
      { id: "nav-new-course", label: "Add course", hint: "Action", go: () => navigate("/courses/new") },
      { id: "nav-plan", label: "Plan a day off", hint: "Go to", go: () => navigate("/plan") },
      { id: "nav-insights", label: "Insights", hint: "Go to", go: () => navigate("/insights") },
      { id: "nav-calendar", label: "Calendar", hint: "Go to", go: () => navigate("/calendar") },
      ...(hasMaterialAccess ? [{ id: "nav-materials", label: "Materials", hint: "Go to", go: () => navigate("/materials") }] : []),
      { id: "nav-settings", label: "Settings", hint: "Go to", go: () => navigate("/settings") },
    ]
    const courseItems: Item[] = courses.map((c) => ({
      id: `course-${c.id}`,
      label: c.name,
      hint: "Course",
      color: c.color,
      go: () => navigate(`/courses/${c.id}`),
    }))
    const all = [...nav, ...courseItems]
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter((i) => i.label.toLowerCase().includes(q))
  }, [courses, hasMaterialAccess, navigate, query])

  function select(item: Item) {
    item.go()
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && items[activeIndex]) {
      e.preventDefault()
      select(items[activeIndex])
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-950/50 pt-[15vh]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Jump to a page or course…"
          className="w-full border-b border-neutral-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-neutral-800"
        />
        <div className="max-h-72 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-neutral-400">No matches</p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.id}
                onClick={() => select(item)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                  i === activeIndex ? "bg-indigo-600 text-white" : "text-neutral-700 dark:text-neutral-200"
                }`}
              >
                <span className="flex items-center gap-2">
                  {item.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
                  {item.label}
                </span>
                <span className={`text-xs ${i === activeIndex ? "text-indigo-100" : "text-neutral-400"}`}>{item.hint}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
