# AttendWise

A native Android app for college attendance: today's classes, safe skips per course, a day-off planner, the institute calendar with day swaps, and home-screen widgets. Built with Kotlin, Jetpack Compose and Glance.

The previous React/Capacitor web app is preserved on the `web-app-archive` branch.

## Project layout

| Module | What it holds |
|---|---|
| `domain/` | Pure Kotlin. Every attendance rule: class generation from the timetable and institute calendar, attendance maths, the planner, next-class and notification timing, validation. No Android dependency, fully unit-tested. |
| `data/`, `app/` | Android modules (database, sync, UI, widgets). Coming next. |

Plans and decisions: `docs/V2_PLAN.md` and `docs/REBUILD_HANDOFF.md`.

## Running the tests

```bash
./gradlew :domain:test
```

Requires JDK 17 or newer. The test report is written to `domain/build/reports/tests/test/index.html`.
