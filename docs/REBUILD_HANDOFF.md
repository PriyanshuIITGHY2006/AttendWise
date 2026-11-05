# AttendWise — Native Rebuild Handoff

Snapshot of where the project stands and what has been decided, so work can resume in a fresh session without re-deriving anything. Last updated: 5 Nov 2026.

---

## 1. Owner's standing rules (always apply)

- **All commits under the owner's name:** `Priyanshu Debnath <priyanshuib01@gmail.com>`. The build sandbox's default git identity is *not* the owner — always override it per commit (`git -c user.name=... -c user.email=...`).
- **No AI/assistant branding anywhere in the repo** — no co-author trailers, no tool names in commit messages, file names, code comments or docs.
- **All v2 work happens on the `v2-native` branch.**
- Prefer action over long question lists; ask only for decisions that are genuinely the owner's.
- Verify with real evidence (DB queries, builds, screenshots), never assume.
- Never put other users' personal data (emails, names) in the repo.

---

## 2. The decision: rebuild from scratch as a real native app

The current product is a React/Vite **web app** wrapped in Capacitor, and the APK just loads the GitHub Pages site in a WebView. The owner wants a **true native Android app** — not a webpage in a phone — with a rebuilt UI.

**Home-screen widgets are a must-have, core to v1.**

### Status of key decisions

| Decision | Status |
|---|---|
| Native app (no WebView) | ✅ Decided |
| Widgets in v1 | ✅ Decided (must-have) |
| Remove Materials/Files feature entirely | ✅ Decided |
| Archive current web app on a git tag before deleting it | ✅ Planned (`web-app-archive`) |
| Stack | ✅ **Kotlin + Jetpack Compose + Glance** |
| Backend | ✅ **Fresh Supabase project**, new schema; users start over |
| Platform | ✅ Android only |
| v1 scope | ✅ 5 tabs only (Grades/Deadlines → v2) |
| Remove repo clutter (`PUSH_SETUP.md`, `android/`, Pages deploy, old SQL) | ✅ Yes, after the archive tag |
| Signing key | ✅ Old keystore lost → new key; old-APK users reinstall once |
| Branch | ✅ All v2 work on `v2-native` |

**The full build plan is in `docs/V2_PLAN.md`.**

---

## 3. Planned app

### Tabs
1. **Today** — today's classes as cards; swipe to mark present/absent; per-class "safe to skip?"; day-swap banner.
2. **Courses** — % ring, safe skips left, status colour; detail page with stats, end-of-semester projection, editable history, timetable.
3. **Plan** — one unified planner (old bunk planner + "plan a day off"): pick days/trip → verdict across all courses → apply with undo.
4. **Calendar** — month view: your classes + institute holidays, exam weeks, day swaps.
5. **Profile** — notifications & humour voice, semester setup, theme, sign out.

### Widgets (v1)
| Widget | Size | Shows |
|---|---|---|
| Today | Medium/large | Remaining classes, time, room, **Present/Absent buttons per class**, day-swap banner |
| Next class | Small | Next class, room, countdown, safe-to-skip |
| Course ring | Small (configurable per course) | One course's %, safe skips left, colour |
| Can I bunk today? | Small | One-line verdict for the day (witty voice) |
| Danger list | Medium | Only yellow/red courses |

Widget behaviour: tap opens the relevant screen; marking from a widget writes locally instantly and syncs later; widgets refresh on any mark, at midnight, and around each class start.

### Other native features
- Notifications with **Present / Absent action buttons** (mark without opening the app).
- **Offline-first**: on-device database is the source of truth for UI + widgets; background sync with Supabase.
- Onboarding wizard (semester → courses → timetable, incl. half-semester courses).
- Dark mode, haptics, native animations.

### Build, delivery, verification
- **Design first:** phone-sized mockups of every screen and every widget, approved by the owner before coding.
- **APK delivery:** GitHub Actions builds a signed APK on every push and publishes it to **GitHub Releases** — no Android Studio needed on the owner's machine. One-time setup: Supabase keys as GitHub secrets.
- **Verification:** unit tests for all attendance math and calendar logic; GitHub Actions boots a real Android emulator, installs the APK and captures screenshots; DB changes verified with real queries; device-only behaviour (notification actions, widgets on a real launcher, offline) tested by the owner from each milestone APK.

