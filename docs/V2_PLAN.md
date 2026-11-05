# AttendWise v2 — Native Android Build Plan

The full plan for rebuilding AttendWise as a true native Android app in Kotlin. Read together with `docs/REBUILD_HANDOFF.md` (owner rules, backend facts, attendance rules). Last updated: 5 Nov 2026.

---

## 0. Decisions locked in

| Topic | Decision |
|---|---|
| Stack | **Kotlin + Jetpack Compose + Material 3 + Glance** (widgets) |
| Platform | Android only |
| Backend | **Fresh Supabase project** with a new, clean schema. Users start over (fits nicely: the Monsoon semester ends 21 Nov, so everyone sets up Winter 2027 fresh anyway) |
| v1 scope | 5 tabs: Today, Courses, Plan, Calendar, Profile + 5 widgets + actionable notifications. **No** Grades, Deadlines, Materials |
| Old web app | Tag `web-app-archive`, then delete web app, Capacitor `android/`, `PUSH_SETUP.md`, Pages deploy, old `supabase/` SQL |
| Signing key | Old keystore is gone → new key. Anyone with the old APK uninstalls it once, then installs v2 |
| Branch | All work on **`v2-native`**. Merged into `dev` only when v1 is ready |
| Commits | Author `Priyanshu Debnath <priyanshuib01@gmail.com>`, no AI/tool attribution anywhere |
| Firebase / server push | **Dropped for v1.** Every notification is scheduled on the device, so there's no Firebase project, no `google-services.json`, no service account |

---

## 1. Architecture

