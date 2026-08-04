// Thin wrapper around pdf.js. This module is only ever reached via a dynamic
// import() from the viewer, so pdf.js and its worker land in a lazy chunk that
// never touches the initial bundle -- it downloads the first time a PDF is
// opened, then is service-worker cached.
import * as pdfjsLib from "pdfjs-dist"
// Vite bundles the worker as a same-origin asset (no CDN -> works offline and
// inside the WebView, and satisfies the Artifact CSP model in general).
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export type LoadedPdf = {
  numPages: number
  /** height / width of the first page -- used to size placeholders before a page renders. */
  firstPageAspect: number
  /** Render page `n` (1-based) into `canvas` at the given CSS width in px. */
  renderPage: (n: number, canvas: HTMLCanvasElement, cssWidth: number) => Promise<void>
  /** Render page `n`'s selectable text layer into `container` at the given CSS width. */
  renderTextLayer: (n: number, container: HTMLElement, cssWidth: number) => Promise<void>
  destroy: () => void
}

export async function loadPdf(url: string, httpHeaders?: Record<string, string>): Promise<LoadedPdf> {
  const loadingTask = pdfjsLib.getDocument({ url, httpHeaders, withCredentials: false })
  const doc = await loadingTask.promise
  const firstViewport = (await doc.getPage(1)).getViewport({ scale: 1 })
  return {
    numPages: doc.numPages,
    firstPageAspect: firstViewport.height / firstViewport.width,
    async renderPage(n, canvas, cssWidth) {
      const page = await doc.getPage(n)
      const unscaled = page.getViewport({ scale: 1 })
      // Fit to the container width, then multiply by DPR for crisp text.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const scale = (cssWidth / unscaled.width) * dpr
      const viewport = page.getViewport({ scale })
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
      await page.render({ canvasContext: ctx, viewport, canvas }).promise
    },
    async renderTextLayer(n, container, cssWidth) {
      const page = await doc.getPage(n)
      const unscaled = page.getViewport({ scale: 1 })
      // Text layer is laid out in CSS pixels (no DPR) to sit exactly over the
      // canvas; pdf.js positions the spans via the --total-scale-factor variable.
      const scale = cssWidth / unscaled.width
      const viewport = page.getViewport({ scale })
      container.replaceChildren()
      container.style.setProperty("--scale-factor", String(scale))
      container.style.setProperty("--total-scale-factor", String(scale))
      const layer = new pdfjsLib.TextLayer({ textContentSource: page.streamTextContent(), container, viewport })
      await layer.render()
    },
    destroy() {
      loadingTask.destroy()
    },
  }
}
