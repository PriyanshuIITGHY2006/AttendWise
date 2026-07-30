import { useCallback, useEffect, useRef, useState } from "react"
import { getStroke } from "perfect-freehand"
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
  // Set for proxied Google Drive PDFs: extra fetch headers, and a flag so a
  // load failure can suggest the file needs public sharing.
  httpHeaders?: Record<string, string>
  drive?: boolean
}

const clampZoom = (z: number) => Math.min(5, Math.max(0.4, z))
const NOTE_COLORS = ["#fde047", "#fca5a5", "#86efac", "#93c5fd", "#f0abfc"]

// Pen palette + widths (widths are fractions of page width, so a stroke keeps
// the same visual thickness at any zoom). Highlighter colours carry an alpha
// suffix (#RRGGBBAA) -- that alpha is also how a stroke is recognised as a
// highlighter at render time (flat, wide, translucent) without a schema change.
type Tool = "pan" | "pen" | "highlighter" | "eraser" | "note"
const PEN_COLORS = ["#111827", "#ef4444", "#2563eb", "#16a34a", "#eab308"]
const PEN_WIDTHS = [0.0022, 0.0042, 0.0075]
const HL_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f0abfc", "#fca5a5"].map((c) => `${c}66`)
const HL_WIDTH = 0.02
const isHighlighter = (color: string) => color.length > 7
type Pt = [number, number]
// Palm-rejection: "any" = finger or stylus draws; "pen" = stylus only (rest your
// hand and draw with the pen). Two fingers pan/zoom in both modes.
type InputMode = "any" | "pen"
type InkOp = { kind: "add"; stroke: InkStroke } | { kind: "erase"; strokes: InkStroke[] }

// Some Android WebViews (notably MIUI on Xiaomi tablets) report an active
// stylus as pointerType "touch" instead of "pen", which would make "Pen only"
// ignore the pen. So once we've seen a real "pen" pointer we trust the type
// strictly; until then we fall back to contact geometry -- a stylus tip is a
// tiny contact, a finger/palm is large -- so the pen still draws.
let sawRealPen = false
function isStylusLike(e: React.PointerEvent): boolean {
  if (e.pointerType === "pen" || e.pointerType === "mouse") return true
  if (sawRealPen) return false // device distinguishes; this touch is a finger/palm
  const contact = Math.max(e.width || 0, e.height || 0)
  return contact === 0 || contact <= 14 // no geometry (can't tell) or small tip
}

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
    let lastCx = 0
    let lastCy = 0
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const cx = (t: TouchList) => (t[0].clientX + t[1].clientX) / 2
    const cy = (t: TouchList) => (t[0].clientY + t[1].clientY) / 2
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches)
        startZoom = zoomRef.current
        lastCx = cx(e.touches)
        lastCy = cy(e.touches)
        pinched = true
      }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault()
        onZoom(clampZoom((startZoom * dist(e.touches)) / startDist))
        // Two-finger drag also pans, so the page can be navigated even while a
        // drawing tool is active (finger scroll is off then).
        const ncx = cx(e.touches)
        const ncy = cy(e.touches)
        el.scrollLeft += lastCx - ncx
        el.scrollTop += lastCy - ncy
        lastCx = ncx
        lastCy = ncy
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
  const [hlColor, setHlColor] = useState(HL_COLORS[0])
  const [inputMode, setInputMode] = useState<InputMode>("any")
  const drawApi = useRef<{ undo: () => void; redo: () => void }>({ undo() {}, redo() {} })
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })

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
                    httpHeaders={d.httpHeaders}
                    drive={d.drive}
                    materialId={d.id}
                    zoom={zoomOf(d.id)}
                    onZoom={(z) => setZoom(d.id, z)}
                    tool={d.id === focusId ? tool : "pan"}
                    color={tool === "highlighter" ? hlColor : penColor}
                    width={tool === "highlighter" ? HL_WIDTH : penWidth}
                    inputMode={inputMode}
                    registerDraw={d.id === focusId ? (api, canUndo, canRedo) => { drawApi.current = api; setHist({ canUndo, canRedo }) } : undefined}
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
        <DrawBar
          tool={tool}
          setTool={setTool}
          penColor={penColor}
          setPenColor={setPenColor}
          penWidth={penWidth}
          setPenWidth={setPenWidth}
          hlColor={hlColor}
          setHlColor={setHlColor}
          inputMode={inputMode}
          setInputMode={setInputMode}
          canUndo={hist.canUndo}
          canRedo={hist.canRedo}
          onUndo={() => drawApi.current.undo()}
          onRedo={() => drawApi.current.redo()}
          onClose={() => setTool("pan")}
        />
      )}
    </div>
  )
}

