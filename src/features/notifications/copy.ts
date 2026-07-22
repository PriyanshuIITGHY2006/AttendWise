// The "bunkmate" voice: witty, deadpan, never actually mean. Every message
// still carries the real number/date -- the joke is on top of the fact,
// not instead of it. Variants are picked deterministically from a seed
// (not Math.random()) so the same event shows the same line all day
// instead of flickering on every re-render.
//
// Every function takes a trailing `plain` flag. When the user sets their
// notification voice to "Plain" in Settings, we return a straight,
// no-jokes version of the same fact instead of the roast.
function pick<T>(variants: T[], seed: string): T {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return variants[hash % variants.length]
}

export function thresholdRoast(
  courseName: string,
  percent: number,
  status: "red" | "yellow",
  seed: string,
  plain = false,
): string {
  const pct = percent.toFixed(0)
  if (plain) {
    return status === "red"
      ? `${courseName} is at ${pct}%, below your required attendance. Try not to miss the next classes.`
      : `${courseName} is at ${pct}% with no safe skips left. Attend the upcoming classes to stay above the requirement.`
  }
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

export function unmarkedNudge(count: number, seed: string, plain = false): string {
  const n = count === 1 ? "class" : "classes"
  if (plain) return `You have ${count} unmarked ${n} from earlier. Mark them to keep your attendance accurate.`
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

export function plannedSkipReminder(courseName: string, seed: string, plain = false): string {
  if (plain) return `Reminder: you planned to skip ${courseName} tomorrow.`
  return pick(
    [
      `Reminder: you're planning to skip ${courseName} tomorrow. Last call to back out like a responsible adult.`,
      `Tomorrow: skipping ${courseName}, allegedly. Still feeling brave?`,
      `${courseName} tomorrow — you already told the app you're not going. No judgment. Some judgment.`,
    ],
    seed,
  )
}

export function classStartingSoon(courseName: string, minutes: number, seed: string, plain = false): string {
  if (plain) return `${courseName} starts in ${minutes} min.`
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

export function quizReminder(title: string, courseName: string, days: number, seed: string, plain = false): string {
  const d = days === 1 ? "day" : "days"
  if (plain) return `${title} (${courseName}) is in ${days} ${d}.`
  return pick(
    [
      `${title} (${courseName}) is ${days} ${d} away. Hope "starting tonight" energy holds up.`,
      `${days} ${d} until ${title} in ${courseName}. The syllabus isn't going to read itself.`,
      `${title} looms in ${days} ${d}. ${courseName} said good luck, you'll need it.`,
    ],
    seed,
  )
}

export function recoveryDayReminder(courseName: string, seed: string, plain = false): string {
  if (plain) return `${courseName} meets today — attending helps recover your attendance.`
  return pick(
    [
      `${courseName} needs you today. This is a rescue mission, not a side quest.`,
      `Recovery mode: ${courseName}. Showing up today is non-negotiable.`,
      `Today's ${courseName} class is doing CPR on your attendance. Be there.`,
    ],
    seed,
  )
}

// Morning nudge fired daily at the user's chosen digest time. It is a repeating
// notification with a fixed body, so it stays generic (no per-day counts, which
// would go stale) -- it just points the user back into the app to check and mark.
export function dailyDigest(seed: string, plain = false): string {
  if (plain) return "Good morning. Open AttendWise to check today's classes and mark attendance."
  return pick(
    [
      "Good morning. Today's classes are waiting to be marked present (optimistically).",
      "Rise and grind. Check today's lineup before it checks you.",
      "New day, fresh attendance to protect. Open up and take a look.",
      "Morning roll call: peek at today's classes so nothing sneaks past unmarked.",
    ],
    seed,
  )
}

export function weeklyDigest(atRiskCount: number, quizCount: number, seed: string, plain = false): string {
  if (atRiskCount === 0 && quizCount === 0) {
    if (plain) return "All courses are above their attendance requirement and nothing is due this week."
    return pick(["All courses green, nothing due this week. Suspiciously well-behaved of you.", "Clean week ahead. Enjoy it, it won't last."], seed)
  }
  const parts: string[] = []
  if (atRiskCount > 0) parts.push(`${atRiskCount} course${atRiskCount === 1 ? "" : "s"} need${atRiskCount === 1 ? "s" : ""} attention`)
  if (quizCount > 0) parts.push(`${quizCount} quiz${quizCount === 1 ? "" : "zes"} incoming`)
  return `This week: ${parts.join(", ")}.${plain ? "" : " No pressure."}`
}
