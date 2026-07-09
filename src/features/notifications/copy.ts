// The "bunkmate" voice: witty, deadpan, never actually mean. Every message
// still carries the real number/date -- the joke is on top of the fact,
// not instead of it. Variants are picked deterministically from a seed
// (not Math.random()) so the same event shows the same line all day
// instead of flickering on every re-render.
function pick<T>(variants: T[], seed: string): T {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return variants[hash % variants.length]
}

export function thresholdRoast(courseName: string, percent: number, status: "red" | "yellow", seed: string): string {
  const pct = percent.toFixed(0)
  if (status === "red") {
    return pick(
      [
        `You are not making it, son, for ${courseName}. ${pct}% and dropping.`,
        `${courseName} attendance is in the ICU at ${pct}%. Might be time to email the professor your best sob story.`,
        `${courseName}: ${pct}%. Even the attendance register has trust issues with you now.`,
        `Red alert on ${courseName}. One more skip and you're the case study in the department's next meeting.`,
        `${courseName} is circling the drain at ${pct}%. Show your face before it becomes a "who?" situation.`,
        `${pct}% in ${courseName}. At this rate your professor's contact card should just say "stranger."`,
      ],
      seed,
    )
  }
  return pick(
    [
      `${courseName} is at ${pct}% with zero skips left. One bad day from a very bad time.`,
      `${courseName}: walking a tightrope, no net, ${pct}%. Choose your next skip very, very wisely.`,
      `You've officially run out of "next class se aa jaunga" for ${courseName}.`,
      `${pct}% in ${courseName}. The margin is now theoretical.`,
    ],
    seed,
  )
}

export function unmarkedNudge(count: number, seed: string): string {
  const n = count === 1 ? "class" : "classes"
  return pick(
    [
      `${count} ${n} from earlier are floating in limbo, unmarked. Schrödinger's attendance.`,
      `${count} unmarked ${n} sitting there. The app is assuming the worst about your day.`,
      `${count} ${n} still unmarked — mark them before they quietly wreck your safe-skip count.`,
      `Your attendance has ${count} unsolved mysteries. Handle it.`,
    ],
    seed,
  )
}

export function plannedSkipReminder(courseName: string, seed: string): string {
  return pick(
    [
      `Reminder: you're planning to skip ${courseName} tomorrow. Last call to back out like a responsible adult.`,
      `Tomorrow: skipping ${courseName}, allegedly. Still feeling brave?`,
      `${courseName} tomorrow — you already told the app you're not going. No judgment. Some judgment.`,
    ],
    seed,
  )
}

export function classStartingSoon(courseName: string, minutes: number, seed: string): string {
  return pick(
    [
      `${courseName} starts in ${minutes} min. Bed is not a lecture hall, unfortunately.`,
      `${minutes} minutes to ${courseName}. Time to pretend you did the reading.`,
      `${courseName} in ${minutes}. Moving. Now. Not later.`,
      `T-minus ${minutes} min to ${courseName}. This is not a drill.`,
    ],
    seed,
  )
}

export function quizReminder(title: string, courseName: string, days: number, seed: string): string {
  const d = days === 1 ? "day" : "days"
  return pick(
    [
      `${title} (${courseName}) is ${days} ${d} away. Hope "starting tonight" energy holds up.`,
      `${days} ${d} until ${title} in ${courseName}. The syllabus isn't going to read itself.`,
      `${title} looms in ${days} ${d}. ${courseName} said good luck, you'll need it.`,
    ],
    seed,
  )
}

export function recoveryDayReminder(courseName: string, seed: string): string {
  return pick(
    [
      `${courseName} needs you today. This is a rescue mission, not a side quest.`,
      `Recovery mode: ${courseName}. Showing up today is non-negotiable.`,
      `Today's ${courseName} class is doing CPR on your attendance. Be there.`,
    ],
    seed,
  )
}

export function weeklyDigest(atRiskCount: number, quizCount: number, seed: string): string {
  if (atRiskCount === 0 && quizCount === 0) {
    return pick(["All courses green, nothing due this week. Suspiciously well-behaved of you.", "Clean week ahead. Enjoy it, it won't last."], seed)
  }
  const parts: string[] = []
  if (atRiskCount > 0) parts.push(`${atRiskCount} course${atRiskCount === 1 ? "" : "s"} need${atRiskCount === 1 ? "s" : ""} attention`)
  if (quizCount > 0) parts.push(`${quizCount} quiz${quizCount === 1 ? "" : "zes"} incoming`)
  return `This week: ${parts.join(", ")}. No pressure.`
}
