import { useReveal } from "../../context/RevealContext"

export function Card({
  children,
  className = "",
  index = 0,
}: {
  children: React.ReactNode
  className?: string
  /** Position among sibling cards on the page, used to stagger the entrance transition. */
  index?: number
}) {
  const ready = useReveal()
  return (
    <div
      className={`rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-card transition-all duration-500 ease-out dark:border-neutral-800/80 dark:bg-neutral-900 dark:shadow-none ${
        ready ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      } ${className}`}
      style={{ transitionDelay: ready ? `${Math.min(index, 6) * 80}ms` : "0ms" }}
    >
      {children}
    </div>
  )
}