### Milestones (each ends with an installable APK)
1. Foundation — project, design system, navigation, login (Google + email), Supabase cleanup (drop Materials), CI APK pipeline.
2. Core loop — onboarding, courses + timetable, session generation, Today with marking, local DB + sync.
3. Smarts — course detail + projections, history editing, unified Planner with undo, Calendar.
4. Widgets + notifications — all five widgets, notification actions.
5. Polish — animations, dark mode, empty states, final pass.
v2 candidates: Grades/GPA, Deadlines, Insights, attendance export (PDF/CSV), multi-semester archive.

---

## 4. Backend facts worth keeping (Supabase)

- Project ref: `jlueyxbqknnmcoesgnmg`. Auth: Google + email/password (Microsoft also configured). RLS on all user tables; prior security audit done (owner-only access, admin cannot read personal data).
- **`institute_calendar`**: `date`, `day_type` (`holiday` | `mid_sem_break` | `end_sem_break` | `reschedule`), `description`, `follows_day_of_week` (0=Mon..6=Sun; set ⇒ this date runs another weekday's timetable), `audience` (`all` | `first_year_ug`).
- **`generate_sessions_for_course(p_course_id)`** (SECURITY INVOKER): builds sessions between the course's `semester_start`/`semester_end`, skips no-class days, applies day swaps (respecting `profiles.is_first_year_ug`), regenerates only unmarked future sessions.
- **`courses.term`**: `full` | `pre_mid` | `post_mid` (half-semester courses; effective span stored in `semester_start`/`semester_end`).
- **RPC `course_stats_for_user`**: per-course attended, absent, total, remaining, `planned_future_skips`.
- Core attendance rules that must survive the rewrite:
  - Only sessions on/before today count toward attended/absent; future marks are *plans*.
  - `cancelled` / `on_duty` sessions count toward neither attended nor absent but are removed from "remaining".
  - Safe skips = `floor(attended + remaining − threshold × (attended + absent + remaining))`, clamped ≥ 0, **minus already-planned future skips** (so no planner hands out the same skip twice).
  - Projection if a plan is followed = `(attended + remaining − plannedSkips) / (attended + absent + remaining)`; over budget when planned skips exceed safe skips.
  - Zero-tolerance courses never get skip suggestions.
- Notifications: per-user settings (mute, lead time) incl. a humour-level voice setting; witty copy bank exists in the current codebase (`src/features/notifications/`).
- Materials/Files tables and storage are **to be dropped** in the rebuild.

### Monsoon 2026 calendar (IIT Guwahati) — essentials
- Instruction: 23 Jul → 12 Nov 2026. Mid-sem exams 13–20 Sep. End-sem exams 14–21 Nov.
- Day swaps: 27 Aug (Thu→**Wed** timetable), 1 Oct (Thu→**Fri**), 11 Nov (Wed→**Mon**); first-year UG only: 8 Aug (Sat→Thu), 22 Aug (Sat→Fri).
- Owner is **not** a first-year UG student.

---

## 5. Current users (aggregate only — no personal data)

- 18 accounts ≈ 14 distinct people (several duplicate sign-ups and a couple of test/never-used accounts).
- **10 people actively used it**, logging **1,869 attendance marks** in total; several logged 200+.
- Most activity stopped in August; only one user active as of 5 Nov. Strong signal the web-app UX lost people — and a reason to carry their data into the native app.
- Duplicate/empty accounts can be cleaned up during the rebuild **only with the owner's explicit go-ahead**.

---

## 6. Open items from the old web app (moot once rebuilt)

- "Courses page floating on mobile": could not be reproduced on current code (layout already uses a non-fixed flex shell); likely a cached old APK build or the translucent header/tab bar. Irrelevant after the native rebuild.

---

## 7. Next step

All decisions are made. Plan written (`docs/V2_PLAN.md`). Next: **Milestone 0**, the screen + widget mockups for owner approval, then Milestone 1.
