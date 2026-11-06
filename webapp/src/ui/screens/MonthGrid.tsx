import type { ReactNode } from 'react'
import { addDays, MONTH_LONG, weekdayOf, type DateStr } from '../../domain'

export const monthKey = (y: number, m: number): string => `${y}-${String(m).padStart(2, '0')}`
export const shiftMonth = (ym: string, by: number): string => {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + by
  return monthKey(Math.floor(t / 12), (t % 12) + 1)
}
export const monthTitle = (ym: string, withYear = false): string => {
  const [y, m] = ym.split('-').map(Number)
  return MONTH_LONG[m - 1] + (withYear ? ` ${y}` : '')
}
export const monthOf = (d: DateStr): string => d.slice(0, 7)

/** A month as a Monday-first grid. [cell] draws one date. */
export function MonthGrid({ month, cell }: { month: string; cell: (date: DateStr) => ReactNode }) {
  const first = `${month}-01`
  const lead = weekdayOf(first) - 1
  const [y, m] = month.split('-').map(Number)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: ReactNode[] = []
  for (let i = 0; i < lead; i++) cells.push(<div key={`e${i}`} className="day empty" />)
  for (let i = 0; i < days; i++) cells.push(<div key={i} style={{ display: 'contents' }}>{cell(addDays(first, i))}</div>)
  return (
    <div className="month">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => <div key={n} className="dow">{n}</div>)}
      {cells}
    </div>
  )
}