function DrawToolBtn({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors active:scale-95 ${active ? "bg-amber-400 text-neutral-900" : "text-neutral-200 hover:bg-white/10"}`}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
    </button>
  )
}

// Floating notepad toolbar: tools, colours/widths, undo/redo, and the palm-
// rejection (input mode) toggle. Sits over the page like GoodNotes/Samsung Notes.
function DrawBar({
  tool, setTool, penColor, setPenColor, penWidth, setPenWidth, hlColor, setHlColor,
  inputMode, setInputMode, canUndo, canRedo, onUndo, onRedo, onClose,
}: {
  tool: Tool; setTool: (t: Tool) => void
  penColor: string; setPenColor: (c: string) => void
  penWidth: number; setPenWidth: (w: number) => void
  hlColor: string; setHlColor: (c: string) => void
  inputMode: InputMode; setInputMode: (m: InputMode) => void
  canUndo: boolean; canRedo: boolean
  onUndo: () => void; onRedo: () => void; onClose: () => void
}) {
  const iconBtn = "flex h-9 w-9 items-center justify-center rounded-lg text-neutral-200 transition-colors hover:bg-white/10 disabled:opacity-30"
  const showColors = tool === "pen" || tool === "highlighter"
  const swatches = tool === "pen" ? PEN_COLORS : HL_COLORS
  const activeColor = tool === "pen" ? penColor : hlColor
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-2" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <div className="pointer-events-auto flex max-w-full flex-col items-center gap-1.5 rounded-2xl bg-neutral-900/95 p-1.5 shadow-elevated ring-1 ring-white/10 backdrop-blur-xl">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto">
          <div className="flex items-center gap-0.5 rounded-xl bg-white/5 p-1">
            <DrawToolBtn active={tool === "pen"} onClick={() => setTool("pen")} label="Pen">
              <path d="M12 20h9" strokeLinecap="round" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
            </DrawToolBtn>
            <DrawToolBtn active={tool === "highlighter"} onClick={() => setTool("highlighter")} label="Highlighter">
              <path d="M4 20h5l9.5-9.5a2 2 0 0 0 0-2.8l-2.2-2.2a2 2 0 0 0-2.8 0L4 15v5Z" strokeLinecap="round" strokeLinejoin="round" /><path d="m13 6 5 5" strokeLinecap="round" />
            </DrawToolBtn>
            <DrawToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} label="Eraser">
              <path d="M20 20H8.5L3.5 15a2 2 0 0 1 0-2.8l7-7a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L14 20" strokeLinecap="round" strokeLinejoin="round" /><path d="m9 11 4 4" strokeLinecap="round" />
            </DrawToolBtn>
            <DrawToolBtn active={tool === "note"} onClick={() => setTool("note")} label="Sticky note">
              <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2Z" /><path d="M15 21v-6a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" />
            </DrawToolBtn>
          </div>

          <div className="mx-0.5 h-6 w-px bg-white/10" />
          <button className={iconBtn} onClick={onUndo} disabled={!canUndo} aria-label="Undo">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14 4 9l5-5" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className={iconBtn} onClick={onRedo} disabled={!canRedo} aria-label="Redo">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 14 5-5-5-5" strokeLinecap="round" strokeLinejoin="round" /><path d="M20 9H9a5 5 0 0 0 0 10h3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>

          <div className="mx-0.5 h-6 w-px bg-white/10" />
          <button
            onClick={() => setInputMode(inputMode === "any" ? "pen" : "any")}
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium text-neutral-200 transition-colors hover:bg-white/10"
            title="Choose who can draw"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" strokeLinecap="round" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>{inputMode === "pen" ? "Pen only" : "Hand + Pen"}</span>
          </button>
          <button onClick={onClose} className="ml-0.5 rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/10">Done</button>
        </div>

        {showColors && (
          <div className="flex w-full items-center gap-2 px-1 pb-0.5">
            <div className="flex items-center gap-1.5">
              {swatches.map((c) => {
                const selected = activeColor === c
                return (
                  <button
                    key={c}
                    onClick={() => (tool === "pen" ? setPenColor(c) : setHlColor(c))}
                    className={`h-6 w-6 rounded-full transition-transform active:scale-90 ${selected ? "ring-2 ring-white ring-offset-2 ring-offset-neutral-900" : ""}`}
                    style={{ backgroundColor: c.slice(0, 7) }}
                    aria-label="Colour"
                  />
                )
              })}
            </div>
            {tool === "pen" && (
              <div className="ml-auto flex items-center gap-1">
                {PEN_WIDTHS.map((w, i) => (
                  <button key={w} onClick={() => setPenWidth(w)} className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${penWidth === w ? "bg-white/15" : "hover:bg-white/10"}`} aria-label={["Thin", "Medium", "Thick"][i]}>
                    <span className="rounded-full bg-white" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
                  </button>
                ))}
              </div>
            )}
          </div>
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

