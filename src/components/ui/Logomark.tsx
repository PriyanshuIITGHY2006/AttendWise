export function Logomark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0 rounded-[7px]">
      <rect width="48" height="48" rx="10" fill="#4f46e5" />
      <path d="M14 25.5L20.5 32L34 17" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}
