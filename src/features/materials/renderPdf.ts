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
  /** Render page `n` (1-based) into `canvas` at the given CSS width in px. */
  renderPage: (n: number, canvas: HTMLCanvasElement, cssWidth: number) => Promise<void>
  destroy: () => void
}

export async function loadPdf(url: string): Promise<LoadedPdf> {
  const loadingTask = pdfjsLib.getDocument({ url })
  const doc = await loadingTask.promise
  return {
    numPages: doc.numPages,
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
    destroy() {
      loadingTask.destroy()
    },
  }
}