function PdfPane({ url, httpHeaders, drive, materialId, zoom, onZoom, tool, color, width, inputMode, registerDraw }: { url: string; httpHeaders?: Record<string, string>; drive?: boolean; materialId: string; zoom: number; onZoom: (z: number) => void; tool: Tool; color: string; width: number; inputMode: InputMode; registerDraw?: (api: { undo: () => void; redo: () => void }, canUndo: boolean, canRedo: boolean) => void }) {
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
  // Undo/redo history (this pane's ink). Each op is applied optimistically and
  // synced to the DB best-effort; re-created strokes get fresh ids.
  const undoStack = useRef<InkOp[]>([])
  const redoStack = useRef<InkOp[]>([])

  // Pinch/double-tap zoom stays on in pan mode, and also in pen-only input mode
  // (where a finger scrolls/zooms while the stylus draws).
  usePinchZoom(scrollRef, zoom, onZoom, tool === "pan" || inputMode === "pen")

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
        const pdf = await loadPdf(url, httpHeaders)
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

  const reportHistory = useCallback(() => {
    registerDraw?.({ undo, redo }, undoStack.current.length > 0, redoStack.current.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerDraw])

  // Register this pane's undo/redo with the toolbar whenever it becomes focused.
  useEffect(() => {
    reportHistory()
  }, [reportHistory])

  // Persist a stroke and return the saved row (with its real id) so history can
  // reference it. Falls back to the optimistic temp on failure.
  async function persistStroke(s: { page: number; color: string; width: number; points: number[][] }): Promise<InkStroke> {
    const temp: InkStroke = { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`, material_id: materialId, user_id: "", page: s.page, color: s.color, width: s.width, points: s.points, created_at: "" }
    setInk((p) => [...p, temp])
    try {
      const saved = await createInkStroke({ material_id: materialId, ...s })
      setInk((p) => p.map((x) => (x.id === temp.id ? saved : x)))
      return saved
    } catch {
      return temp
    }
  }

  async function commitStroke(pageNo: number, points: Pt[], strokeColor: string, strokeWidth: number) {
    const saved = await persistStroke({ page: pageNo, color: strokeColor, width: strokeWidth, points })
    undoStack.current.push({ kind: "add", stroke: saved })
    redoStack.current = []
    reportHistory()
  }

  function eraseStrokes(ids: string[]) {
    const removed = ink.filter((s) => ids.includes(s.id))
    if (removed.length === 0) return
    setInk((p) => p.filter((s) => !ids.includes(s.id)))
    deleteInkStrokes(ids.filter((id) => !id.startsWith("tmp-"))).catch(() => {})
    undoStack.current.push({ kind: "erase", strokes: removed })
    redoStack.current = []
    reportHistory()
  }

  async function undo() {
    const op = undoStack.current.pop()
    if (!op) return
    if (op.kind === "add") {
      setInk((p) => p.filter((s) => s.id !== op.stroke.id))
      deleteInkStrokes([op.stroke.id].filter((id) => !id.startsWith("tmp-"))).catch(() => {})
      redoStack.current.push(op)
    } else {
      const recreated = await Promise.all(op.strokes.map((s) => persistStroke({ page: s.page, color: s.color, width: s.width, points: s.points })))
      redoStack.current.push({ kind: "erase", strokes: recreated })
    }
    reportHistory()
  }

  async function redo() {
    const op = redoStack.current.pop()
    if (!op) return
    if (op.kind === "add") {
      const saved = await persistStroke({ page: op.stroke.page, color: op.stroke.color, width: op.stroke.width, points: op.stroke.points })
      undoStack.current.push({ kind: "add", stroke: saved })
    } else {
      const ids = op.strokes.map((s) => s.id)
      setInk((p) => p.filter((s) => !ids.includes(s.id)))
      deleteInkStrokes(ids.filter((id) => !id.startsWith("tmp-"))).catch(() => {})
      undoStack.current.push(op)
    }
    reportHistory()
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
    const renderWidth = Math.min(container.clientWidth - 24, 1000) * renderZoom
    let cancelled = false
    ;(async () => {
      for (let n = 1; n <= numPages; n++) {
        const canvas = canvasRefs.current[n - 1]
        if (!canvas || cancelled) continue
        try {
          await pdfRef.current!.renderPage(n, canvas, renderWidth)
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
        <p className="max-w-xs text-sm text-neutral-400">
          {drive
            ? "Couldn't open this Drive file. Make sure it's shared as “Anyone with the link” — private files can't be shown."
            : "Couldn't open this PDF. Try downloading it instead."}
        </p>
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
            color={color}
            width={width}
            inputMode={inputMode}
            ink={ink.filter((s) => s.page === i + 1)}
            onInkCommit={(pts, c, w) => commitStroke(i + 1, pts, c, w)}
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
  color,
  width,
  inputMode,
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
  color: string
  width: number
  inputMode: InputMode
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
      <InkLayer containerRef={ref} strokes={ink} tool={tool} color={color} width={width} inputMode={inputMode} onCommit={onInkCommit} onErase={onInkErase} />
      {annos.map((a) => (
        <NotePin key={a.id} anno={a} containerRef={ref} onOpen={() => onOpen(a.id)} onDragEnd={(x, y) => onDragEnd(a.id, x, y)} />
      ))}
    </div>
  )
}

// Turn fractional input points into a filled stroke outline (perfect-freehand:
// the same ink engine tldraw uses) so strokes are smooth and velocity-tapered.
// Highlighters render flat (no thinning, blunt ends) like a real marker.
function strokePath(pts: Pt[], W: number, H: number, sizePx: number, last: boolean, flat: boolean): Path2D {
  const input = pts.map((p) => [p[0] * W, p[1] * H])
  const outline = getStroke(input, {
    size: sizePx,
    thinning: flat ? 0 : 0.6,
    smoothing: 0.62,
    streamline: 0.5,
    simulatePressure: !flat,
    last,
    ...(flat ? { start: { cap: true }, end: { cap: true } } : {}),
  })
  const path = new Path2D()
  if (outline.length === 0) return path
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length; i++) path.lineTo(outline[i][0], outline[i][1])
  path.closePath()
  return path
}

// Two stacked canvases over one PDF page: a base layer that holds committed
// strokes (repainted only when they change) and a light live layer for the
// stroke in progress (repainted on animation frames). Splitting them keeps
// drawing smooth no matter how many strokes are already on the page.
function InkLayer({
  containerRef,
  strokes,
  tool,
  color,
  width,
  inputMode,
  onCommit,
  onErase,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  strokes: InkStroke[]
  tool: Tool
  color: string
  width: number
  inputMode: InputMode
  onCommit: (points: Pt[], color: string, width: number) => void
  onErase: (ids: string[]) => void
}) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const size = useRef({ w: 0, h: 0 })
  const cur = useRef<Pt[]>([])
  const activePointer = useRef<number | null>(null)
  const raf = useRef(0)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const active = tool === "pen" || tool === "highlighter" || tool === "eraser"
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  const paintBase = useCallback(() => {
    const cv = baseRef.current
    const ctx = cv?.getContext("2d")
    if (!cv || !ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    const W = cv.width
    const H = cv.height
    for (const s of strokesRef.current) {
      ctx.fillStyle = s.color
      ctx.fill(strokePath(s.points as Pt[], W, H, s.width * W, true, isHighlighter(s.color)))
    }
  }, [])

  const paintLive = useCallback(() => {
    raf.current = 0
    const cv = liveRef.current
    const ctx = cv?.getContext("2d")
    if (!cv || !ctx) return
    ctx.clearRect(0, 0, cv.width, cv.height)
    if (cur.current.length === 0) return
    ctx.fillStyle = color
    ctx.fill(strokePath(cur.current, cv.width, cv.height, width * cv.width, false, tool === "highlighter"))
  }, [color, width, tool])

  const scheduleLive = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(paintLive)
  }, [paintLive])

  // Keep both bitmaps matched to the page's layout size (unaffected by the live
  // pinch transform), repainting the committed layer on any resize.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const apply = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w === 0 || h === 0) return
      size.current = { w, h }
      for (const cv of [baseRef.current, liveRef.current]) {
        if (!cv) continue
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      paintBase()
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, dpr, paintBase])

  useEffect(() => {
    paintBase()
  }, [strokes, paintBase])

  function toFrac(clientX: number, clientY: number): Pt {
    const r = containerRef.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (clientX - r.left) / r.width)), Math.min(1, Math.max(0, (clientY - r.top) / r.height))]
  }

  function eraseAt(p: Pt) {
    const hit: string[] = []
    for (const s of strokesRef.current) {
      if ((s.points as Pt[]).some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 0.02)) hit.push(s.id)
    }
    if (hit.length) onErase(hit)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "pen") sawRealPen = true
    if (!active || activePointer.current !== null) return
    // Pen-only (palm rejection): only a stylus draws; fingers/palm are ignored
    // (two fingers still pan/zoom). Uses geometry when the WebView mislabels the
    // pen as touch, so the Xiaomi pen works too.
    if (inputMode === "pen" && !isStylusLike(e)) return
    e.preventDefault()
    activePointer.current = e.pointerId
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = toFrac(e.clientX, e.clientY)
    if (tool === "eraser") {
      eraseAt(p)
      return
    }
    cur.current = [p]
    scheduleLive()
  }

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerId !== activePointer.current) return
    e.preventDefault()
    if (tool === "eraser") {
      eraseAt(toFrac(e.clientX, e.clientY))
      return
    }
    // Coalesced events recover the sub-frame points the browser batched, so fast
    // strokes stay smooth instead of turning into straight chords.
    const evs = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent]
    for (const ev of evs.length ? evs : [e.nativeEvent]) cur.current.push(toFrac(ev.clientX, ev.clientY))
    scheduleLive()
  }

  function onPointerUp(e: React.PointerEvent) {
    if (e.pointerId !== activePointer.current) return
    activePointer.current = null
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0 }
    if ((tool === "pen" || tool === "highlighter") && cur.current.length > 0) {
      onCommit(cur.current, color, width)
      cur.current = []
    }
    // Clear the live layer; the committed stroke will appear on the base layer.
    const cv = liveRef.current
    cv?.getContext("2d")?.clearRect(0, 0, cv.width, cv.height)
  }

  // While a drawing tool is active the canvas owns single-finger gestures (so a
  // mislabeled-as-touch stylus draws instead of scrolling); two-finger pan/zoom
  // is handled by the pinch hook on the scroll container.
  const touchAction = active ? "none" : "auto"

  return (
    <>
      <canvas ref={baseRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas
        ref={liveRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: active ? "auto" : "none", touchAction, cursor: tool === "eraser" ? "cell" : "crosshair" }}
      />
    </>
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
