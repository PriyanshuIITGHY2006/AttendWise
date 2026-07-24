// Lightweight loading placeholders. A pulsing skeleton reads as "content is
// coming" far more smoothly than a bare "Loading…" line, so these stand in for
// the page while data is fetched.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-neutral-200/70 dark:bg-neutral-800 ${className}`} />
}

// A few card-shaped placeholder rows. Drop this in wherever a page has already
// rendered its own heading and is just waiting on list data.
export function ListSkeleton({ rows = 3, className = "mt-6" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-neutral-200/70 p-4 dark:border-neutral-800/80">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

// A generic page-loading state: a title bar plus a few card-shaped rows. Used
// as the router Suspense fallback and for per-page initial loads so switching
// screens never flashes a jarring text line.
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-2xl">
      <Skeleton className="h-8 w-40" />
      <ListSkeleton rows={rows} />
    </div>
  )
}
