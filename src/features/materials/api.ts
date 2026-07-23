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

export async function uploadMaterialFile(userId: string, courseId: string, file: File) {
  const path = `${userId}/${courseId}/${Date.now()}_${file.name}`
  const { error } = await supabase.storage.from("materials").upload(path, file)
  if (error) throw error
  return path
}

export async function getMaterialFileUrl(path: string) {
  const { data, error } = await supabase.storage.from("materials").createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

// Batch-sign many paths in one request (used to lazily load image thumbnails in
// the explorer without a signed-URL call per tile). Returns a path -> url map;
// paths that fail to sign are simply omitted.
export async function getMaterialFileUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from("materials").createSignedUrls(paths, 3600)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl
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

export async function deleteMaterial(material: Material) {
  if (material.file_path) {
    await supabase.storage.from("materials").remove([material.file_path])
  }
  const { error } = await supabase.from("materials").delete().eq("id", material.id)
  if (error) throw error
}
