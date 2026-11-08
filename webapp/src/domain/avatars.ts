/*
 * Profile pictures. Anyone can pick any of them. The drawings are Open Peeps by
 * Pablo Stanley (CC0, public domain), rendered with DiceBear. The id is what is
 * stored in the profile.
 */
export interface Avatar {
  id: string
  title: string
  line: string
}

export const AVATARS: Avatar[] = [
  { id: 'sleepyhead', title: 'Sleepyhead', line: '8 AM is a rumour.' },
  { id: 'latecomer', title: 'Latecomer', line: 'Arrives with the professor.' },
  { id: 'front-bencher', title: 'Front Bencher', line: 'First row. First question.' },
  { id: 'back-bencher', title: 'Back Bencher', line: 'Sees everything from the last row.' },
  { id: 'chai-champion', title: 'Chai Break Champion', line: 'Back in five minutes. Always.' },
  { id: 'night-owl', title: 'Night Owl', line: 'Wide awake at 3 AM.' },
  { id: 'last-minute', title: 'Last Minute Legend', line: 'Starts studying when the exam starts.' },
  { id: 'strategist', title: 'The Strategist', line: 'Knows how many safe skips are left.' },
  { id: 'lab-rat', title: 'Lab Rat', line: 'Lives in the lab. Smells like solder.' },
  { id: 'comeback-kid', title: 'Comeback Kid', line: 'Was at 62%. Now at 81%.' },
  { id: 'perfect-streak', title: 'Perfect Streak', line: 'Never missed one. Show-off.' },
  { id: 'notes-hoarder', title: 'Notes Hoarder', line: 'Has the notes. You will be borrowing them.' },
]

export const avatarById = (id: string | null | undefined): Avatar | null => AVATARS.find((a) => a.id === id) ?? null
