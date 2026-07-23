// Presigned-URL broker for storing Materials files in Cloudflare R2 instead of
// Supabase Storage (10 GB free + free egress). R2 credentials never leave the
// server: the client asks this function for a short-lived presigned URL and then
// PUTs/GETs the object directly against R2.
//
// verify_jwt is ON, so Supabase validates the caller's session before we run;
// we additionally scope every key to the caller's user id.
//
// Required Edge Function secrets (only when using R2 -- absent = the client
// falls back to Supabase Storage):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })

// Encode an object key for a URL path while keeping "/" as separators.
const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/")

function r2Config() {
  const accountId = Deno.env.get("R2_ACCOUNT_ID")
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")
  const bucket = Deno.env.get("R2_BUCKET")
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const cfg = r2Config()
  if (!cfg) return json({ error: "r2_not_configured" }, 501)

  // Identify the caller from their JWT (already validated by verify_jwt).
  const authHeader = req.headers.get("Authorization") ?? ""
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return json({ error: "unauthorized" }, 401)

  const aws = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: "auto", service: "s3" })
  const base = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`
  const presign = async (key: string, method: "GET" | "PUT") => {
    const url = `${base}/${encodeKey(key)}?X-Amz-Expires=3600`
    const signed = await aws.sign(new Request(url, { method }), { aws: { signQuery: true } })
    return signed.url
  }

  let body: { action?: string; name?: string; courseId?: string; keys?: string[]; key?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: "bad_request" }, 400)
  }

  // Defence in depth: never let a caller touch a key outside their own prefix.
  const owns = (key: string) => key === `${userId}` || key.startsWith(`${userId}/`)

  if (body.action === "sign-upload") {
    const name = (body.name ?? "file").replace(/[^\w.\-() ]+/g, "_")
    const courseId = body.courseId ?? "misc"
    const key = `${userId}/${courseId}/${Date.now()}_${name}`
    return json({ key, url: await presign(key, "PUT") })
  }

  if (body.action === "sign-download") {
    const keys = (body.keys ?? []).filter(owns)
    const urls: Record<string, string> = {}
    await Promise.all(keys.map(async (k) => { urls[k] = await presign(k, "GET") }))
    return json({ urls })
  }

  if (body.action === "delete") {
    const key = body.key
    if (!key || !owns(key)) return json({ error: "forbidden" }, 403)
    const res = await aws.fetch(`${base}/${encodeKey(key)}`, { method: "DELETE" })
    return json({ ok: res.ok })
  }

  return json({ error: "unknown_action" }, 400)
})
