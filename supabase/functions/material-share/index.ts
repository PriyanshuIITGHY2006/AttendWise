// Public resolver for a material share link. verify_jwt is OFF so anyone with a
// token can open the file -- no login, no allow-list. Security rests entirely on
// the token being a high-entropy, unguessable secret: this function ONLY accepts
// a token, looks up the one material it maps to (via the service role, which
// bypasses RLS), and returns a short-lived signed URL for that single file. It
// can't be steered to any other object. Revoking the material_shares row kills
// the link instantly.
//
// Only file-backed materials are shareable this way. External-link materials
// (e.g. a Google Drive URL) return not_shareable -- the owner shares those at
// the source instead.
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })

const R2 = "r2:"
const isR2 = (p: string) => p.startsWith(R2)
const r2Key = (p: string) => p.slice(R2.length)
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

  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: "bad_request" }, 400)
  }
  const token = (body.token ?? "").trim()
  if (!token) return json({ error: "bad_request" }, 400)

  // Service role: read the share row + its material regardless of RLS.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const { data: share } = await admin
    .from("material_shares")
    .select("material_id, materials(title, file_path, external_link)")
    .eq("token", token)
    .maybeSingle()

  const material = (share as { materials?: { title: string; file_path: string | null; external_link: string | null } } | null)?.materials
  if (!material) return json({ error: "not_found" }, 404)
  if (!material.file_path) return json({ error: "not_shareable" }, 422)

  const path = material.file_path
  let url: string
  if (isR2(path)) {
    const cfg = r2Config()
    if (!cfg) return json({ error: "r2_not_configured" }, 501)
    const aws = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: "auto", service: "s3" })
    const signed = await aws.sign(
      new Request(`https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${encodeKey(r2Key(path))}?X-Amz-Expires=3600`, { method: "GET" }),
      { aws: { signQuery: true } },
    )
    url = signed.url
  } else {
    const { data, error } = await admin.storage.from("materials").createSignedUrl(path, 3600)
    if (error || !data) return json({ error: "sign_failed" }, 500)
    url = data.signedUrl
  }

  return json({ title: material.title, path, url })
})