### 1.1 Principles
1. **Offline-first.** The on-device database (Room) is the only thing the UI and widgets read. Supabase is a sync and backup target, not a live dependency. The app works fully with no network.
2. **Sessions are computed on the device, not stored.** The old app generated session rows on the server (`generate_sessions_for_course`). That caused the orphaned-session and re-projection bugs (#55, `fix-schedule-reprojection.sql`). In v2, a pure Kotlin function turns *semester + timetable + institute calendar* into the list of classes. Only **marks** are stored and synced.
3. **Pure logic in its own module.** Attendance math, session generation, planner and verdict logic live in a plain-Kotlin module with no Android dependency. That makes them fast to unit-test and impossible to tangle with UI.
4. **Single source of change.** Every write (from a screen, widget or notification button) goes through one repository. That repository writes Room → refreshes widgets → reschedules alarms → queues sync. No feature does those steps itself.

### 1.2 Modules
```
:domain   pure Kotlin (JVM) — models, session generator, attendance math,
          planner, verdicts, witty copy bank. 100% unit-tested.
:data     Room database, Supabase client, sync engine, repositories,
          settings (DataStore).
:app      Compose UI, navigation, Glance widgets, notifications, alarms,
          WorkManager jobs, dependency wiring (Hilt).
```

### 1.3 Libraries
| Need | Choice |
|---|---|
| UI | Jetpack Compose (BOM), Material 3, dynamic colour (Material You) with a brand fallback |
| Navigation | Navigation Compose (type-safe routes) |
| Widgets | Jetpack Glance (`glance-appwidget`, `glance-material3`) |
| Local DB | Room (+ KSP), Kotlin Flow for live queries |
| Backend client | `supabase-kt` (Auth, Postgrest) + Ktor client |
| Google sign-in | Android Credential Manager → Google ID token → `signInWithIdToken` on Supabase |
| Background | WorkManager (sync, daily planning), AlarmManager exact alarms (class-time events) |
| Settings | DataStore |
| DI | Hilt |
| Dates | `java.time` (minSdk 26, so no desugaring) |
| JSON | kotlinx.serialization |
| Tests | JUnit5 + Kotest assertions (domain), Room in-memory tests, Compose UI tests, Roborazzi screenshot tests |

**SDK levels:** minSdk 26 (Android 8.0), targetSdk/compileSdk 36. Package id stays `in.ac.iitg.attendwise`.

---

## 2. Fresh backend (new Supabase project)

### 2.1 Tables
Every user table gets `id uuid` (generated on the device), `user_id`, `updated_at` (set by a server trigger) and `deleted_at` (soft delete, so deletes sync). RLS on every user table allows **owner-only** access (`user_id = auth.uid()`).

| Table | Columns (beyond the common ones) | Notes |
|---|---|---|
| `profiles` | `full_name`, `is_first_year_ug`, `humor_level` | Row created by trigger on sign-up |
| `semesters` | `name`, `start_date`, `end_date`, `mid_sem_start`, `mid_sem_end` | One active at a time. Makes the v2 multi-semester archive trivial |
| `courses` | `semester_id`, `name`, `code`, `color`, `threshold` (default 75), `strict_no_skip`, `term` (`full`/`pre_mid`/`post_mid`), `archived` | Half-semester span is derived from the semester's mid-sem dates, not stored separately |
| `timetable_slots` | `course_id`, `day_of_week` (0=Mon), `start_time`, `end_time`, `room`, `kind` (lecture/tutorial/lab), `valid_from`, `valid_to` | **Timetable changes never rewrite history.** Editing a slot closes the old one (`valid_to`) and opens a new one |
| `marks` | `course_id`, `slot_id` (nullable), `date`, `start_time`, `end_time`, `status` (`present`/`absent`/`cancelled`/`on_duty`), `is_extra`, `plan_id` (nullable) | **Unique `(user_id, course_id, date, start_time)`**, so the same mark from two devices merges cleanly. Future `absent` = planned skip. `is_extra` = extra/makeup class. `plan_id` lets a whole plan be undone |
| `notification_settings` | `muted`, `class_reminders`, `lead_time_minutes`, `mark_prompts`, `daily_digest`, `digest_time`, `threshold_alerts`, `planned_skip_reminders`, `quiet_start`, `quiet_end` | One row per user |
| `institute_calendar` | `date`, `day_type` (`holiday`/`mid_sem_break`/`end_sem_break`/`reschedule`/`exam`), `description`, `follows_day_of_week`, `audience` (`all`/`first_year_ug`) | **Public read, admin-only write.** Seeded by migration each semester |

No `sessions`, `device_tokens`, `push_log`, `course_shares`, materials or grades tables in v1.

### 2.2 Rules
- Schema lives in `supabase/migrations/NNNN_name.sql` in the repo, applied in order. Each migration is verified with real queries plus the Supabase security advisor (no RLS gaps) before moving on.
- Auth providers: Google + email/password. Microsoft is dropped.
- Anon key in the APK is fine (public by design). RLS is the security boundary.

### 2.3 Sync engine
- **Push:** local rows flagged `dirty` are upserted in batches. Marks upsert on the unique key.
- **Pull:** per table, fetch rows with `updated_at > lastPulledAt` (including soft-deleted ones), then apply locally.
- **Conflicts:** last write wins on `updated_at`. That's fine for a single person on one or two phones.
- **When:** after every local write (debounced, network-required WorkManager job), on app open, and every 6 hours. Failures retry with backoff. The UI never waits on sync.
- **First sign-in on a new phone:** a full pull, then normal operation.

### 2.4 Old project
The old project (`jlueyxbqknnmcoesgnmg`) stays untouched until v2 launches, because the current APK depends on it. At launch: take a full database backup (kept privately, **never in the repo**), then pause the project. Deleting it is the owner's call later.

---

## 3. Domain logic (the heart — ported exactly, then tested)

### 3.1 Session generator
`generateSessions(semester, courses, slots, instituteCalendar, isFirstYearUg, range) → List<ClassOccurrence>`
- Walk each date in range, skipping dates outside the course's effective span (`term`) and no-class days (`holiday`, breaks, exams).
- On a `reschedule` date, use the timetable of `follows_day_of_week` instead of the real weekday, respecting `audience` vs `is_first_year_ug`.
- Pick the slot version valid on that date (`valid_from`/`valid_to`).
- Merge with marks: an occurrence takes its mark's status. Extra-class marks add occurrences that aren't in the timetable.

### 3.2 Attendance math (from `bunkSafety.ts` + live `course_stats_for_user`)
- **Attended / absent** = `present` / `absent` marks dated **on or before today**.
- **Neutral** = `cancelled` / `on_duty`. They count toward neither and are excluded from remaining.
- **Remaining** = occurrences not yet resolved by a past mark.
- **Safe skips** = `floor(attended + remaining − threshold × (attended + absent + remaining))`, clamped to `[0, remaining]`, **minus planned future skips**.
- **Projection** = `(attended + remaining − plannedSkips) / (attended + absent + remaining)`. Over budget when planned skips exceed safe skips.
- **Recovery** = classes in a row needed to get back above threshold.
- **Status:** green / yellow (0 safe skips) / red (below threshold or can't reach it).
- `strict_no_skip` courses never get skip suggestions.

**Two small rule fixes vs the old app (recommended, flag if you disagree):**
1. The old server counted **past unmarked** classes as "remaining", as if you could still attend them. v2 treats them as **unmarked** instead: shown with a "mark these" nudge, and counted as *remaining* in the math until marked. The number stays the same as before; it's just labelled honestly.
2. The old server only removed **past** cancellations from remaining. v2 also removes **future** cancellations (e.g. a known holiday-moved class), which is more accurate.

### 3.3 Planner, verdicts, copy
- Unified planner: input = a set of dates or a date range. Per course: classes affected, safe count, verdict, projected %. Apply = write future `absent` marks with one `plan_id`. Undo = delete marks by `plan_id`.
- "Can I bunk today?" verdict = the planner run on today's remaining classes, producing one witty line.
- Witty copy bank: port `src/features/notifications/copy.ts` with all humour levels.

### 3.4 Tests (written before or with the code)
- Every function in `bunkSafety.ts` gets matching Kotlin tests, including edge cases: 0 marks, 100% threshold, strict courses, all classes cancelled.
- Session generator tests use the **real Monsoon 2026 calendar** as fixtures: swaps on 27 Aug (Thu→Wed), 1 Oct (Thu→Fri), 11 Nov (Wed→Mon), first-year-only 8 Aug and 22 Aug, mid-sem break, `pre_mid`/`post_mid` spans, and a timetable edit mid-semester.
- Day-boundary tests: device-local midnight, never UTC (the bug fixed in #57/#58).

---

## 4. App features

### 4.1 Screens
| Tab | Contents |
|---|---|
| **Today** | Day-swap or holiday banner. Today's classes as cards (time, room, course colour) with swipe right = present, swipe left = absent, long-press for cancelled / on duty. Per-class "safe to skip?" chip. Unmarked-past section with bulk mark. |
| **Courses** | List with % ring, safe skips, status colour. Detail: stats, projection, recovery, history (editable, grouped by week), timetable slots, edit course. |
| **Plan** | Pick dates (multi-select calendar) or a trip range → per-course verdict table → Apply → snackbar Undo. "My plans" list to remove a plan later. |
| **Calendar** | Month grid: dots for your classes and marks, colour bands for holidays, exams and swaps. Tap a day → that day's classes (mark or plan from there). |
| **Profile** | Name, first-year toggle, humour level, notification settings, semester management, theme (system/light/dark), sign out, app version + update check. |

**Onboarding wizard:** sign in → first-year UG? → semester (pre-filled from the institute calendar when seeded) → add courses → timetable per course → done.

### 4.2 Widgets (Glance)
| Widget | Size | Content | Tap |
|---|---|---|---|
| Today | 4×2 – 4×4 | Remaining classes + **Present/Absent buttons** + swap banner | Today tab |
| Next class | 2×2 | Next class, room, countdown, safe-to-skip | Course detail |
| Course ring | 2×2 (pick course on add) | %, safe skips, colour | Course detail |
| Can I bunk today? | 2×1 – 2×2 | One witty verdict line | Plan tab, today pre-selected |
| Danger list | 4×2 | Only yellow/red courses | Courses tab |

All five read Room through one `WidgetSnapshot` query. Refresh triggers: any mark (from anywhere), midnight, each class start/end, timetable or settings change, sync pull. Widget buttons write locally and instantly. Sync happens later.

### 4.3 Notifications (all local)
| Kind | When | Actions |
|---|---|---|
| Class reminder | `lead_time` before class | "Skip it" (plans absent if safe) |
| Mark prompt | Class end | **Present / Absent** |
| Daily digest | Chosen time | Open Today |
| Unmarked nudge | Evening, if unmarked classes today | Open Today |
| Threshold alert | Right after a mark turns a course yellow/red | Open course |
| Planned-skip reminder | Evening before a planned skip | Undo skip |

Scheduling: a daily planner job (WorkManager, just after midnight, and on boot, timezone change, timetable or settings change) computes the day's events and sets **exact alarms**. Respects mute, quiet hours and per-kind toggles. Asks for the Android 13+ notification permission and the exact-alarm permission with a clear explanation, and falls back to inexact alarms if denied.

### 4.4 Design system
- Material 3 with dynamic colour on Android 12+. Brand fallback: indigo `#4F46E5` (the existing brand colour).
- Status colours (green / amber / red) tuned for contrast in both light and dark themes. Never colour-only: always paired with an icon or text.
- Type: Inter (continuity with the old app). Motion: Material motion, swipe physics, haptic ticks on mark.
- Course colours: a fixed 12-colour palette that works in both themes.

---

## 5. Build, delivery, verification

### 5.1 CI (GitHub Actions, `.github/workflows/android.yml`)
On every push to `v2-native` (later `dev`):
1. Unit tests (`:domain`, `:data`), Android lint, Roborazzi screenshot tests (every screen + widget, light and dark).
2. Build the **signed release APK**.
3. On a version tag (`v2.0.0-m1`, …): publish the APK to **GitHub Releases**, with screenshots attached as artifacts.
4. Emulator job (Android emulator runner): install the APK, launch, run Compose UI smoke tests, capture real screenshots.

**GitHub secrets needed (one-time):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GOOGLE_WEB_CLIENT_ID`, `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.

### 5.2 Signing key (new)
Generated once at the start of Milestone 1. The owner gets the keystore file + passwords, stores **two backups** (e.g. Google Drive + phone), and pastes them into GitHub secrets. Losing it again means everyone reinstalls again, so the backups matter.

### 5.3 In-app updates
Sideloaded app → Profile shows "Update available" by checking the latest GitHub Release, and tapping it downloads the APK.

### 5.4 Owner's one-time setup (step-by-step guides provided at the time)
1. Approve creating the new Supabase project.
2. Google Cloud Console: OAuth consent screen + **Web** client ID + **Android** client ID (package name + SHA-1 of the new key, which I'll supply).
3. Paste the Web client ID + secret into the Supabase Google provider.
4. Add the GitHub secrets above.

### 5.5 Verification standard (every milestone)
- Unit + UI + screenshot tests green in CI. Screenshots reviewed.
- Database changes verified with real queries and the security advisor.
- An installable APK on GitHub Releases. The owner checks device-only behaviour: widgets on their launcher, notification buttons, offline marking, reboot survival.

---

## 6. Milestones

Each ends with a tagged, installable APK.

| # | Name | Delivers | Done when |
|---|---|---|---|
| **0** | Design | Phone-sized mockups of every screen, the onboarding wizard and all 5 widgets, light + dark, as a clickable page | Owner approves mockups |
| **1** | Foundation | Tag `web-app-archive`. Remove the old web app + clutter. Gradle project (3 modules, version catalog). Design system. Bottom-nav shell. New Supabase project + schema migrations + RLS. Login (Google + email). CI signed-APK pipeline | Owner signs in on their phone from a Release APK. Advisor clean. CI green |
| **2** | Core loop | `:domain` session generator + attendance math with full tests. Room + sync. Onboarding. Courses + timetable CRUD. Today with marking. Institute calendar seeded | Owner sets up a real semester and marks classes offline; marks appear in Supabase after reconnect |
| **3** | Smarts | Course detail + projections + history editing. Unified Planner with undo + "My plans". Calendar tab. Profile settings | Plans move the projections correctly. Tests cover planner edge cases |
| **4** | Widgets + notifications | All 5 Glance widgets. All notification kinds with actions. Alarm scheduler, boot/timezone handling | Owner marks from a widget and from a notification with the app closed; survives reboot |
| **5** | Polish + launch | Animations, haptics, empty/error states, accessibility pass (TalkBack labels, font scaling), performance check. Update checker. README | Owner sign-off → merge `v2-native` into `dev` → `v2.0.0` release → back up and pause the old Supabase project |

**Natural target:** v1 ready before the **Winter 2027 semester** starts (early January, to be confirmed). The Winter 2027 institute calendar gets seeded once IITG publishes it. No hard deadline.

**v2 candidates (after launch):** Deadlines, Grades/GPA, Insights, PDF/CSV export, multi-semester archive, timetable import, server push.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Aggressive battery savers (Xiaomi, Oppo, Vivo…) kill alarms | Re-plan on app open and on boot. Onboarding tip to allow "autostart / no battery restriction". Notifications are a convenience; the app is always correct when opened |
| Exact-alarm permission denied | Fall back to inexact alarms. Reminders may drift a few minutes |
| Google sign-in config mistakes (SHA-1, client IDs) | Email/password always works as a fallback. Step-by-step setup guide |
| Glance layout limits on odd launchers | Screenshot-test every widget size. Keep layouts simple. Owner tests on their launcher |
| Losing the new signing key | Two backups, recorded in this doc's checklist |
| Old users stranded | The old APK just loads the Pages site, so a final web deploy can show a banner: "AttendWise v2 is here — uninstall this app and install the new one". Old project stays up until launch |

---

## 8. Immediately next
1. **Milestone 0:** produce the screen + widget mockups for approval.
2. Then Milestone 1 starts with the archive tag and the project skeleton.
