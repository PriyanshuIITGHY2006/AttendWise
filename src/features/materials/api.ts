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

export async function createMaterial(material: TablesInsert<"materials">) {
  const { data, error } = await supabase.from("materials").insert(material).select().single()
  if (error) throw error
  return data
}

export async function deleteMaterial(material: Material) {
  if (material.file_path) {
    await supabase.storage.from("materials").remove([material.file_path])
  }
  const { error } = await supabase.from("materials").delete().eq("id", material.id)
  if (error) throw error
}
