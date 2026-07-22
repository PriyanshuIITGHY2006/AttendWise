// Minimal stroke icons for the nav -- inline SVG keeps them dependency-free and
// they inherit currentColor so the active/inactive states come for free.
type IconProps = { className?: string }

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

export function TodayIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M9 11l2.5 2.5L16 8" />
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9h18" />
    </svg>
  )
}

export function CoursesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12 6.5c-1.6-1.2-3.8-1.5-6-1.5-.6 0-1 .4-1 1v11c0 .6.4 1 1 1 2.2 0 4.4.3 6 1.5" />
      <path d="M12 6.5c1.6-1.2 3.8-1.5 6-1.5.6 0 1 .4 1 1v11c0 .6-.4 1-1 1-2.2 0-4.4.3-6 1.5" />
      <path d="M12 6.5V20" />
    </svg>
  )
}

export function PlanIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  )
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 3v3M16 3v3" />
      <path d="M7.5 13h.01M12 13h.01M16.5 13h.01M7.5 16.5h.01M12 16.5h.01" />
    </svg>
  )
}

export function TimetableIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M9 9.5V20.5M15 9.5V20.5" />
    </svg>
  )
}

export function InsightsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 19V5M20 19H4" />
      <path d="M7.5 16l3-4 3 2.5L18 8" />
    </svg>
  )
}

export function MaterialsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
    </svg>
  )
}
