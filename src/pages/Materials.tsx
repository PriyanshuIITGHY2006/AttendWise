import { useEffect, useState, useCallback, type FormEvent } from "react"
import { useAuth } from "../context/AuthContext"
import { listCourses, type Course } from "../features/courses/api"
import { listMaterials, uploadMaterialFile, getMaterialFileUrl, createMaterial, deleteMaterial, type Material } from "../features/materials/api"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Input, Label } from "../components/ui/Input"

type MaterialWithCourse = Material & { courses: { name: string; color: string } | null }

export function Materials() {
  const { user, hasMaterialAccess } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [materials, setMaterials] = useState<MaterialWithCourse[]>([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState("")
  const [courseId, setCourseId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [c, m] = await Promise.all([listCourses(user.id), listMaterials(user.id)])
    setCourses(c)
    setMaterials(m as MaterialWithCourse[])
    if (c.length > 0) setCourseId((prev) => prev || c[0].id)
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user || !courseId) return
    if (!file && !link) {
      setError("Attach a file or a link.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const filePath = file ? await uploadMaterialFile(user.id, courseId, file) : null
      await createMaterial({
        course_id: courseId,
        user_id: user.id,
        title,
        file_path: filePath,
        external_link: link || null,
      })
      setTitle("")
      setFile(null)
      setLink("")
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOpen(material: Material) {
    if (material.external_link) {
      window.open(material.external_link, "_blank", "noopener,noreferrer")
      return
    }
    if (material.file_path) {
      const url = await getMaterialFileUrl(material.file_path)
      window.open(url, "_blank", "noopener,noreferrer")
    }
  }

  async function handleDelete(material: Material) {
    if (!confirm(`Delete "${material.title}"?`)) return
    await deleteMaterial(material)
    load()
  }

  if (!hasMaterialAccess) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Materials</h1>
        <Card className="mt-6">
          <p className="text-sm text-neutral-500">You don't have access to this feature.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Materials</h1>

      <Card className="mt-6">
        <h2 className="font-medium">Add material</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="course">Course</Label>
            <select
              id="course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="file">File</Label>
            <input
              id="file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:file:bg-neutral-800 dark:file:text-neutral-100"
            />
          </div>
          <div>
            <Label htmlFor="link">Or external link</Label>
            <Input id="link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={submitting || courses.length === 0}>
            {submitting ? "Uploading…" : "Add"}
          </Button>
          {courses.length === 0 && <p className="text-sm text-neutral-500">Add a course first.</p>}
        </form>
      </Card>

      <div className="mt-6 space-y-2">
        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : materials.length === 0 ? (
          <p className="text-sm text-neutral-500">No materials yet.</p>
        ) : (
          materials.map((m) => (
            <Card key={m.id} className="flex items-center justify-between gap-3">
              <button onClick={() => handleOpen(m)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  {m.courses && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: m.courses.color }} />}
                  <span className="truncate font-medium">{m.title}</span>
                </div>
                <p className="mt-0.5 text-sm text-neutral-500">{m.courses?.name}</p>
              </button>
              <button onClick={() => handleDelete(m)} className="shrink-0 text-sm text-neutral-400 hover:text-red-600">
                Delete
              </button>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
