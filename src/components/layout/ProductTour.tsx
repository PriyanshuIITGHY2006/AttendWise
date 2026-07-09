import { useLayoutEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { Button } from "../ui/Button"

type Step = {
  target: string | null
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    target: null,
    title: "Welcome to AttendWise",
    body: "Track attendance across every course and know exactly how many classes you can safely skip. Here's a 30-second look around.",
  },
  {
    target: '[data-tour="nav-today"]',
    title: "Today",
    body: "Every class you have today, in one place. Mark yourself present or absent with a tap.",
  },
  {
    target: '[data-tour="nav-courses"]',
    title: "Courses",
    body: "Add each course with its weekly schedule and attendance criterion — the app builds the rest of the semester's sessions automatically.",
  },
  {
    target: '[data-tour="nav-plan"]',
    title: "Plan a day off",
    body: "Pick a date, or a range for a trip, and see the verdict across every course at once instead of checking each one separately.",
  },
  {
    target: '[data-tour="nav-calendar"]',
    title: "Institute calendar",
    body: "Holidays and exam weeks are already loaded — classes are never generated on those days.",
  },
  {
    target: '[data-tour="command-palette"]',
    title: "Quick jump",
    body: "Press ⌘K (or Ctrl+K) anytime to jump straight to any page or course by typing.",
  },
  {
    target: '[data-tour="account-menu"]',
    title: "Your account",
    body: "Settings and sign out live here.",
  },
  {
    target: null,
    title: "That's it",
    body: "Add your first course to start tracking attendance.",
  },
]

function isVisible(el: Element | null): el is HTMLElement {
  return !!el && el instanceof HTMLElement && el.offsetParent !== null
}

export function ProductTour() {
  const { completeTour } = useAuth()
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const step = STEPS[stepIndex]

  useLayoutEffect(() => {
    function measure() {
      if (!step.target) {
        setRect(null)
        return
      }
      const el = document.querySelector(step.target)
      setRect(isVisible(el) ? el.getBoundingClientRect() : null)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [step.target])

  function advance(delta: 1 | -1) {
    let next = stepIndex + delta
    // skip steps whose target isn't on screen (e.g. hidden on small viewports)
    while (next > 0 && next < STEPS.length - 1) {
      const target = STEPS[next].target
      if (!target || isVisible(document.querySelector(target))) break
      next += delta
    }
    if (next < 0) return
    if (next >= STEPS.length) {
      finish()
      return
    }
    setStepIndex(next)
  }

  async function finish() {
    await completeTour()
  }

  async function finishAndAddCourse() {
    await completeTour()
    navigate("/courses/new")
  }

  const isLast = stepIndex === STEPS.length - 1
  const isFirst = stepIndex === 0

  const tooltipStyle: React.CSSProperties = rect
    ? {
        top: Math.min(rect.bottom + 12, window.innerHeight - 220),
        left: Math.min(Math.max(rect.left, 16), window.innerWidth - 336),
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      }

  return (
    <div className="fixed inset-0 z-40" onKeyDown={(e) => e.key === "Escape" && finish()}>
      <div className="absolute inset-0 bg-neutral-950/60" onClick={finish} />

      {rect && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-indigo-400 ring-offset-2 ring-offset-neutral-950/60 transition-all duration-300"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}

      <div
        className="absolute w-80 rounded-xl border border-neutral-200 bg-white p-4 shadow-xl transition-all duration-300"
        style={tooltipStyle}
      >
        <p className="text-xs font-medium text-neutral-400">
          {stepIndex + 1} / {STEPS.length}
        </p>
        <h3 className="mt-1 font-semibold tracking-tight">{step.title}</h3>
        <p className="mt-1.5 text-sm text-neutral-600">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <button onClick={finish} className="text-sm font-medium text-neutral-400 hover:text-neutral-600">
            Skip tour
          </button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button variant="secondary" onClick={() => advance(-1)}>
                Back
              </Button>
            )}
            {isLast ? (
              <Button onClick={finishAndAddCourse}>Add my first course</Button>
            ) : (
              <Button onClick={() => advance(1)}>Next</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
