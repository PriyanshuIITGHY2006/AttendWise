// Maps a filename/path to a coarse "kind" used for icons, and to decide which
// files the built-in viewer can render inline (image / pdf) versus hand off.

export type FileKind = "image" | "pdf" | "doc" | "sheet" | "slide" | "archive" | "video" | "audio" | "text" | "link" | "other"

const EXT_KINDS: Record<string, FileKind> = {
  // images
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", bmp: "image", svg: "image", heic: "image", avif: "image",
  // pdf
  pdf: "pdf",
  // docs
  doc: "doc", docx: "doc", odt: "doc", rtf: "doc", pages: "doc",
  // sheets
  xls: "sheet", xlsx: "sheet", csv: "sheet", ods: "sheet", numbers: "sheet",
  // slides
  ppt: "slide", pptx: "slide", odp: "slide", key: "slide",
  // archives
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive",
  // video / audio
  mp4: "video", mov: "video", webm: "video", mkv: "video", avi: "video",
  mp3: "audio", wav: "audio", m4a: "audio", aac: "audio", ogg: "audio",
  // text / code
  txt: "text", md: "text", json: "text", xml: "text",
}

export function extensionOf(nameOrPath: string): string {
  const base = nameOrPath.split(/[?#]/)[0].split("/").pop() ?? ""
  const dot = base.lastIndexOf(".")
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : ""
}

export function fileKind(nameOrPath: string | null, isLink = false): FileKind {
  if (isLink) return "link"
  if (!nameOrPath) return "other"
  return EXT_KINDS[extensionOf(nameOrPath)] ?? "other"
}

/** The two kinds the in-app viewer renders directly. */
export function isViewable(kind: FileKind): boolean {
  return kind === "image" || kind === "pdf"
}

// Display name of a stored file: paths are "<uid>/<courseId>/<ts>_<name>", so
// strip the folder and the timestamp prefix we added at upload time.
export function displayName(title: string, filePath: string | null): string {
  if (title?.trim()) return title
  if (!filePath) return "Untitled"
  const base = filePath.split("/").pop() ?? filePath
  return base.replace(/^\d+_/, "")
}

const KIND_META: Record<FileKind, { label: string; color: string }> = {
  image: { label: "Image", color: "#0ea5e9" },
  pdf: { label: "PDF", color: "#ef4444" },
  doc: { label: "Doc", color: "#2563eb" },
  sheet: { label: "Sheet", color: "#16a34a" },
  slide: { label: "Slides", color: "#f97316" },
  archive: { label: "Archive", color: "#a855f7" },
  video: { label: "Video", color: "#db2777" },
  audio: { label: "Audio", color: "#0d9488" },
  text: { label: "Text", color: "#64748b" },
  link: { label: "Link", color: "#6366f1" },
  other: { label: "File", color: "#64748b" },
}

export function kindMeta(kind: FileKind) {
  return KIND_META[kind]
}
