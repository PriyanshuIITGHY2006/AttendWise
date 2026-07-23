import { useCallback, useEffect, useRef, useState } from "react"
import type { FileKind } from "./fileKind"
import type { LoadedPdf } from "./renderPdf"

export type OpenDoc = {
  id: string
  name: string
  kind: FileKind // "image" | "pdf"
  url: string
  notes: string
}

const ZOOMS = [1, 1.5, 2, 3] as const

/**
 * Multi-tab document viewer. Open PDFs/images from anywhere in the explorer
 * accumulate as tabs; each keeps its own zoom + render, and a notes panel is
 * attached to whichever tab is active. "Files" minimises back to the explorer
 * without closing the tabs.
 */
export function DocViewer({
  docs,
  activeId,
  onActivate,
  onCloseTab,
  onMinimize,
  onNotesChange,
}: {
  docs: OpenDoc[]
  activeId: string
  onActivate: (id: string) => void
  onCloseTab: (id: string) => void
  onMinimize: () => void
  onNotesChange: (id: string, notes: string) => void
}) {
  const [zoomById, setZoomById] = useState<Record<string, number>>({})
  const [notesOpen, setNotesOpen] = useState(false)
  const active = docs.find((d) => d.id === activeId) ?? docs[0]

  const setZoom = (fn: (z: number) => number) =>
    setZoomById((prev) => ({ ...prev, [active.id]: fn(prev[active.id] ?? 1) }))
  const zoomIn = () => setZoom((z) => ZOOMS[Math.min(ZOOMS.indexOf(z as (typeof ZOOMS)[number]) + 1, ZOOMS.length - 1)] ?? z)
  const zoomOut = () => setZoom((z) => ZOOMS[Math.max(ZOOMS.indexOf(z as (typeof ZOOMS)[number]) - 1, 0)] ?? z)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") (notesOpen ? setNotesOpen(false) : onMinimize())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [notesOpen, onMinimize])

  if (!active) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950/95 backdrop-blur-sm"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 text-neutral-100">
        <button onClick={onMinimize} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm hover:bg-white/10" aria-label="Back to files">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="hidden sm:inline">Files</span>
        </button>
        <div className="min-w-0 flex-1" />
        <button onClick={zoomOut} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Zoom out">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" strokeLinecap="round" /></svg>
        </button>
        <button onClick={zoomIn} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Zoom in">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
        </button>
        <button
          onClick={() => setNotesOpen((v) => !v)}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${notesOpen ? "bg-white/15 text-white" : "hover:bg-white/10"}`}
          aria-label="Notes"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" /><path d="M8 12h8M8 16h5" strokeLinecap="round" /></svg>
          {active.notes.trim() && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-400" />}
        </button>
        <a href={active.url} download={active.name} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Download">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </div>

      {/* tab strip */}
      <div className="flex gap-1 overflow-x-auto px-2 pb-2">
        {docs.map((d) => {
          const isActive = d.id === active.id
          return (
            <div
              key={d.id}
              className={`group flex h-8 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-lg pl-2.5 pr-1 text-xs ${isActive ? "bg-white text-neutral-900" : "bg-white/10 text-neutral-300 hover:bg-white/15"}`}
            >
              <button onClick={() => onActivate(d.id)} className="min-w-0 truncate py-1.5">
                {d.name}
              </button>
              <button onClick={() => onCloseTab(d.id)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${isActive ? "hover:bg-neutral-200" : "hover:bg-white/20"}`} aria-label="Close tab">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
              </button>
            </div>
          )
        })}
      </div>

      {/* content + notes (notes stack below on mobile, side panel on desktop) */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="relative min-h-0 min-w-0 flex-1">
          {docs.map((d) => (
            <div key={d.id} className={d.id === active.id ? "absolute inset-0" : "hidden"}>
              {d.kind === "image" ? (
                <ImagePane url={d.url} zoom={zoomById[d.id] ?? 1} />
              ) : (
                <PdfPane url={d.url} zoom={zoomById[d.id] ?? 1} active={d.id === active.id} />
              )}
            </div>
          ))}
        </div>

        {notesOpen && (
          <NotesPanel
            key={active.id}
            initial={active.notes}
            onChange={(v) => onNotesChange(active.id, v)}
            onClose={() => setNotesOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

function NotesPanel({ initial, onChange, onClose }: { initial: string; onChange: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handle = useCallback(
    (v: string) => {
      setValue(v)
      setSaved(false)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        onChange(v)
        setSaved(true)
      }, 600)
    },
    [onChange],
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <div className="flex h-[45vh] w-full shrink-0 flex-col border-t border-white/10 bg-neutral-900 sm:h-auto sm:w-80 sm:border-l sm:border-t-0">
      <div className="flex items-center justify-between px-3 py-2 text-neutral-200">
        <span className="text-sm font-medium">Notes</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">{saved ? "Saved" : "Saving…"}</span>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 sm:hidden" aria-label="Close notes">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(e) => handle(e.target.value)}
        placeholder="Jot notes for this file…"
        className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
        autoFocus
      />
    </div>
  )
}

// The height is "45vh" on both, but on sm+ we want full height side panel.
// Tailwind can't express that inline; override via a wrapper class instead.

function ImagePane({ url, zoom }: { url: string; zoom: number }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <div className="h-full w-full overflow-auto">
      <div className="flex min-h-full min-w-full items-center justify-center p-4">
        {!loaded && !failed && <Spinner />}
        {failed ? (
          <p className="text-sm text-neutral-400">Couldn't load this image.</p>
        ) : (
          <img
            src={url}
            alt=""
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.15s ease" }}
            className={`max-h-full max-w-full select-none object-contain ${loaded ? "opacity-100" : "opacity-0"}`}
            draggable={false}
          />
        )}
      </div>
    </div>
  )
}

function PdfPane({ url, zoom, active }: { url: string; zoom: number; active: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const pdfRef = useRef<LoadedPdf | null>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const startedRef = useRef(false)
  const renderedZoom = useRef<number | null>(null)

  // Load the document on first activation (lazy-imports pdf.js).
  useEffect(() => {
    if (!active || startedRef.current) return
    startedRef.current = true
    setStatus("loading")
    let cancelled = false
    ;(async () => {
      try {
        const { loadPdf } = await import("./renderPdf")
        const pdf = await loadPdf(url)
        if (cancelled) return pdf.destroy()
        pdfRef.current = pdf
        setNumPages(pdf.numPages)
        setStatus("ready")
      } catch {
        if (!cancelled) setStatus("error")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, url])

  // Destroy on unmount (tab closed).
  useEffect(() => () => pdfRef.current?.destroy(), [])

  // Render pages when ready+visible, or when zoom changes.
  useEffect(() => {
    if (status !== "ready" || !active || !pdfRef.current) return
    if (renderedZoom.current === zoom) return
    const container = scrollRef.current
    if (!container) return
    renderedZoom.current = zoom
    const width = Math.min(container.clientWidth - 24, 1000) * zoom
    let cancelled = false
    ;(async () => {
      for (let n = 1; n <= numPages; n++) {
        const canvas = canvasRefs.current[n - 1]
        if (!canvas || cancelled) continue
        try {
          await pdfRef.current!.renderPage(n, canvas, width)
        } catch {
          /* skip */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, active, zoom, numPages])

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-neutral-400">Couldn't open this PDF. Try downloading it instead.</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full w-full overflow-auto px-3 py-3">
      {status !== "ready" && (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      )}
      <div className="mx-auto flex w-fit flex-col items-center gap-3">
        {Array.from({ length: numPages }, (_, i) => (
          <canvas
            key={i}
            ref={(el) => {
              canvasRefs.current[i] = el
            }}
            className="max-w-full rounded bg-white shadow-lg"
          />
        ))}
      </div>
    </div>
  )
}

function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" role="status" aria-label="Loading" />
}
