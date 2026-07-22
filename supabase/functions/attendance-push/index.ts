// Scheduled push job: finds users who currently have a course below its
// attendance requirement and pushes them an FCM notification -- the one thing
// local notifications can't do while the app is closed. Invoked by pg_cron,
// which passes a shared secret in the `x-cron-secret` header.
//
// Required Edge Function secrets (set via `supabase secrets set` or the
// dashboard):
//   FCM_SERVICE_ACCOUNT  the Firebase service-account JSON (as a single string)
//   CRON_SECRET          any long random string, also used in the cron job
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type ServiceAccount = { client_email: string; private_key: string; project_id: string }

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "")
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// Mint a Google OAuth2 access token from the service account (JWT bearer grant).
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))
  const claim = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  )
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signingInput = `${header}.${claim}`
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput))
  const jwt = `${signingInput}.${b64url(sig)}`

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token as string
}

// Sends one FCM v1 message. Returns "ok", or "invalid" if the token is dead.
async function sendFcm(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
): Promise<"ok" | "invalid" | "error"> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: { token, notification: { title, body }, android: { priority: "high" } },
    }),
  })
  if (res.ok) return "ok"
  if (res.status === 404 || res.status === 400) return "invalid" // UNREGISTERED / bad token
  console.error("fcm send error", res.status, await res.text())
  return "error"
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 })
  }

  const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "{}") as ServiceAccount
  if (!sa.private_key || !sa.project_id) {
    return new Response("FCM_SERVICE_ACCOUNT not configured", { status: 500 })
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  const { data: targets, error } = await supabase.rpc("attendance_push_targets")
  if (error) return new Response(`rpc error: ${error.message}`, { status: 500 })
  if (!targets || targets.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

  const accessToken = await getAccessToken(sa)
  let sent = 0

  for (const t of targets as { user_id: string; at_risk_count: number }[]) {
    // Dedup: one at-risk push per user per day. The insert only "wins" (returns
    // a row) the first time today; a duplicate returns nothing and we skip.
    const { data: logRow } = await supabase
      .from("push_log")
      .upsert({ user_id: t.user_id, kind: "at_risk" }, { onConflict: "user_id,kind,sent_on", ignoreDuplicates: true })
      .select()
    if (!logRow || logRow.length === 0) continue

    const { data: tokens } = await supabase.from("device_tokens").select("token").eq("user_id", t.user_id)
    if (!tokens || tokens.length === 0) continue

    const n = t.at_risk_count
    const title = "Attendance warning"
    const body = `${n} course${n === 1 ? "" : "s"} below your attendance requirement. Open AttendWise to check.`

    for (const { token } of tokens) {
      const result = await sendFcm(accessToken, sa.project_id, token, title, body)
      if (result === "ok") sent++
      else if (result === "invalid") await supabase.from("device_tokens").delete().eq("token", token)
    }
  }

  return new Response(JSON.stringify({ sent }), { status: 200, headers: { "content-type": "application/json" } })
})
