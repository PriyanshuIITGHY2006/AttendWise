import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { resolveShare } from "../features/materials/api"
import { fileKind, isViewable, displayName } from "../features/materials/fileKind"
import { DocViewer, type OpenDoc } from "../features/materials/DocViewer"

// Public, link-only viewer. Reachable at /s/:token with NO login: the token is
// resolved by the `material-share` edge function, which returns a short-lived
// signed URL for that one file. View + zoom + download only -- no annotations,
// no account data.
export function SharedMaterial() {
  const { token } = useParams<{ token: string }>()
  const [doc, setDoc] = useState<OpenDoc | null>(null)
  const [status, setStatus] = useState<"loading" | "gone" | "unviewable" | "ready">("loading")

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const { title, path, url } = await resolveShare(token)
        if (cancelled) return
        const kind = fileKind(path)
        if (!isViewable(kind)) {
          // Docs/other: nothing to render in-app -- just hand off the file.
          window.location.replace(url)
          setStatus("unviewable")
          return
        }
        setDoc({ id: token, name: displayName(title, path), kind, url, notes: "" })
        setStatus("ready")
      } catch {
        if (!cancelled) setStatus("gone")
      }
    })()
    return () => { cancelled = true }
  }, [token])

  if (status === "ready" && doc) {
    return (
      <DocViewer
        docs={[doc]}
        activeId={doc.id}
        onActivate={() => {}}
        onCloseTab={() => {}}
        onMinimize={() => { window.location.href = import.meta.env.BASE_URL }}
        onNotesChange={() => {}}
        readOnly
      />
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center text-neutral-300">
      {status === "loading" ? (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-indigo-400" />
          <p className="text-sm">Opening shared file…</p>
        </>
      ) : status === "unviewable" ? (
        <p className="text-sm">Downloading…</p>
      ) : (
        <>
          <svg viewBox="0 0 24 24" className="h-10 w-10 text-neutral-600" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" /></svg>
          <p className="text-sm font-medium text-neutral-200">This link isn't available</p>
          <p className="max-w-xs text-xs text-neutral-500">It may have been revoked, or the file was removed.</p>
          <a href={import.meta.env.BASE_URL} className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Open AttendWise</a>
        </>
      )}
    </div>
  )
}
