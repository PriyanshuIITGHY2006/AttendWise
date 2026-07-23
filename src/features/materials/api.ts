import { supabase } from "../../lib/supabase"
import type { Tables, TablesInsert } from "../../types/database"

export type Material = Tables<"materials">

export async function listMaterials(userId: string) {
  const { data, error } = await supabase
    .from("materials")
    .select("*, courses(name, color)")
    .eq("user_id", userId)
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
  const { error } = await supabase.from("materials").update({ category }).eq("id", id)
  if (error) throw error
}

export async function updateMaterialNotes(id: string, notes: string) {
  const { error } = await supabase.from("materials").update({ notes }).eq("id", id)
  if (error) throw error
}

export async function deleteMaterial(material: Material) {
  if (material.file_path) {
    if (isR2(material.file_path)) {
      await invokeStorage({ action: "delete", key: r2Key(material.file_path) }).catch(() => {})
    } else {
      await supabase.storage.from("materials").remove([material.file_path])
    }
  }
  const { error } = await supabase.from("materials").delete().eq("id", material.id)
  if (error) throw error
}
