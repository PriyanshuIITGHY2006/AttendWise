import { useCallback, useEffect, useRef, useState } from "react"
import type { FileKind } from "./fileKind"
import type { LoadedPdf } from "./renderPdf"
import {
  listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation, type PdfAnnotation,
  listInk, createInkStroke, deleteInkStrokes, type InkStroke,
} from "./api"

export type OpenDoc = {
  id: string
  name: string
  kind: FileKind // "image" | "pdf"
  url: string
  notes: string
}

const clampZoom = (z: number) => Math.min(5, Math.max(0.4, z))
const NOTE_COLORS = ["#fde047", "#fca5a5", "#86efac", "#93c5fd", "#f0abfc"]

// Pen palette + widths (widths are fractions of page width, so a stroke keeps
// the same visual thickness at any zoom).
type Tool = "pan" | "pen" | "eraser" | "note"
const PEN_COLORS = ["#ef4444", "#2563eb", "#111827", "#16a34a", "#eab308"]
const PEN_WIDTHS = [0.0022, 0.0042, 0.0075]
type Pt = [number, number]

// Non-passive two-finger pinch + ctrl/⌘-wheel zoom, plus double-tap to toggle
// zoom, on an element. `enableDoubleTap` is off in annotate mode so quick taps
// there place notes instead of zooming.
function usePinchZoom(
  ref: React.RefObject<HTMLElement | null>,
  zoom: number,
  onZoom: (z: number) => void,
  enableDoubleTap = true,
) {
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const dtRef = useRef(enableDoubleTap)
  dtRef.current = enableDoubleTap
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let startDist = 0
    let startZoom = 1
    let lastTap = 0
    let pinched = false
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches)
        startZoom = zoomRef.current
        pinched = true
      }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault()
        onZoom(clampZoom((startZoom * dist(e.touches)) / startDist))
      }
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0
      // Double-tap toggles between fit (1x) and 2.2x, but not right after a
      // pinch and not while placing notes.
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        if (pinched) {
          pinched = false
          lastTap = 0
          return
        }
        const now = Date.now()
        if (dtRef.current && now - lastTap < 300) {
          onZoom(zoomRef.current > 1.15 ? 1 : 2.2)
          lastTap = 0
        } else {
          lastTap = now
        }
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        onZoom(clampZoom(zoomRef.current * (e.deltaY < 0 ? 1.08 : 0.92)))
      }
    }
    el.addEventListener("touchstart", onStart, { passive: false })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd)
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("wheel", onWheel)
    }
  }, [ref, onZoom])
}

