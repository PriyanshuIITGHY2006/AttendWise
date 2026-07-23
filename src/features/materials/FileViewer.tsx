import { useCallback, useEffect, useRef, useState } from "react"
import type { FileKind } from "./fileKind"
import type { LoadedPdf } from "./renderPdf"

export type ViewerItem = {
  id: string
  name: string
  kind: FileKind // "image" | "pdf" here
  url: string
  downloadName: string
}

const ZOOMS = [1, 1.5, 2, 3] as const

export function FileViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: ViewerItem[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const item = items[index]
  const [zoom, setZoom] = useState(1)

  // Reset zoom whenever the shown file changes.
  useEffect(() => setZoom(1), [index])

  const go = useCallback(
    (delta: number) => {
      const next = index + delta
      if (next >= 0 && next < items.length) onIndexChange(next)
    },
    [index, items.length, onIndexChange],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") go(1)
      else if (e.key === "ArrowLeft") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, onClose])

  if (!item) return null

  const zoomIn = () => setZoom((z) => ZOOMS[Math.min(ZOOMS.indexOf(z as (typeof ZOOMS)[number]) + 1, ZOOMS.length - 1)] ?? z)
  const zoomOut = () => setZoom((z) => ZOOMS[Math.max(ZOOMS.indexOf(z as (typeof ZOOMS)[number]) - 1, 0)] ?? z)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950/95 backdrop-blur-sm"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* toolbar */}
      <div className="flex items-center gap-2 px-3 py-2.5 text-neutral-100">
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
        {items.length > 1 && (
          <span className="shrink-0 text-xs text-neutral-400">
            {index + 1} / {items.length}
          </span>
        )}
        <button onClick={zoomOut} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Zoom out">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" strokeLinecap="round" /></svg>
        </button>
        <button onClick={zoomIn} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Zoom in">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
        </button>
        <a
          href={item.url}
          download={item.downloadName}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
          aria-label="Download"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      {/* content */}
      <div className="relative min-h-0 flex-1">
        {item.kind === "image" ? (
          <ImagePane url={item.url} zoom={zoom} />
        ) : (
          <PdfPane key={item.id} url={item.url} zoom={zoom} />
        )}

        {/* prev / next */}
        {index > 0 && (
          <NavArrow side="left" onClick={() => go(-1)} />
        )}
        {index < items.length - 1 && (
          <NavArrow side="right" onClick={() => go(1)} />
        )}
      </div>
    </div>
  )
}

function NavArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-2" : "right-2"} flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20`}
      aria-label={side === "left" ? "Previous" : "Next"}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path d={side === "left" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

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

function PdfPane({ url, zoom }: { url: string; zoom: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const pdfRef = useRef<LoadedPdf | null>(null)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const baseWidthRef = useRef(0)

  // Load the document (lazy-imports pdf.js on first use).
  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    ;(async () => {
      try {
        const { loadPdf } = await import("./renderPdf")
        const pdf = await loadPdf(url)
        if (cancelled) {
          pdf.destroy()
          return
        }
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
    }
  }, [url])

  // Render / re-render all pages whenever the doc is ready or zoom changes.
  useEffect(() => {
    if (status !== "ready" || !pdfRef.current) return
    const container = scrollRef.current
    if (!container) return
    const containerWidth = container.clientWidth - 24 // account for padding
    const width = Math.min(containerWidth, 1000) * zoom
    baseWidthRef.current = width
    let cancelled = false
    ;(async () => {
      for (let n = 1; n <= numPages; n++) {
        const canvas = canvasRefs.current[n - 1]
        if (!canvas || cancelled) continue
        try {
          await pdfRef.current!.renderPage(n, canvas, width)
        } catch {
          /* skip a page that fails to render */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, numPages, zoom])

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-neutral-400">Couldn't open this PDF. Try downloading it instead.</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full w-full overflow-auto px-3 py-3">
      {status === "loading" && (
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
  return (
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" role="status" aria-label="Loading" />
  )
}
