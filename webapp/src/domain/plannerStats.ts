import { stats, type AttendanceCounts, type AttendanceStats } from './attendance'
import type { Course } from './model'

export const courseStatsFrom = (counts: AttendanceCounts, course: Course): AttendanceStats =>
  stats(counts, course.thresholdPercent, course.strictNoSkip)
