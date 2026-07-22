# Server push (FCM) setup

The code for true server-driven push is all in place — this is the one-time
setup only you can do (Firebase + credentials + a native rebuild). Once done,
AttendWise can push notifications while the app is fully closed (starting with
an attendance-warning push when a course drops below its requirement).

What's already built:
- `device_tokens` + `push_log` tables (with RLS)
- `attendance_push_targets()` RPC (respects mute / threshold-alert settings)
- `attendance-push` Edge Function (deployed) — mints FCM tokens, sends, dedups
- Client registration (`usePushRegistration`) wired into the app
- `supabase/setup-push-cron.sql` — the schedule to run once secrets are set

Android app id: **`in.ac.iitg.attendwise`**

---

## 1. Create a Firebase project
1. https://console.firebase.google.com → **Add project**.
2. Add an **Android app**; package name **`in.ac.iitg.attendwise`**.
3. Download **`google-services.json`** → place it in **`android/app/google-services.json`**.

## 2. Add Firebase to the Android build
**Already done** — `npx cap sync` wired this up when the push plugin was
installed. `android/build.gradle` already has the
`com.google.gms:google-services` classpath, and `android/app/build.gradle`
applies the plugin automatically once `google-services.json` is present. Nothing
to edit; just make sure step 1 dropped `google-services.json` into
`android/app/`. Ignore Firebase's "Add Firebase SDK" (analytics/BoM) step — the
push plugin brings Firebase Messaging itself.

## 3. Get the service-account key
Firebase console → **Project settings → Service accounts → Generate new private
key**. This downloads a JSON file (keep it secret — never commit it).

## 4. Set the Edge Function secrets
Pick any long random string for `CRON_SECRET`. Then, via the Supabase dashboard
(Edge Functions → attendance-push → Secrets) or the CLI:
```bash
supabase secrets set CRON_SECRET="<long-random-string>"
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat path/to/service-account.json)"
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.)

## 5. Schedule the job
Open `supabase/setup-push-cron.sql`, replace `<CRON_SECRET>` with the same value
from step 4, and run it in the Supabase SQL editor. It runs the push daily at
19:00 IST (adjust the cron expression if you like).

## 6. Rebuild & install the app
```bash
npm run build
npx cap sync android
```
Then open `android/` in Android Studio, build a signed APK, and install it. The
web (GitHub Pages) build keeps working unchanged — push is native-only.

## 7. Test
1. Open the installed app and sign in — this registers the device token
   (check: `select * from device_tokens;` should show a row).
2. Manually trigger the function:
   ```bash
   curl -X POST https://jlueyxbqknnmcoesgnmg.supabase.co/functions/v1/attendance-push \
     -H "x-cron-secret: <CRON_SECRET>"
   ```
   If a course is below its threshold, you get a push. `{"sent":0}` means nobody
   currently qualifies (or all were already notified today — see `push_log`).

---

### Notes
- The server push respects each user's **Notifications** settings: it skips
  anyone who is globally muted or has **Attendance warnings** turned off.
- Dedup is one at-risk push per user per day (`push_log`).
- Dead tokens are auto-removed when FCM reports them unregistered.
- To add more push types later (e.g. a server-side daily digest), extend the
  Edge Function and add a new `kind` to `push_log`.
