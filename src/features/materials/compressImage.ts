// Client-side image shrink before upload. Photos of notes/whiteboards are the
// main storage hog and are usually 4-12 MP JPEGs; downscaling to <=2000px on the
// long edge at quality 0.82 keeps text readable while cutting size 5-10x. This
// stretches the free 1 GB storage a long way at zero cost.
//
// Only raster photos are touched. GIF/SVG (animation/vector) and non-images pass
// through untouched, and if anything fails (e.g. the browser can't decode HEIC),
// the original file is uploaded as-is.

const MAX_EDGE = 2000
const QUALITY = 0.82
const SKIP = new Set(["image/gif", "image/svg+xml"])

export async function maybeCompressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || SKIP.has(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY))
    // Keep the original if compression didn't actually help (e.g. already tiny).
    if (!blob || blob.size >= file.size) return file
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() })
  } catch {
    return file
  }
}

/** Human-readable file size, e.g. "3.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
