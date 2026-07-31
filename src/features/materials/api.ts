import { supabase } from "../../lib/supabase"
import type { Tables, TablesInsert } from "../../types/database"

export type Material = Tables<"materials">

// RLS returns the user's own materials plus any in courses shared with them, so
// we don't filter by user_id here (the arg is kept for call-site clarity).
export async function listMaterials(_userId: string) {
  const { data, error } = await supabase
    .from("materials")
    .select("*, courses(name, color)")
    .order("created_at", { ascending: false })
  if (error) throw error
  return data
}

// Files stored in Cloudflare R2 get their key prefixed with "r2:" in file_path,
// so every read/delete can route to the right backend. Old (unprefixed) paths
// stay on Supabase Storage -- fully backward compatible.
const R2 = "r2:"
const isR2 = (path: string) => path.startsWith(R2)
const r2Key = (path: string) => path.slice(R2.length)

async function invokeStorage(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("materials-storage", { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { key?: string; url?: string; urls?: Record<string, string>; ok?: boolean }
}

export async function uploadMaterialFile(userId: string, courseId: string, file: File) {
  // Prefer R2 (free egress). If R2 isn't configured -- or errors (e.g. missing
  // CORS) -- fall back to Supabase Storage so uploads never hard-fail.
  try {
    const { key, url } = await invokeStorage({ action: "sign-upload", name: file.name, courseId })
    if (!key || !url) throw new Error("no presigned url")
    const put = await fetch(url, {
      method: "PUT",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    })
    if (!put.ok) throw new Error(`r2 put ${put.status}`)
    return `${R2}${key}`
  } catch (e) {
    console.warn("[materials] R2 upload unavailable, using Supabase Storage:", (e as Error).message)
    const path = `${userId}/${courseId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from("materials").upload(path, file)
    if (error) throw error
    return path
  }
}

export async function getMaterialFileUrl(path: string) {
  if (isR2(path)) {
    const key = r2Key(path)
    const { urls } = await invokeStorage({ action: "sign-download", keys: [key] })
    const url = urls?.[key]
    if (!url) throw new Error("r2 sign failed")
    return url
  }
  const { data, error } = await supabase.storage.from("materials").createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

// Batch-sign many paths in one pass (thumbnails + fast viewer opens). Returns a
// path -> url map keyed by the stored file_path (incl. any "r2:" prefix); paths
// that fail to sign are simply omitted. Handles a mix of R2 and Supabase files.
export async function getMaterialFileUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const map: Record<string, string> = {}
  const supabasePaths = paths.filter((p) => !isR2(p))
  const r2Paths = paths.filter(isR2)

  if (supabasePaths.length > 0) {
    const { data, error } = await supabase.storage.from("materials").createSignedUrls(supabasePaths, 3600)
    if (error) throw error
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) map[item.path] = item.signedUrl
    }
  }

  if (r2Paths.length > 0) {
    try {
      const { urls } = await invokeStorage({ action: "sign-download", keys: r2Paths.map(r2Key) })
      for (const p of r2Paths) {
        const url = urls?.[r2Key(p)]
        if (url) map[p] = url
      }
    } catch (e) {
      console.warn("[materials] R2 sign-download failed:", (e as Error).message)
    }
  }
  return map
}

export async function createMaterial(material: TablesInsert<"materials">) {
  const { data, error } = await supabase.from("materials").insert(material).select().single()
  if (error) throw error
  return data
}

export async function moveMaterial(id: string, category: string) {
  // Moving to a default category also clears any custom-folder membership.
  const { error } = await supabase.from("materials").update({ category, folder_id: null }).eq("id", id)
  if (error) throw error
}

export type MaterialFolder = Tables<"material_folders">

export async function listFolders(): Promise<MaterialFolder[]> {
  const { data, error } = await supabase.from("material_folders").select("*").order("name", { ascending: true })
  if (error) throw error
  return data
}

export async function createFolder(courseId: string, name: string): Promise<MaterialFolder> {
  const { data, error } = await supabase.from("material_folders").insert({ course_id: courseId, name: name.trim() }).select().single()
  if (error) throw error
  return data
}

// A top-level personal folder (no course, no category templates), private to
// the creator.
export async function createRootFolder(name: string): Promise<MaterialFolder> {
  const { data, error } = await supabase.from("material_folders").insert({ course_id: null, name: name.trim() }).select().single()
  if (error) throw error
  return data
}

export async function renameFolder(id: string, name: string) {
  const { error } = await supabase.from("material_folders").update({ name: name.trim() }).eq("id", id)
  if (error) throw error
}

export async function deleteFolder(id: string) {
  // Files inside fall back to their category (folder_id -> null via FK on delete).
  const { error } = await supabase.from("material_folders").delete().eq("id", id)
  if (error) throw error
}

// Move a material into a custom folder (or back out with folderId = null).
export async function setMaterialFolder(id: string, folderId: string | null) {
  const { error } = await supabase.from("materials").update({ folder_id: folderId }).eq("id", id)
  if (error) throw error
}

export async function updateMaterialNotes(id: string, notes: string) {
  const { error } = await supabase.from("materials").update({ notes }).eq("id", id)
  if (error) throw error
}

export async function setMaterialStarred(id: string, starred: boolean) {
  const { error } = await supabase.from("materials").update({ starred }).eq("id", id)
  if (error) throw error
}

export async function renameMaterial(id: string, title: string) {
  const { error } = await supabase.from("materials").update({ title }).eq("id", id)
  if (error) throw error
}

// Fire-and-forget "recently opened" bump; never blocks opening a file.
export function touchMaterialOpened(id: string) {
  supabase.from("materials").update({ last_opened_at: new Date().toISOString() }).eq("id", id).then(() => {})
}

export type PdfAnnotation = Tables<"pdf_annotations">

export async function listAnnotations(materialId: string): Promise<PdfAnnotation[]> {
  const { data, error } = await supabase.from("pdf_annotations").select("*").eq("material_id", materialId)
  if (error) throw error
  return data
}

export async function createAnnotation(a: {
  material_id: string
  page: number
  x: number
  y: number
  content?: string
  color?: string
}): Promise<PdfAnnotation> {
  const { data, error } = await supabase.from("pdf_annotations").insert(a).select().single()
  if (error) throw error
  return data
}

export async function updateAnnotation(id: string, patch: Partial<Pick<PdfAnnotation, "x" | "y" | "content" | "color">>) {
  const { error } = await supabase
    .from("pdf_annotations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}

export async function deleteAnnotation(id: string) {
  const { error } = await supabase.from("pdf_annotations").delete().eq("id", id)
  if (error) throw error
}

export type InkStroke = Tables<"pdf_ink">

// Freehand pen strokes on a PDF. Points are fractional (0..1) page coordinates
// so they track the page at any zoom. Personal to the account (RLS).
export async function listInk(materialId: string): Promise<InkStroke[]> {
  const { data, error } = await supabase.from("pdf_ink").select("*").eq("material_id", materialId)
  if (error) throw error
  return data
}

export async function createInkStroke(s: {
  material_id: string
  page: number
  color: string
  width: number
  points: number[][]
}): Promise<InkStroke> {
  const { data, error } = await supabase.from("pdf_ink").insert(s).select().single()
  if (error) throw error
  return data
}

export async function deleteInkStrokes(ids: string[]) {
  if (ids.length === 0) return
  const { error } = await supabase.from("pdf_ink").delete().in("id", ids)
  if (error) throw error
}

export async function deleteMaterial(material: Material) {
  if (material.file_path) {
    // Storage removal only succeeds for your own uploads (folder = your uid); on
    // a shared file you didn't upload it'll be blocked, so ignore that error and
    // still remove the DB row (RLS allows deleting shared-course materials).
    if (isR2(material.file_path)) {
      await invokeStorage({ action: "delete", key: r2Key(material.file_path) }).catch(() => {})
    } else {
      // Returns { error } rather than throwing, so a blocked shared-file removal
      // is ignored and the DB row still gets deleted below.
      await supabase.storage.from("materials").remove([material.file_path])
    }
  }
  const { error } = await supabase.from("materials").delete().eq("id", material.id)
  if (error) throw error
}