/**
 * Multi-tab document viewer: split view, per-tab pinch-zoom, personal sticky-note
 * annotations placed anywhere on a PDF, and a free-text notes panel.
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
  const [split, setSplit] = useState(false)
  const [laneBId, setLaneBId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>("pan")
  const [penColor, setPenColor] = useState(PEN_COLORS[0])
  const [penWidth, setPenWidth] = useState(PEN_WIDTHS[1])

  const active = docs.find((d) => d.id === activeId) ?? docs[0]

  useEffect(() => {
    if (docs.length < 2 && split) setSplit(false)
    if (split && (!laneBId || !docs.some((d) => d.id === laneBId) || laneBId === activeId)) {
      setLaneBId(docs.find((d) => d.id !== activeId)?.id ?? null)
    }
  }, [docs, split, laneBId, activeId])

  const laneB = split ? docs.find((d) => d.id === laneBId) ?? null : null
  const focused = docs.find((d) => d.id === focusedId) ?? active
  const panes = split && laneB ? [active, laneB] : [active]

  const zoomOf = (id: string) => zoomById[id] ?? 1
  const setZoom = (id: string, z: number) => setZoomById((p) => ({ ...p, [id]: clampZoom(z) }))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") notesOpen ? setNotesOpen(false) : onMinimize()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [notesOpen, onMinimize])

  if (!active) return null
  const focusId = focused?.id ?? active.id

  const iconBtn = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"

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
        <button onClick={() => setZoom(focusId, zoomOf(focusId) * 0.8)} className={`${iconBtn} hover:bg-white/10`} aria-label="Zoom out">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" strokeLinecap="round" /></svg>
        </button>
        <button
          onClick={() => setZoom(focusId, 1)}
          className="h-9 shrink-0 rounded-lg px-1.5 text-xs font-medium tabular-nums text-neutral-300 hover:bg-white/10"
          aria-label="Reset zoom to 100%"
          title="Reset zoom"
        >
          {Math.round(zoomOf(focusId) * 100)}%
        </button>
        <button onClick={() => setZoom(focusId, zoomOf(focusId) * 1.25)} className={`${iconBtn} hover:bg-white/10`} aria-label="Zoom in">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
        </button>
        {focused?.kind === "pdf" && (
          <button
            onClick={() => setTool((t) => (t === "pan" ? "pen" : "pan"))}
            className={`${iconBtn} ${tool !== "pan" ? "bg-amber-400 text-neutral-900" : "hover:bg-white/10"}`}
            aria-label="Draw & annotate"
            title="Draw, erase, sticky notes"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" strokeLinecap="round" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
        <button onClick={() => { setSplit((v) => !v); setFocusedId(activeId) }} disabled={docs.length < 2} className={`${iconBtn} disabled:opacity-30 ${split ? "bg-white/15 text-white" : "hover:bg-white/10"}`} aria-label="Split view" title="Split view">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M12 4v16" /></svg>
        </button>
        <button onClick={() => setNotesOpen((v) => !v)} className={`relative ${iconBtn} ${notesOpen ? "bg-white/15 text-white" : "hover:bg-white/10"}`} aria-label="Notes">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" /><path d="M8 12h8M8 16h5" strokeLinecap="round" /></svg>
          {focused?.notes.trim() && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-400" />}
        </button>
        <a href={focused?.url} download={focused?.name} target="_blank" rel="noopener noreferrer" className={`${iconBtn} hover:bg-white/10`} aria-label="Download">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </div>

      {/* tab strip */}
      <div className="flex gap-1 overflow-x-auto px-2 pb-2">
        {docs.map((d) => {
          const isActive = d.id === active.id
          return (
            <div key={d.id} className={`group flex h-8 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-lg pl-2.5 pr-1 text-xs ${isActive ? "bg-white text-neutral-900" : "bg-white/10 text-neutral-300 hover:bg-white/15"}`}>
              <button onClick={() => { onActivate(d.id); setFocusedId(d.id) }} className="min-w-0 truncate py-1.5">{d.name}</button>
              <button onClick={() => onCloseTab(d.id)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${isActive ? "hover:bg-neutral-200" : "hover:bg-white/20"}`} aria-label="Close tab">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
              </button>
            </div>
          )
        })}
      </div>

      {/* drawing sub-toolbar */}
      {tool !== "pan" && focused?.kind === "pdf" && (
        <div className="flex items-center gap-2 overflow-x-auto px-2 pb-2">
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-white/5 p-1">
            <DrawToolBtn active={tool === "pen"} onClick={() => setTool("pen")} label="Pen">
              <path d="M12 20h9" strokeLinecap="round" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
            </DrawToolBtn>
            <DrawToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} label="Eraser">
              <path d="M20 20H8.5L3.5 15a2 2 0 0 1 0-2.8l7-7a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L14 20" strokeLinecap="round" strokeLinejoin="round" /><path d="m9 11 4 4" strokeLinecap="round" />
            </DrawToolBtn>
            <DrawToolBtn active={tool === "note"} onClick={() => setTool("note")} label="Sticky note">
              <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2Z" /><path d="M15 21v-6a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" />
            </DrawToolBtn>
          </div>

          {tool === "pen" && (
            <>
              <div className="flex shrink-0 items-center gap-1.5">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPenColor(c)}
                    className={`h-6 w-6 rounded-full ${penColor === c ? "ring-2 ring-white ring-offset-2 ring-offset-neutral-950" : ""}`}
                    style={{ backgroundColor: c }}
                    aria-label="Pen colour"
                  />
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {PEN_WIDTHS.map((w, i) => (
                  <button
                    key={w}
                    onClick={() => setPenWidth(w)}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${penWidth === w ? "bg-white/15" : "hover:bg-white/10"}`}
                    aria-label={["Thin", "Medium", "Thick"][i]}
                  >
                    <span className="rounded-full bg-white" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="min-w-0 flex-1" />
          <button onClick={() => setTool("pan")} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-300 hover:bg-white/10">Done</button>
        </div>
      )}

      {/* content + notes */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className={`flex min-h-0 min-w-0 flex-1 ${split ? "flex-col sm:flex-row" : ""}`}>
          {panes.map((d, i) => (
            <div
              key={`${i}-${d.id}`}
              onMouseDown={() => setFocusedId(d.id)}
              onTouchStart={() => setFocusedId(d.id)}
              className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${split && i === 1 ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""} ${split && d.id === focusId ? "ring-1 ring-inset ring-indigo-400/60" : ""}`}
            >
              {split && (
                <div className="flex h-8 shrink-0 items-center gap-2 bg-neutral-900/80 px-2 text-xs text-neutral-300">
                  {i === 0 ? (
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  ) : (
                    <select value={d.id} onChange={(e) => setLaneBId(e.target.value)} className="min-w-0 flex-1 truncate bg-transparent text-neutral-200 outline-none">
                      {docs.filter((o) => o.id !== active.id).map((o) => (<option key={o.id} value={o.id} className="bg-neutral-900">{o.name}</option>))}
                    </select>
                  )}
                  {i === 1 && (
                    <button onClick={() => setSplit(false)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-white/10" aria-label="Close split">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
              )}
              <div className="relative min-h-0 flex-1">
                {d.kind === "image" ? (
                  <ImagePane url={d.url} zoom={zoomOf(d.id)} onZoom={(z) => setZoom(d.id, z)} />
                ) : (
                  <PdfPane
                    key={d.id}
                    url={d.url}
                    materialId={d.id}
                    zoom={zoomOf(d.id)}
                    onZoom={(z) => setZoom(d.id, z)}
                    tool={d.id === focusId ? tool : "pan"}
                    penColor={penColor}
                    penWidth={penWidth}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {notesOpen && (
          <NotesPanel key={focusId} initial={focused?.notes ?? ""} onChange={(v) => onNotesChange(focusId, v)} onClose={() => setNotesOpen(false)} />
        )}
      </div>

      {tool !== "pan" && focused?.kind === "pdf" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="pointer-events-auto rounded-full bg-amber-400 px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-lg">
            {tool === "pen" ? "Draw on the page with your finger" : tool === "eraser" ? "Swipe over strokes to erase" : "Tap the page to drop a note"}
          </span>
        </div>
      )}
    </div>
  )
}

function DrawToolBtn({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`flex h-8 w-8 items-center justify-center rounded-md ${active ? "bg-amber-400 text-neutral-900" : "text-neutral-200 hover:bg-white/10"}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
    </button>
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
      timer.current = setTimeout(() => { onChange(v); setSaved(true) }, 600)
    },
    [onChange],
  )
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
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
      <textarea value={value} onChange={(e) => handle(e.target.value)} placeholder="Jot notes for this file…" className="min-h-0 flex-1 resize-none bg-transparent px-3 pb-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none" autoFocus />
    </div>
  )
}

function ImagePane({ url, zoom, onZoom }: { url: string; zoom: number; onZoom: (z: number) => void }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  usePinchZoom(ref, zoom, onZoom)
  return (
    <div ref={ref} className="h-full w-full overflow-auto" style={{ touchAction: "pan-x pan-y" }}>
      <div className="flex min-h-full min-w-full items-center justify-center p-4">
        {!loaded && !failed && <Spinner />}
        {failed ? (
          <p className="text-sm text-neutral-400">Couldn't load this image.</p>
        ) : (
          <img src={url} alt="" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.08s ease" }} className={`max-h-full max-w-full select-none object-contain ${loaded ? "opacity-100" : "opacity-0"}`} draggable={false} />
        )}
      </div>
    </div>
  )
}

function PdfPane({ url, materialId, zoom, onZoom, tool, penColor, penWidth }: { url: string; materialId: string; zoom: number; onZoom: (z: number) => void; tool: Tool; penColor: string; penWidth: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const pdfRef = useRef<LoadedPdf | null>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const [renderZoom, setRenderZoom] = useState(zoom)
  const renderedRef = useRef<number | null>(null)
  const [annos, setAnnos] = useState<PdfAnnotation[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [ink, setInk] = useState<InkStroke[]>([])
  const [page, setPage] = useState(1)
  const [jumpOpen, setJumpOpen] = useState(false)
  const scrollRaf = useRef(0)

  // Pinch/double-tap zoom only in pan mode -- while a drawing tool is active the
  // page is a fixed-size canvas so strokes land where you draw them.
  usePinchZoom(scrollRef, zoom, onZoom, tool === "pan")

  // Live pinch feedback via CSS transform; commit to a crisp re-render when the
  // zoom settles (debounced) so panning also works at the new size.
  useEffect(() => {
    const t = setTimeout(() => setRenderZoom(zoom), 160)
    return () => clearTimeout(t)
  }, [zoom])

  useEffect(() => {
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
      pdfRef.current?.destroy()
      pdfRef.current = null
      renderedRef.current = null
    }
  }, [url])

  useEffect(() => {
    listAnnotations(materialId).then(setAnnos).catch(() => {})
    listInk(materialId).then(setInk).catch(() => {})
  }, [materialId])

  // Commit a finished pen stroke: optimistic add, then persist (drop it back out
  // on failure).
  async function commitStroke(pageNo: number, points: Pt[], color: string, width: number) {
    const temp: InkStroke = { id: `tmp-${Date.now()}`, material_id: materialId, user_id: "", page: pageNo, color, width, points, created_at: "" }
    setInk((p) => [...p, temp])
    try {
      const saved = await createInkStroke({ material_id: materialId, page: pageNo, color, width, points })
      setInk((p) => p.map((s) => (s.id === temp.id ? saved : s)))
    } catch {
      setInk((p) => p.filter((s) => s.id !== temp.id))
    }
  }

  function eraseStrokes(ids: string[]) {
    setInk((p) => p.filter((s) => !ids.includes(s.id)))
    deleteInkStrokes(ids.filter((id) => !id.startsWith("tmp-"))).catch(() => {})
  }

  // Track which page is under the top of the viewport as you scroll (rAF-throttled).
  function onScroll() {
    if (scrollRaf.current) return
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0
      const cont = scrollRef.current
      if (!cont) return
      const top = cont.getBoundingClientRect().top
      let cp = 1
      for (let n = 0; n < numPages; n++) {
        const cv = canvasRefs.current[n]
        if (!cv) continue
        const r = cv.getBoundingClientRect()
        if (r.top - top <= r.height * 0.5) cp = n + 1
        else break
      }
      setPage(cp)
    })
  }

  function goToPage(n: number) {
    const target = Math.min(numPages, Math.max(1, n))
    canvasRefs.current[target - 1]?.scrollIntoView({ block: "start", behavior: "smooth" })
    setJumpOpen(false)
  }

  useEffect(() => {
    if (status !== "ready" || !pdfRef.current) return
    if (renderedRef.current === renderZoom) return
    const container = scrollRef.current
    if (!container) return
    renderedRef.current = renderZoom
    const width = Math.min(container.clientWidth - 24, 1000) * renderZoom
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
  }, [status, renderZoom, numPages])

  async function placeNote(page: number, x: number, y: number) {
    try {
      const created = await createAnnotation({ material_id: materialId, page, x, y })
      setAnnos((p) => [...p, created])
      setEditing(created.id)
    } catch {
      /* ignore */
    }
  }

  function patchAnno(id: string, patch: Partial<PdfAnnotation>) {
    setAnnos((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  async function removeAnno(id: string) {
    setAnnos((p) => p.filter((a) => a.id !== id))
    setEditing(null)
    await deleteAnnotation(id).catch(() => {})
  }

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-neutral-400">Couldn't open this PDF. Try downloading it instead.</p>
      </div>
    )
  }

  const scale = renderZoom > 0 ? zoom / renderZoom : 1

  return (
    <div className="relative h-full w-full">
    <div ref={scrollRef} onScroll={onScroll} className="h-full w-full overflow-auto px-3 py-3" style={{ touchAction: "pan-x pan-y" }}>
      {status === "loading" && (
        <div className="flex h-full items-center justify-center"><Spinner /></div>
      )}
      {/* w-max (not w-fit): the pages keep their true width and the container
          scrolls when zoomed in, instead of fit-content squashing them to the
          pane width. The canvas carries explicit style width/height from the
          renderer, so no max-width clamp here (that was distorting the aspect). */}
      <div className="mx-auto flex w-max flex-col items-center gap-3" style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
        {Array.from({ length: numPages }, (_, i) => (
          <PdfPageWrap
            key={i}
            annotate={tool === "note"}
            annos={annos.filter((a) => a.page === i + 1)}
            onPlace={(x, y) => placeNote(i + 1, x, y)}
            onOpen={setEditing}
            onDragEnd={(id, x, y) => { patchAnno(id, { x, y }); updateAnnotation(id, { x, y }).catch(() => {}) }}
            tool={tool}
            penColor={penColor}
            penWidth={penWidth}
            ink={ink.filter((s) => s.page === i + 1)}
            onInkCommit={(pts, color, width) => commitStroke(i + 1, pts, color, width)}
            onInkErase={eraseStrokes}
          >
            <canvas
              ref={(el) => { canvasRefs.current[i] = el }}
              className="block rounded bg-white shadow-lg"
            />
          </PdfPageWrap>
        ))}
      </div>

      {editing && (
        <NoteEditor
          anno={annos.find((a) => a.id === editing)!}
          onChange={(patch) => { patchAnno(editing, patch); updateAnnotation(editing, patch).catch(() => {}) }}
          onDelete={() => removeAnno(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>

      {/* page counter + jump-to-page (pan mode only, so it never overlaps the draw hint) */}
      {tool === "pan" && numPages > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          {jumpOpen ? (
            <form
              onSubmit={(e) => { e.preventDefault(); const v = Number((e.currentTarget.elements.namedItem("pg") as HTMLInputElement).value); if (Number.isFinite(v)) goToPage(v) }}
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-neutral-900/90 px-2 py-1 text-sm text-neutral-100 shadow-lg ring-1 ring-white/10"
            >
              <input name="pg" type="number" min={1} max={numPages} defaultValue={page} autoFocus onBlur={() => setJumpOpen(false)} className="w-12 rounded bg-neutral-800 px-1.5 py-0.5 text-center outline-none" />
              <span className="text-neutral-400">/ {numPages}</span>
            </form>
          ) : (
            <button
              onClick={() => setJumpOpen(true)}
              className="pointer-events-auto rounded-full bg-neutral-900/85 px-3 py-1.5 text-xs font-medium tabular-nums text-neutral-100 shadow-lg ring-1 ring-white/10 hover:bg-neutral-900"
              title="Jump to page"
            >
              {page} / {numPages}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PdfPageWrap({
  annotate,
  annos,
  onPlace,
  onOpen,
  onDragEnd,
  tool,
  penColor,
  penWidth,
  ink,
  onInkCommit,
  onInkErase,
  children,
}: {
  annotate: boolean
  annos: PdfAnnotation[]
  onPlace: (x: number, y: number) => void
  onOpen: (id: string) => void
  onDragEnd: (id: string, x: number, y: number) => void
  tool: Tool
  penColor: string
  penWidth: number
  ink: InkStroke[]
  onInkCommit: (points: Pt[], color: string, width: number) => void
  onInkErase: (ids: string[]) => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  function frac(clientX: number, clientY: number) {
    const r = ref.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)) }
  }

  return (
    <div
      ref={ref}
      className={`relative ${annotate ? "cursor-crosshair" : ""}`}
      onClick={(e) => {
        if (!annotate) return
        // Ignore clicks that land on an existing pin.
        if ((e.target as HTMLElement).closest("[data-pin]")) return
        const { x, y } = frac(e.clientX, e.clientY)
        onPlace(x, y)
      }}
    >
      {children}
      <InkLayer containerRef={ref} strokes={ink} tool={tool} color={penColor} width={penWidth} onCommit={onInkCommit} onErase={onInkErase} />
      {annos.map((a) => (
        <NotePin key={a.id} anno={a} containerRef={ref} onOpen={() => onOpen(a.id)} onDragEnd={(x, y) => onDragEnd(a.id, x, y)} />
      ))}
    </div>
  )
}

// Draws a smooth quadratic path through fractional points onto a canvas context.
function drawPath(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, lineWidth: number, W: number, H: number) {
  if (pts.length === 0) return
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(pts[0][0] * W, pts[0][1] * H)
  if (pts.length === 1) {
    ctx.lineTo(pts[0][0] * W + 0.1, pts[0][1] * H)
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const x = pts[i][0] * W
      const y = pts[i][1] * H
      const nx = pts[i + 1][0] * W
      const ny = pts[i + 1][1] * H
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last[0] * W, last[1] * H)
  }
  ctx.stroke()
}

// A transparent canvas over one PDF page. Renders saved pen strokes and handles
// live drawing / erasing. Fractional coords keep everything aligned at any zoom.
function InkLayer({
  containerRef,
  strokes,
  tool,
  color,
  width,
  onCommit,
  onErase,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  strokes: InkStroke[]
  tool: Tool
  color: string
  width: number
  onCommit: (points: Pt[], color: string, width: number) => void
  onErase: (ids: string[]) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useRef({ w: 0, h: 0 })
  const drawing = useRef(false)
  const cur = useRef<Pt[]>([])
  const activePointer = useRef<number | null>(null)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const active = tool === "pen" || tool === "eraser"
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  const redraw = useCallback(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext("2d")
    if (!cv || !ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    const W = cv.width
    const H = cv.height
    for (const s of strokesRef.current) drawPath(ctx, s.points, s.color, s.width * W, W, H)
  }, [])

  // Keep the bitmap matched to the page's layout size (unaffected by the live
  // pinch transform), redrawing on any resize.
  useEffect(() => {
    const el = containerRef.current
    const cv = canvasRef.current
    if (!el || !cv) return
    const apply = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w === 0 || h === 0) return
      size.current = { w, h }
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      redraw()
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, dpr, redraw])

  useEffect(() => {
    redraw()
  }, [strokes, redraw])

  function toFrac(e: React.PointerEvent): Pt {
    const r = containerRef.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
  }

  function eraseAt(p: Pt) {
    const hit: string[] = []
    for (const s of strokesRef.current) {
      if (s.points.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 0.02)) hit.push(s.id)
    }
    if (hit.length) onErase(hit)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!active || activePointer.current !== null) return
    e.preventDefault()
    activePointer.current = e.pointerId
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drawing.current = true
    const p = toFrac(e)
    if (tool === "eraser") {
      eraseAt(p)
      return
    }
    cur.current = [p]
    const cv = canvasRef.current!
    const ctx = cv.getContext("2d")!
    drawPath(ctx, cur.current, color, width * cv.width, cv.width, cv.height)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current || e.pointerId !== activePointer.current) return
    e.preventDefault()
    const p = toFrac(e)
    if (tool === "eraser") {
      eraseAt(p)
      return
    }
    const prev = cur.current[cur.current.length - 1]
    cur.current.push(p)
    const cv = canvasRef.current!
    const ctx = cv.getContext("2d")!
    ctx.strokeStyle = color
    ctx.lineWidth = width * cv.width
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(prev[0] * cv.width, prev[1] * cv.height)
    ctx.lineTo(p[0] * cv.width, p[1] * cv.height)
    ctx.stroke()
  }

  function onPointerUp(e: React.PointerEvent) {
    if (e.pointerId !== activePointer.current) return
    activePointer.current = null
    drawing.current = false
    if (tool === "pen" && cur.current.length > 0) {
      onCommit(cur.current, color, width)
      cur.current = []
    }
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: active ? "auto" : "none", touchAction: active ? "none" : "auto", cursor: tool === "eraser" ? "cell" : "crosshair" }}
    />
  )
}

function NotePin({ anno, containerRef, onOpen, onDragEnd }: { anno: PdfAnnotation; containerRef: React.RefObject<HTMLDivElement | null>; onOpen: () => void; onDragEnd: (x: number, y: number) => void }) {
  const [pos, setPos] = useState({ x: anno.x, y: anno.y })
  const dragging = useRef(false)
  const moved = useRef(false)
  useEffect(() => setPos({ x: anno.x, y: anno.y }), [anno.x, anno.y])

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragging.current = true
    moved.current = false
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !containerRef.current) return
    const r = containerRef.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    if (Math.abs(x - anno.x) > 0.005 || Math.abs(y - anno.y) > 0.005) moved.current = true
    setPos({ x, y })
  }
  function onPointerUp(e: React.PointerEvent) {
    e.stopPropagation()
    dragging.current = false
    if (moved.current) onDragEnd(pos.x, pos.y)
    else onOpen()
  }

  return (
    <button
      data-pin
      onClick={(e) => e.stopPropagation()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none shadow-md ring-1 ring-black/10"
      style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, backgroundColor: anno.color, touchAction: "none" }}
      title={anno.content || "Sticky note"}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-neutral-800" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 10h8M8 14h5" strokeLinecap="round" /></svg>
    </button>
  )
}

function NoteEditor({ anno, onChange, onDelete, onClose }: { anno: PdfAnnotation; onChange: (patch: Partial<PdfAnnotation>) => void; onDelete: () => void; onClose: () => void }) {
  const [text, setText] = useState(anno.content)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  function edit(v: string) {
    setText(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange({ content: v }), 500)
  }
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-neutral-900 p-3 shadow-elevated ring-1 ring-white/10"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {NOTE_COLORS.map((c) => (
            <button key={c} onClick={() => onChange({ color: c })} className={`h-5 w-5 rounded-full ${anno.color === c ? "ring-2 ring-white ring-offset-1 ring-offset-neutral-900" : ""}`} style={{ backgroundColor: c }} aria-label="Colour" />
          ))}
          <div className="flex-1" />
          <button onClick={onDelete} className="rounded-lg px-2 py-1 text-xs font-medium text-red-400 hover:bg-white/10">Delete</button>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10" aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => edit(e.target.value)}
          placeholder="Write a note…"
          rows={3}
          autoFocus
          className="mt-2 w-full resize-none rounded-lg bg-neutral-800 p-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>
    </div>
  )
}

function Spinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" role="status" aria-label="Loading" />
}
