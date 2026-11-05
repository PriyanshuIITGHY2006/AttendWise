---
title: Updating the app
description: How AttendWise updates itself, how to check for updates by hand, and the difference between the real app and the test build.
order: 8
updated: 2026-11-05
---

AttendWise is installed from a downloaded file instead of an app store, so it updates itself.

## How an update works

1. When you open the app, it checks GitHub Releases for a newer build.
2. If there is one, a bar above the tabs says **Build N is available**. Tap **Update**.
3. The app downloads it and shows progress, then says the build is ready.
4. Android shows its install prompt. Confirm, and the new version installs over the old one. Your data stays.

The first time, Android asks you to allow AttendWise to install updates. Allow it, then tap **Update** again.

## Check by hand

Open **Profile** and tap **Check for updates**. The version you have is shown at the bottom of Profile.

## Real app and test build

Each release has two files:

- `AttendWise-N.apk` is the real, signed app. It installs as **AttendWise**.
- `AttendWise-test-N.apk` is a test build. It installs next to the real app as **AttendWise test**, as a separate app.

An update only replaces the same kind of app. Real updates the real app, and test updates the test app. If you installed the test build by mistake, sign in on the real app and then uninstall the test one.

## Updating by hand

If the in-app update does not work, or you have a very early build from before updates existed, download the newest file from the [home page](/AttendWise/) or from [Releases](https://github.com/PriyanshuIITGHY2006/AttendWise/releases), open it and install it over the old one. See what changed in the [changelog](/AttendWise/changelog.html).

## Update does not install

See [troubleshooting](/AttendWise/help/troubleshooting.html).
