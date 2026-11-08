import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { assemble, Derived, EMPTY_RAW, type Raw } from '../derived'
import { keyOf, nowOf, Planner, type ClassKey, type Course, type Mark, type MarkStatus, type Now, type Schedule, type TimetableSlot } from '../domain'
import { hms, type CourseRow, type ExtraRow, type MarkRow, type ProfileRow, type SemesterRow, type SlotRow } from './rows'
import { supabase } from './supabase'

type Boot = 'loading' | 'signed_out' | 'ready' | 'error'
type Toast = { id: number; text: string; undo?: () => void }

export interface Store {
  boot: Boot
  session: Session | null
  raw: Raw
  derived: Derived
  onboarded: boolean
  error: string | null
  toast: Toast | null
  dismissToast: () => void
  // auth
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, name: string) => Promise<string | null>
  resetPassword: (email: string) => Promise<string | null>
  google: () => Promise<void>
  signOut: () => Promise<void>
  reload: () => Promise<void>
  // data
  mark: (key: ClassKey, end: string | null, status: MarkStatus | null) => void
  markAll: (items: Array<{ key: ClassKey; end: string | null }>, status: MarkStatus) => void
  applyPlan: (selection: Set<string>, allowOverBudget: boolean) => void
  undoPlan: (planId: string) => void
  saveProfile: (patch: { fullName?: string | null; firstYear?: boolean; humor?: ProfileRow['humor_level']; avatar?: string | null }) => void
  saveSemester: (row: SemesterRow) => Promise<boolean>
  saveCourse: (course: CourseRow, slotsToSave: SlotRow[], slotIdsToDelete: string[]) => Promise<boolean>
  setArchived: (courseId: string, archived: boolean) => void
  deleteCourse: (courseId: string) => Promise<void>
  addExtraClass: (row: ExtraRow) => void
  finishOnboarding: () => void
  // theme
  theme: 'system' | 'light' | 'dark'
  setTheme: (t: 'system' | 'light' | 'dark') => void
}

const Ctx = createContext<Store | null>(null)
export const useStore = (): Store => {
  const s = useContext(Ctx)
  if (!s) throw new Error('Store missing')
  return s
}

export const newId = (): string => crypto.randomUUID()

async function fetchAll<T>(table: string, configure: (q: any) => any = (q) => q): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(supabase.from(table).select('*')).range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

async function write(table: string, rows: object[], onConflict: string): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(error.message)
}

