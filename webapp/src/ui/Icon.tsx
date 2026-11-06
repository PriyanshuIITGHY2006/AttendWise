import { ICONS } from './icons'

export type IconName = 'today' | 'courses' | 'plan' | 'calendar' | 'profile' | 'swap' | 'check' | 'close' | 'alert' | 'lock' | 'add' | 'edit' | 'back' | 'chevron_right' | 'sync'

export function Icon({ name, size = 24, label }: { name: IconName; size?: number; label?: string }) {
  const icon = ICONS[name]
  return (
    <svg viewBox={`0 0 ${icon.vp} ${icon.vp}`} width={size} height={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false" style={{ flex: 'none' }}>
      {icon.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ? 'currentColor' : 'none'} stroke={p.stroke ? 'currentColor' : undefined} strokeWidth={p.stroke ? p.w : undefined} strokeLinecap={p.stroke ? (p.cap as 'round') : undefined} strokeLinejoin={p.stroke ? (p.join as 'round') : undefined} />
      ))}
    </svg>
  )
}
