# Changelog

What changed in each AttendWise version, newest first. Version numbers follow the build number, so 2.0.8 is build 8. Builds that only changed this website are not listed.

## 2.0.8 - 2026-11-05

A new logo, and an icon that tells you how you are doing.

### Added
- A new logo.
- The launcher icon changes colour with your attendance: green when every course is at or above its requirement, red when most are below it, and blue otherwise or before you mark any class.

## 2.0.7 - 2026-11-05

The app can now update itself, and course stats are plainer.

### Added
- In-app updates. On launch the app looks for a newer build on GitHub Releases and shows a bar above the tabs. Tap Update to download it with progress and install it over the running app. Test builds update from the test APK, and the real app from the signed one.
- Check for updates in Profile, to do the same on demand.

### Changed
- Course detail shows attended, missed, left and planned classes as plain rows instead of four boxes.
- The Courses screen states what needs attention in one line instead of three coloured tiles.
- Dot separators are replaced with plain wording across the screens, widgets and notifications.

### Fixed
- Attendance options wrap, and Custom opens a small number dialog.
- The Runs for control is a three-part switch.
- Reminder times wrap instead of getting squeezed.
- The voice and theme switches no longer squeeze their labels.
- The Undo message after planning a skip goes away by itself.

## 2.0.4 - 2026-11-05

The first build with the signed app.

### Added
- The signed `AttendWise-4.apk`, which installs as the real AttendWise app. Earlier builds had only the test APK.

## 2.0.3 - 2026-11-05

The first public build of the native Android app.

### Added
- Sign in with Google or email, onboarding, and a course editor that keeps your timetable history.
- Today with swipe marking, Courses, course detail, Plan, Calendar and Profile screens.
- Five home screen widgets: Today, Next class, Course ring, Can I bunk today and Needs attention.
- Notifications with Present, Absent and Cancelled buttons, scheduled on the device and set again after every change, restart or time change.
- Two-way sync with your account, and a database that keeps working with no internet.
