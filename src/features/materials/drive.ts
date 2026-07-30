// Helpers for opening a Google Drive file link inside the app's PDF viewer.
// Only uploaded files (/file/d/... or ?id=...) are handled -- native Google
// Docs/Sheets/Slides aren't real PDFs, so those fall through to opening in Drive.

export function driveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  return m ? m[1] : null
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// The drive-proxy edge function streams a publicly-shared Drive PDF back with
// CORS headers so pdf.js can load it. Nothing is stored; the anon key just keeps
// the proxy from being an open relay.
export function drivePdfSource(fileId: string): { url: string; httpHeaders: Record<string, string> } {
  return {
    url: `${SUPABASE_URL}/functions/v1/drive-proxy?id=${fileId}`,
    httpHeaders: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  }
}