const ONBOARDED = 'attendwise.onboarded'
const THEME = 'attendwise.theme'

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* private window: carry on */ }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [boot, setBoot] = useState<Boot>('loading')
  const [raw, setRaw] = useState<Raw>(EMPTY_RAW)
  const [now, setNow] = useState<Now>(nowOf())
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [onboardedFlag, setOnboardedFlag] = useState(readLocal(ONBOARDED) === '1')
  const [theme, setThemeState] = useState<'system' | 'light' | 'dark'>((readLocal(THEME) as 'system' | 'light' | 'dark') || 'system')
  const rawRef = useRef(raw)
  rawRef.current = raw
  const userId = session?.user.id ?? null

  // The clock: the screen re-evaluates "today" and "now" every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => setNow(nowOf()), 30_000)
    const onFocus = () => setNow(nowOf())
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  const say = useCallback((text: string, undo?: () => void) => setToast({ id: Date.now(), text, undo }), [])

  const load = useCallback(async () => {
    const mine = (q: any) => q.is('deleted_at', null)
    const [semesters, courses, slots, extras, marks, calendar, profiles] = await Promise.all([
      fetchAll<SemesterRow>('semesters', mine),
      fetchAll<CourseRow>('courses', mine),
      fetchAll<SlotRow>('timetable_slots', mine),
      fetchAll<ExtraRow>('extra_classes', mine),
      fetchAll<MarkRow>('marks', mine),
      fetchAll<Raw['calendar'][number]>('institute_calendar'),
      fetchAll<ProfileRow>('profiles'),
    ])
    let profile = profiles[0] ?? null
    if (!profile) {
      const { data: u } = await supabase.auth.getUser()
      const meta = u.user?.user_metadata ?? {}
      const row: ProfileRow = { id: u.user!.id, full_name: (meta.full_name ?? meta.name ?? null) as string | null, is_first_year_ug: false, humor_level: 'roast' }
      await write('profiles', [row], 'id')
      profile = row
    }
    setRaw({ semesters, courses, slots, extras, marks, calendar, profile })
  }, [])

  const reload = useCallback(async () => {
    try {
      await load()
      setError(null)
      setBoot('ready')
    } catch (e) {
      setError((e as Error).message)
      setBoot((b) => (b === 'ready' ? b : 'error'))
    }
  }, [load])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setBoot('signed_out')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) { setRaw(EMPTY_RAW); setBoot('signed_out') }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (userId) { setBoot((b) => (b === 'ready' ? b : 'loading')); void reload() }
  }, [userId, reload])

  const derived = useMemo(() => new Derived(assemble(raw), now), [raw, now])
  const onboarded = !!derived.data.semester && (derived.data.courses.length > 0 || onboardedFlag)

  /** Applies a local change at once, writes it, and reloads from the server if the write fails. */
  const commit = useCallback(async (apply: (r: Raw) => Raw, send: () => Promise<void>) => {
    setRaw((r) => apply(r))
    try {
      await send()
    } catch (e) {
      say(`Couldn't save: ${(e as Error).message}`)
      void reload()
    }
  }, [reload, say])

  const markRows = useCallback((items: Array<{ key: ClassKey; end: string | null; status: MarkStatus | null }>, planId: string | null): MarkRow[] => {
    return items.map(({ key, end, status }) => {
      const existing = rawRef.current.marks.find((m) => m.course_id === key.courseId && m.date === key.date && m.start_time.slice(0, 5) === key.start)
      return {
        course_id: key.courseId, date: key.date, start_time: hms(key.start),
        end_time: end ? hms(end) : existing?.end_time ?? null,
        status: status ?? existing?.status ?? 'present',
        plan_id: status == null ? existing?.plan_id ?? null : planId,
        deleted_at: status == null ? new Date().toISOString() : null,
      }
    })
  }, [])

  const writeMarks = useCallback((rows: MarkRow[]): void => {
    const uid = userId
    if (!uid) return
    void commit(
      (r) => {
        const kept = r.marks.filter((m) => !rows.some((x) => x.course_id === m.course_id && x.date === m.date && x.start_time.slice(0, 5) === m.start_time.slice(0, 5)))
        return { ...r, marks: [...kept, ...rows.filter((x) => !x.deleted_at)] }
      },
      () => write('marks', rows.map((x) => ({ ...x, user_id: uid })), 'user_id,course_id,date,start_time'),
    )
  }, [commit, userId])

  const store: Store = {
    boot, session, raw, derived, onboarded, error, toast, theme,
    dismissToast: () => setToast(null),
    setTheme: (t) => { setThemeState(t); writeLocal(THEME, t) },
    finishOnboarding: () => { writeLocal(ONBOARDED, '1'); setOnboardedFlag(true) },
    reload,

    signIn: async (email, password) => {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      return e ? e.message : null
    },
    signUp: async (email, password, name) => {
      const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: name.trim() ? { full_name: name.trim() } : undefined } })
      if (e) return e.message
      return data.session ? null : 'Check your email to confirm your account, then sign in.'
    },
    resetPassword: async (email) => {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname })
      return e ? e.message : 'Check your email for a reset link.'
    },
    google: async () => {
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
    },
    signOut: async () => { await supabase.auth.signOut() },

    mark: (key, end, status) => writeMarks(markRows([{ key, end, status }], null)),
    markAll: (items, status) => writeMarks(markRows(items.map((i) => ({ ...i, status })), null)),
    applyPlan: (selection, allowOverBudget) => {
      const data = derived.data
      const result = Planner.apply(data.courses as Course[], derived.schedule as Schedule, selection, newId(), derived.now, allowOverBudget)
      if (result.kind === 'rejected') { say('Some of those classes can no longer be planned.'); return }
      const planId = result.marks[0]?.planId ?? null
      writeMarks(markRows(result.marks.map((m) => ({ key: m.key, end: m.end, status: m.status })), planId))
      say(`Planned ${result.marks.length} skip${result.marks.length === 1 ? '' : 's'}.`, planId ? () => store.undoPlan(planId) : undefined)
    },
    undoPlan: (planId) => {
      const keys = Planner.undo(derived.data.marks as Mark[], planId, derived.now)
      writeMarks(markRows(keys.map((key) => ({ key, end: null, status: null })), null))
    },

    saveProfile: (patch) => {
      if (!userId) return
      const cur = rawRef.current.profile
      const name = 'fullName' in patch ? patch.fullName : cur?.full_name
      const row: ProfileRow = {
        id: userId,
        full_name: name?.trim() ? name.trim() : null,
        is_first_year_ug: patch.firstYear ?? cur?.is_first_year_ug ?? false,
        humor_level: patch.humor ?? cur?.humor_level ?? 'roast',
        avatar: 'avatar' in patch ? patch.avatar : cur?.avatar ?? null,
      }
      void commit((r) => ({ ...r, profile: row }), () => write('profiles', [row], 'id'))
    },

    saveSemester: async (row) => {
      if (!userId) return false
      const others = rawRef.current.semesters.filter((s) => s.is_active && s.id !== row.id).map((s) => ({ ...s, is_active: false }))
      setRaw((r) => ({ ...r, semesters: [...r.semesters.filter((s) => s.id !== row.id && !others.some((o) => o.id === s.id)), ...others, row] }))
      try {
        await write('semesters', [...others, row].map((s) => ({ ...s, user_id: userId })), 'id')
        return true
      } catch (e) {
        say(`Couldn't save: ${(e as Error).message}`)
        void reload()
        return false
      }
    },

    saveCourse: async (course, slotsToSave, slotIdsToDelete) => {
      if (!userId) return false
      const saved = slotsToSave.map((s) => ({ ...s, course_id: course.id }))
      setRaw((r) => ({
        ...r,
        courses: [...r.courses.filter((c) => c.id !== course.id), course],
        slots: [...r.slots.filter((s) => !saved.some((x) => x.id === s.id) && !slotIdsToDelete.includes(s.id)), ...saved],
      }))
      try {
        await write('courses', [{ ...course, user_id: userId }], 'id')
        await write('timetable_slots', saved.map((s) => ({ ...s, user_id: userId, start_time: hms(s.start_time), end_time: hms(s.end_time) })), 'id')
        const gone = rawRef.current.slots.filter((s) => slotIdsToDelete.includes(s.id)).map((s) => ({ ...s, user_id: userId, deleted_at: new Date().toISOString() }))
        await write('timetable_slots', gone, 'id')
        return true
      } catch (e) {
        say(`Couldn't save: ${(e as Error).message}`)
        void reload()
        return false
      }
    },

    setArchived: (courseId, archived) => {
      const row = rawRef.current.courses.find((c) => c.id === courseId)
      if (!row || !userId) return
      void commit((r) => ({ ...r, courses: r.courses.map((c) => (c.id === courseId ? { ...c, archived } : c)) }), () => write('courses', [{ ...row, archived, user_id: userId }], 'id'))
    },

    deleteCourse: async (courseId) => {
      const row = rawRef.current.courses.find((c) => c.id === courseId)
      if (!row || !userId) return
      const stamp = new Date().toISOString()
      const slots = rawRef.current.slots.filter((s) => s.course_id === courseId)
      await commit(
        (r) => ({ ...r, courses: r.courses.filter((c) => c.id !== courseId), slots: r.slots.filter((s) => s.course_id !== courseId) }),
        async () => {
          await write('courses', [{ ...row, deleted_at: stamp, user_id: userId }], 'id')
          await write('timetable_slots', slots.map((s) => ({ ...s, deleted_at: stamp, user_id: userId })), 'id')
        },
      )
    },

    addExtraClass: (row) => {
      if (!userId) return
      void commit((r) => ({ ...r, extras: [...r.extras, row] }), () => write('extra_classes', [{ ...row, user_id: userId, start_time: hms(row.start_time), end_time: hms(row.end_time) }], 'id'))
    },
  }

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export { keyOf }
export type { TimetableSlot }
