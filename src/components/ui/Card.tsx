export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800/80 dark:bg-neutral-900 dark:shadow-none ${className}`}
    >
      {children}
    </div>
  )
}
