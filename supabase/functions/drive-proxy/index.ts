// drive-proxy: streams a publicly-shared ("Anyone with the link") Google Drive
// file through the server so the in-app PDF viewer (pdf.js) can fetch it despite
// Google Drive not sending CORS headers. Nothing is stored -- the bytes are
// streamed straight back and discarded. Files that aren't publicly shared can't
// be read, so they're reported as blocked (HTTP 403 { error: "not_public" }).
//
// verify_jwt stays ON: the app calls this with its Supabase anon key, so it
// isn't an open relay for the whole internet.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "content-length, content-type, content-range, accept-ranges",
}

const blocked = () =>
  new Response(JSON.stringify({ error: "not_public" }), {
    status: 403,
    headers: { ...CORS, "content-type": "application/json" },
  })

// Drive shows a "can't scan for viruses" interstitial for larger files. Parse
// its download form (the modern one posts to drive.usercontent.google.com) so
// we can complete the download.
function parseInterstitial(html: string, id: string): string | null {
  const actionMatch = html.match(/action="(https:\/\/drive\.usercontent\.google\.com\/download[^"]*)"/)
  const params = new URLSearchParams()
  const inputRe = /<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = inputRe.exec(html))) params.set(m[1], m[2])
  if (actionMatch) {
    const action = actionMatch[1].replace(/&amp;/g, "&")
    const [base, qs] = action.split("?")
    const merged = new URLSearchParams(qs || "")
    for (const [k, v] of params) merged.set(k, v)
    merged.set("id", id)
    merged.set("export", "download")
    return `${base}?${merged.toString()}`
  }
  const token = html.match(/confirm=([0-9A-Za-z_-]+)/)
  if (token) return `https://drive.google.com/uc?export=download&confirm=${token[1]}&id=${id}`
  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })
  const id = new URL(req.url).searchParams.get("id") || ""
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) return new Response("bad id", { status: 400, headers: CORS })

  // Forward the browser's Range header so pdf.js can render the first page from
  // a small byte range instead of downloading the whole PDF first.
  const range = req.headers.get("range") || undefined
  const upstreamHeaders: HeadersInit = range ? { range } : {}

  try {
    let resp = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { redirect: "follow", headers: upstreamHeaders })
    let ct = resp.headers.get("content-type") || ""

    if (ct.includes("text/html")) {
      const next = parseInterstitial(await resp.text(), id)
      if (!next) return blocked()
      resp = await fetch(next, { redirect: "follow", headers: upstreamHeaders })
      ct = resp.headers.get("content-type") || ""
    }

    // A permission wall / login page comes back as HTML, not the file.
    if (!resp.ok || ct.includes("text/html")) return blocked()

    const headers = new Headers(CORS)
    headers.set("content-type", "application/pdf")
    headers.set("accept-ranges", "bytes")
    for (const h of ["content-length", "content-range"]) {
      const v = resp.headers.get(h)
      if (v) headers.set(h, v)
    }
    headers.set("cache-control", "private, max-age=300")
    // Relay upstream status (206 when the range was honoured, else 200).
    return new Response(resp.body, { status: resp.status, headers })
  } catch {
    return blocked()
  }
})
