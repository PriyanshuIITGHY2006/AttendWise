// Notification copy. Three voices, chosen in Settings:
//   - "roast"      : the deadpan "bunkmate" -- witty, never actually mean.
//   - "plain"      : straight facts, no jokes.
//   - "kuchupuchu" : clingy-cute Hinglish bestie who calls you kuchupuchu and
//                    will absolutely guilt-trip you into class 🥺
// Every message still carries the real number/date -- the joke rides on top of
// the fact, not instead of it. Variants are picked deterministically from a
// seed (not Math.random()) so the same event shows the same line all day
// instead of flickering on every re-render.
import type { HumorLevel } from "./api"

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
  voice: HumorLevel = "roast",
): string {
  const pct = percent.toFixed(0)
  if (voice === "plain") {
    return status === "red"
      ? `${courseName} is at ${pct}%, below your required attendance. Try not to miss the next classes.`
      : `${courseName} is at ${pct}% with no safe skips left. Attend the upcoming classes to stay above the requirement.`
  }
  if (voice === "kuchupuchu") {
    if (status === "red") {
      return pick(
        [
          `Kuchupuchu 😭 ${courseName} sirf ${pct}% pe hai. Ab to jaana hi padega jaan`,
          `Meri jaan ${courseName} ${pct}% 🚨 kuchupuchu attendance ro rahi hai, sambhaalo`,
          `Kuchupuchu ${courseName} ${pct}%?! itni bunk?? mujhse zyada classes miss kar di 🥲`,
          `${pct}% in ${courseName} 💔 kuchupuchu ab ek bhi class miss ki to main rooth jaungi`,
          `Kuchupuchu red zone! ${courseName} ${pct}%. Professor tumhe dhoondh raha hai 👀`,
          `${courseName} ${pct}% pe 😰 kuchupuchu please attend karlo na, mere liye`,
          `Oye kuchupuchu ${pct}%?! ${courseName} ki attendance ICU me hai 🏥`,
          `${courseName} ${pct}% 🙃 kuchupuchu ab excuses khatam, class shuru`,
          `Kuchupuchu ${pct}% matlab pura danger 🆘 ${courseName} tumhe miss kar rahi hai (sach me)`,
          `Meri jaan ${courseName} ${pct}% 🚑 kuchupuchu ab har class must hai, samjhe?`,
        ],
        seed,
      )
    }
    return pick(
      [
        `Kuchupuchu ${courseName} ${pct}%, ab koi skip nahi bacha 😬 sambhal ke chalo`,
        `${courseName} ${pct}% 🟡 kuchupuchu ek galti aur, aur hum gaye`,
        `Kuchupuchu tightrope pe ho ${courseName} ${pct}% 🎪 agla bunk soch samajh ke`,
        `${pct}% in ${courseName} 😅 kuchupuchu "next class se aaunga" ab nahi chalega`,
        `Kuchupuchu ${courseName} ${pct}%, margin khatam 🫠 next class must hai`,
        `${courseName} ${pct}% 🥵 kuchupuchu ab har class important hai, dhyaan se`,
        `Kuchupuchu yellow alert 🟨 ${courseName} ${pct}%. Safe skips = 0. Attend karo`,
        `${pct}% ${courseName} 😐 kuchupuchu ab bunk ka budget zero. Chalo`,
      ],
      seed,
    )
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

export function unmarkedNudge(count: number, seed: string, voice: HumorLevel = "roast"): string {
  const n = count === 1 ? "class" : "classes"
  if (voice === "plain") return `You have ${count} unmarked ${n} from earlier. Mark them to keep your attendance accurate.`
  if (voice === "kuchupuchu") {
    return pick(
      [
        `Kuchupuchu ${count} ${n} unmarked pade hain 🥺 mark kardo na please`,
        `Oye kuchupuchu ${count} ${n} ka attendance mark karna bhool gaye 😴 karlo`,
        `${count} ${n} limbo me 👻 kuchupuchu inko present/absent bata do`,
        `Kuchupuchu ${count} unmarked ${n} 🫣 app confuse ho raha hai, help karo`,
        `${count} ${n} abhi tak unmarked 🙈 kuchupuchu 2 second lagega, karlo`,
        `Kuchupuchu tumhare ${count} ${n} ka status pending hai ⏳ mark it jaan`,
        `${count} ${n} chup chaap unmarked 😤 kuchupuchu inhe ignore mat karo`,
        `Kuchupuchu ${count} ${n} reh gaye 📝 jaldi mark karo warna safe-skip bigad jayega`,
        `Psst kuchupuchu 👀 ${count} ${n} mark hone ka intezaar kar rahe hain`,
        `${count} ${n} = ${count} chhote raaz 🕵️ kuchupuchu solve karo`,
      ],
      seed,
    )
  }
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

export function plannedSkipReminder(courseName: string, seed: string, voice: HumorLevel = "roast"): string {
  if (voice === "plain") return `Reminder: you planned to skip ${courseName} tomorrow.`
  if (voice === "kuchupuchu") {
    return pick(
      [
        `Kuchupuchu kal ${courseName} bunk karne wale ho na? 🥲 last chance, soch lo`,
        `Oye kuchupuchu 👀 kal ${courseName} skip? sach me? mujhe chhod ke?`,
        `Kal ${courseName} bunk plan hai kuchupuchu 😏 abhi bhi time hai sudhrne ka`,
        `Kuchupuchu ${courseName} kal skip karoge to attendance rooth jayegi 💔`,
        `Kal ${courseName} nahi jaa rahe kuchupuchu? 🫣 bold move, main dekh rahi hu`,
        `Kuchupuchu reminder: kal ${courseName} skip. No judgment... thoda judgment 🙃`,
        `Kal ${courseName} bunk kuchupuchu 😌 confirm? ya mood badla?`,
        `Kuchupuchu tumne kal ${courseName} skip karne ka bola tha 🐣 pakka na?`,
      ],
      seed,
    )
  }
  return pick(
    [
      `Reminder: you're planning to skip ${courseName} tomorrow. Last call to back out like a responsible adult.`,
      `Tomorrow: skipping ${courseName}, allegedly. Still feeling brave?`,
      `${courseName} tomorrow — you already told the app you're not going. No judgment. Some judgment.`,
    ],
    seed,
  )
}

export function classStartingSoon(courseName: string, minutes: number, seed: string, voice: HumorLevel = "roast"): string {
  if (voice === "plain") return `${courseName} starts in ${minutes} min.`
  if (voice === "kuchupuchu") {
    return pick(
      [
        `Kuchupuchu tum kaha ho?? ${courseName} ${minutes} min me start ho raha hai 🥺`,
        `Oye kuchupuchu 👀 ${courseName} start hone wala hai, sirf ${minutes} min bache. Chalo chalo!`,
        `${minutes} minute me ${courseName} 🫣 kuchupuchu jaldi uth jao na please`,
        `Kuchupuchu... class bula rahi hai. ${courseName} in ${minutes} min. Aa jao 🥹`,
        `Meri jaan ${courseName} ${minutes} min me shuru 💕 kuchupuchu late mat hona`,
        `Kuchupuchu 🐣 ${minutes} min aur phir ${courseName}. Bag utha lo!`,
        `${courseName} ${minutes} min me 😤 kuchupuchu bed chhodo, mujhe nahi`,
        `Psst kuchupuchu 🤫 ${courseName} ${minutes} min door hai. Bhaago!`,
        `Kuchupuchu tumhari ${courseName} ${minutes} min me hai, main yaad dila rahi hu 🥰`,
        `${minutes} min to ${courseName} ⏰ kuchupuchu apni present dilwane chalo`,
      ],
      seed,
    )
  }
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

export function quizReminder(title: string, courseName: string, days: number, seed: string, voice: HumorLevel = "roast"): string {
  // "today" / "tomorrow" / "in N days" reads better than "0 days away".
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`
  const whenHi = days <= 0 ? "aaj" : days === 1 ? "kal" : `${days} din me`
  if (voice === "plain") return `${title} (${courseName}) is ${days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}.`
  if (voice === "kuchupuchu") {
    return pick(
      [
        `Kuchupuchu ${title} (${courseName}) ${whenHi} hai 😨 padhai shuru?`,
        `${title} ${whenHi} 📚 kuchupuchu syllabus khud nahi padhega, chalo`,
        `Kuchupuchu ${title} ${whenHi} hai 🫠 ${courseName} bol raha hai all the best`,
        `${title} (${courseName}) ${whenHi} 🥹 kuchupuchu "aaj raat se" wali energy laao`,
        `Kuchupuchu ${title} ${whenHi} 📖 ${courseName} ki taiyari ho gayi?`,
        `${title} ${whenHi} 😬 kuchupuchu notes khol lo na please`,
        `Kuchupuchu ${title} sar pe hai (${whenHi}) 📖 ${courseName} thoda padhlo`,
        `${title} ${whenHi} 🚀 kuchupuchu ab procrastination band, padhai on`,
      ],
      seed,
    )
  }
  return pick(
    [
      `${title} (${courseName}) is ${when}. Hope "starting tonight" energy holds up.`,
      `${title} in ${courseName} is ${when}. The syllabus isn't going to read itself.`,
      `${title} ${when}. ${courseName} said good luck, you'll need it.`,
    ],
    seed,
  )
}

export function recoveryDayReminder(courseName: string, seed: string, voice: HumorLevel = "roast"): string {
  if (voice === "plain") return `${courseName} meets today — attending helps recover your attendance.`
  if (voice === "kuchupuchu") {
    return pick(
      [
        `Kuchupuchu aaj ${courseName} hai 🚑 attend karke attendance bacha lo`,
        `${courseName} aaj hai kuchupuchu 💪 ye rescue mission hai, side quest nahi`,
        `Kuchupuchu aaj ${courseName} zaroor jaana 🙏 attendance CPR mode me hai`,
        `Aaj ${courseName} kuchupuchu 🥺 ek class = thodi si jaan wapas`,
        `Kuchupuchu ${courseName} aaj recovery ke liye important hai 🔋 chalo`,
        `${courseName} aaj hai kuchupuchu 😤 aaj wala bunk allowed nahi, samjhe`,
        `Kuchupuchu aaj ${courseName} me dikhna zaroori hai 🎯 mere liye`,
        `Aaj ${courseName} attend karo kuchupuchu 💌 attendance thank you bolegi`,
      ],
      seed,
    )
  }
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
export function dailyDigest(seed: string, voice: HumorLevel = "roast"): string {
  if (voice === "plain") return "Good morning. Open AttendWise to check today's classes and mark attendance."
  if (voice === "kuchupuchu") {
    return pick(
      [
        `Good morning kuchupuchu ☀️ aaj ki classes tumhara intezaar kar rahi hain`,
        `Uth jao kuchupuchu 🥱 aaj ka schedule dekh lo na, mark karna hai`,
        `Subah ho gayi kuchupuchu ☕ AttendWise kholo, aaj ki classes check karo`,
        `Kuchupuchu good morning 💕 aaj kaunsi classes hain dekh lo, before they sneak past`,
        `Rise and shine kuchupuchu ✨ attendance ki suraksha aaj se phir shuru`,
        `Kuchupuchu 🐣 naya din, nayi attendance. App kholo aur plan dekho`,
        `Morning roll call kuchupuchu 📣 aaj ki classes pe nazar daal lo`,
        `Good morning meri jaan ☀️ kuchupuchu aaj kya kya hai, ek baar dekh lo`,
      ],
      seed,
    )
  }
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

export function weeklyDigest(atRiskCount: number, quizCount: number, seed: string, voice: HumorLevel = "roast"): string {
  if (atRiskCount === 0 && quizCount === 0) {
    if (voice === "plain") return "All courses are above their attendance requirement and nothing is due this week."
    if (voice === "kuchupuchu")
      return pick(
        [
          "Sab classes green kuchupuchu 💚 aur is week kuch due nahi. Proud of you 🥹",
          "Clean week kuchupuchu ✨ sab sahi hai. Aise hi rehna, main khush hoon 💕",
        ],
        seed,
      )
    return pick(["All courses green, nothing due this week. Suspiciously well-behaved of you.", "Clean week ahead. Enjoy it, it won't last."], seed)
  }
  const parts: string[] = []
  if (atRiskCount > 0) parts.push(`${atRiskCount} course${atRiskCount === 1 ? "" : "s"} need${atRiskCount === 1 ? "s" : ""} attention`)
  if (quizCount > 0) parts.push(`${quizCount} quiz${quizCount === 1 ? "" : "zes"} incoming`)
  if (voice === "kuchupuchu") return `Is week kuchupuchu 🥺: ${parts.join(", ")}. Dhyaan rakhna please 💕`
  return `This week: ${parts.join(", ")}.${voice === "plain" ? "" : " No pressure."}`
}
