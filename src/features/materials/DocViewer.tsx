import { useCallback, useEffect, useRef, useState } from "react"
import type { FileKind } from "./fileKind"
import type { LoadedPdf } from "./renderPdf"
import { listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation, type PdfAnnotation } from "./api"

export type OpenDoc = {
  id: string
  name: string
  kind: FileKind // "image" | "pdf"
  url: string
  notes: string
}

const clampZoom = (z: number) => Math.min(5, Math.max(0.4, z))
const NOTE_COLORS = ["#fde047", "#fca5a5", "#86efac", "#93c5fd", "#f0abfc"]

// Non-passive two-finger pinch + ctrl/⌘-wheel zoom on an element.
function usePinchZoom(ref: React.RefObject<HTMLElement | null>, zoom: number, onZoom: (z: number) => void) {
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let startDist = 0
    let startZoom = 1
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches)
        startZoom = zoomRef.current
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
  const [annotate, setAnnotate] = useState(false)

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
        <button onClick={() => setZoom(focusId, zoomOf(focusId) * 1.25)} className={`${iconBtn} hover:bg-white/10`} aria-label="Zoom in">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
        </button>
        {focused?.kind === "pdf" && (
          <button onClick={() => setAnnotate((v) => !v)} className={`${iconBtn} ${annotate ? "bg-amber-400 text-neutral-900" : "hover:bg-white/10"}`} aria-label="Sticky notes" title="Tap the page to drop a sticky note">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2Z" /><path d="M15 21v-6a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
                  <PdfPane key={d.id} url={d.url} materialId={d.id} zoom={zoomOf(d.id)} onZoom={(z) => setZoom(d.id, z)} annotate={annotate && d.id === focusId} />
                )}
              </div>
            </div>
          ))}
        </div>

        {notesOpen && (
          <NotesPanel key={focusId} initial={focused?.notes ?? ""} onChange={(v) => onNotesChange(focusId, v)} onClose={() => setNotesOpen(false)} />
        )}
      </div>

      {annotate && focused?.kind === "pdf" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="pointer-events-auto rounded-full bg-amber-400 px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-lg">Tap the page to drop a note</span>
        </div>
      )}
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

function PdfPane({ url, materialId, zoom, onZoom, annotate }: { url: string; materialId: string; zoom: number; onZoom: (z: number) => void; annotate: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const pdfRef = useRef<LoadedPdf | null>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const [renderZoom, setRenderZoom] = useState(zoom)
  const renderedRef = useRef<number | null>(null)
  const [annos, setAnnos] = useState<PdfAnnotation[]>([])
  const [editing, setEditing] = useState<string | null>(null)

  usePinchZoom(scrollRef, zoom, onZoom)

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
  }, [materialId])

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
    <div ref={scrollRef} className="h-full w-full overflow-auto px-3 py-3" style={{ touchAction: "pan-x pan-y" }}>
      {status === "loading" && (
        <div className="flex h-full items-center justify-center"><Spinner /></div>
      )}
      <div className="mx-auto flex w-fit flex-col items-center gap-3" style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
        {Array.from({ length: numPages }, (_, i) => (
          <PdfPageWrap
            key={i}
            annotate={annotate}
            annos={annos.filter((a) => a.page === i + 1)}
            onPlace={(x, y) => placeNote(i + 1, x, y)}
            onOpen={setEditing}
            onDragEnd={(id, x, y) => { patchAnno(id, { x, y }); updateAnnotation(id, { x, y }).catch(() => {}) }}
          >
            <canvas
              ref={(el) => { canvasRefs.current[i] = el }}
              className="block max-w-full rounded bg-white shadow-lg"
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
  )
}

function PdfPageWrap({
  annotate,
  annos,
  onPlace,
  onOpen,
  onDragEnd,
  children,
}: {
  annotate: boolean
  annos: PdfAnnotation[]
  onPlace: (x: number, y: number) => void
  onOpen: (id: string) => void
  onDragEnd: (id: string, x: number, y: number) => void
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
      {annos.map((a) => (
        <NotePin key={a.id} anno={a} containerRef={ref} onOpen={() => onOpen(a.id)} onDragEnd={(x, y) => onDragEnd(a.id, x, y)} />
      ))}
    </div>
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
