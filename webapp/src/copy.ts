import type { TodayVerdictKind } from './domain'

/*
 * One line for the "Can I bunk today?" card, in three voices: "roast"
 * (deadpan, never mean), "plain" (facts only) and "kuchupuchu" (clingy Hinglish
 * bestie). Variants are picked from a seed, so the same day shows the same line.
 */
function pick(variants: string[], seed: string): string {
  let hash = 0
  for (const c of seed) hash = (hash * 31 + c.codePointAt(0)!) | 0
  return variants[((hash % variants.length) + variants.length) % variants.length]
}

export type Voice = 'roast' | 'plain' | 'kuchupuchu'

export function todayVerdictCopy(kind: TodayVerdictKind, skippable: string[], mustAttend: string[], voice: Voice, seed: string): string {
  const skip = skippable.join(', ')
  const worst = mustAttend[0]
  switch (kind) {
    case 'no_classes_today':
      return voice === 'plain' ? 'No classes today.' : voice === 'kuchupuchu' ? 'Aaj koi class nahi kuchupuchu 🥳 aaram karo' : 'No classes today. Rest is also productive, apparently.'
    case 'day_done':
      return voice === 'plain' ? 'No classes left today.' : voice === 'kuchupuchu' ? 'Aaj ka kaam khatam kuchupuchu 😌' : "Day's over. Whatever happened, happened."
    case 'all_skippable':
      if (voice === 'plain') return "You can skip all of today's remaining classes."
      if (voice === 'kuchupuchu') return 'Kuchupuchu aaj sab skip kar sakte ho... par mat karo na 🥺'
      return pick(['Technically you could skip everything today. Technically.', 'Every class today is skippable. Use this power wisely.'], seed)
    case 'some_skippable':
      if (voice === 'plain') return `You can skip ${skip} today. Attend the rest.`
      if (voice === 'kuchupuchu') return `Kuchupuchu sirf ${skip} skip ho sakta hai 😌 baaki attend karo`
      return `Only ${skip}. The rest need you` + (worst ? `, ${worst} most of all.` : '.')
    case 'none_skippable':
      if (voice === 'plain') return 'Attend every class today.'
      if (voice === 'kuchupuchu') return 'Aaj ek bhi bunk nahi kuchupuchu 😤'
      return pick(['Not today. Every class needs you.', 'Zero bunks available today. Shoes on.'], seed)
  }
}

/** The sample line shown under the voice picker. */
export function thresholdPreview(course: string, percent: number, voice: Voice, seed: string): string {
  if (voice === 'plain') return `${course} is at ${percent}%, below your required attendance. Try not to miss the next classes.`
  if (voice === 'kuchupuchu') {
    return pick([
      `Kuchupuchu 😭 ${course} sirf ${percent}% pe hai. Ab to jaana hi padega jaan`,
      `Oye kuchupuchu ${percent}%?! ${course} ki attendance ICU me hai 🏥`,
      `Meri jaan ${course} ${percent}% 🚑 kuchupuchu ab har class must hai, samjhe?`,
    ], seed)
  }
  return pick([
    `${course} attendance is in the ICU at ${percent}%. Might be time for your best sob story.`,
    `${course}: ${percent}%. Even the attendance register has trust issues with you now.`,
    `${course} is circling the drain at ${percent}%. Show your face before it becomes a "who?" situation.`,
  ], seed)
}
