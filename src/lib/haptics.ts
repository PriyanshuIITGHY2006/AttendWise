// Lightweight tactile feedback for taps. Uses the Web Vibration API, which the
// Android WebView supports, so we get a subtle buzz on native without pulling in
// a Capacitor plugin (and the extra manifest/permission churn that comes with
// it). On desktop / unsupported browsers this is a silent no-op.
//
// Kept deliberately tiny and defensive: some browsers throw if vibrate is called
// outside a user gesture, so every call is wrapped.

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern)
    }
  } catch {
    /* vibration unavailable or blocked -- ignore */
  }
}

/** A short, light tick for routine taps (toggles, small actions). */
export function tapFeedback() {
  vibrate(10)
}

/** A slightly firmer buzz for a completed/confirmed action. */
export function successFeedback() {
  vibrate([12, 40, 18])
}
