import { useEffect, useMemo, useState, useCallback, type FormEvent } from "react"
import { useAuth } from "../context/AuthContext"
import { listCourses, type Course } from "../features/courses/api"
import {
  listMaterials,
  uploadMaterialFile,
  getMaterialFileUrl,
  getMaterialFileUrls,
  createMaterial,
  moveMaterial,
  deleteMaterial,
  type Material,
} from "../features/materials/api"
import { fileKind, isViewable, displayName, kindMeta, type FileKind } from "../features/materials/fileKind"
import { FileViewer, type ViewerItem } from "../features/materials/FileViewer"
import { Card } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { Input, Label } from "../components/ui/Input"

type MaterialWithCourse = Material & { courses: { name: string; color: string } | null }

// The four subfolders present inside every course by default.
const CATEGORIES = [
  { id: "class_notes", label: "Class Notes", color: "#2563eb" },
  { id: "tutorial_sheets", label: "Tutorial Sheets", color: "#16a34a" },
  { id: "question_papers", label: "Question Papers", color: "#ef4444" },
  { id: "extras", label: "Extras", color: "#8b5cf6" },
] as const
type CategoryId = (typeof CATEGORIES)[number]["id"]
const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "Extras"

type Entry = {
  material: MaterialWithCourse
  name: string
  kind: FileKind
  isLink: boolean
}

function toEntry(m: MaterialWithCourse): Entry {
  const isLink = !m.file_path && !!m.external_link
  return { material: m, name: displayName(m.title, m.file_path), kind: fileKind(m.file_path, isLink), isLink }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function Materials() {
  const { user, hasMaterialAccess } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [materials, setMaterials] = useState<MaterialWithCourse[]>([])
  const [loading, setLoading] = useState(true)

  const [folder, setFolder] = useState<string | null>(null) // course_id, or null = root
  const [subcat, setSubcat] = useState<CategoryId | null>(null) // category within a course
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const [query, setQuery] = useState("")
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [actionsFor, setActionsFor] = useState<Entry | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [c, m] = await Promise.all([listCourses(user.id), listMaterials(user.id)])
    setCourses(c)
    setMaterials(m as MaterialWithCourse[])
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const searching = query.trim().length > 0

  const goRoot = () => {
    setFolder(null)
    setSubcat(null)
    setQuery("")
  }

  // Level 1: course folders (courses with at least one material), with counts.
  const folders = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of materials) counts.set(m.course_id, (counts.get(m.course_id) ?? 0) + 1)
    return courses.filter((c) => counts.has(c.id)).map((c) => ({ course: c, count: counts.get(c.id) ?? 0 }))
  }, [courses, materials])

  // Level 2: the four category folders inside the open course, always shown.
  const categoryFolders = useMemo(() => {
    if (!folder) return []
    const counts = new Map<string, number>()
    for (const m of materials) {
      if (m.course_id !== folder) continue
      const cat = (m.category as CategoryId) ?? "extras"
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return CATEGORIES.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
  }, [materials, folder])

  // Level 3 (or search results): the actual files shown.
  const entries = useMemo(() => {
    let list = materials
    if (searching) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (m) =>
          displayName(m.title, m.file_path).toLowerCase().includes(q) ||
          m.courses?.name.toLowerCase().includes(q) ||
          categoryLabel(m.category).toLowerCase().includes(q),
      )
    } else if (folder && subcat) {
      list = list.filter((m) => m.course_id === folder && ((m.category as CategoryId) ?? "extras") === subcat)
    } else {
      list = []
    }
    return list.map(toEntry)
  }, [materials, folder, subcat, query, searching])

  // Batch-sign visible files so image tiles get thumbnails and the viewer opens
  // instantly.
  useEffect(() => {
    const paths = entries.map((e) => e.material.file_path).filter((p): p is string => !!p && !(p in urls))
    if (paths.length === 0) return
    getMaterialFileUrls(paths).then((map) => setUrls((prev) => ({ ...prev, ...map })))
  }, [entries, urls])

  const currentCourseName = folder ? courses.find((c) => c.id === folder)?.name : null

  const openEntry = useCallback(
    async (entry: Entry) => {
      if (entry.isLink && entry.material.external_link) {
        window.open(entry.material.external_link, "_blank", "noopener,noreferrer")
        return
      }
      const path = entry.material.file_path
      if (!path) return
      const url = urls[path] ?? (await getMaterialFileUrl(path))
      if (!urls[path]) setUrls((prev) => ({ ...prev, [path]: url }))

      if (isViewable(entry.kind)) {
        const viewables = entries.filter((e) => e.material.file_path && isViewable(e.kind))
        const items: ViewerItem[] = viewables.map((e) => ({
          id: e.material.id,
          name: e.name,
          kind: e.kind,
          url: urls[e.material.file_path!] ?? (e.material.id === entry.material.id ? url : ""),
          downloadName: e.name,
        }))
        const index = viewables.findIndex((e) => e.material.id === entry.material.id)
        setViewer({ items, index: Math.max(0, index) })
      } else {
        window.open(url, "_blank", "noopener,noreferrer")
      }
    },
    [entries, urls],
  )

  async function handleDelete(entry: Entry) {
    if (!confirm(`Delete "${entry.name}"?`)) return
    await deleteMaterial(entry.material)
    setActionsFor(null)
    load()
  }

  async function handleMove(entry: Entry, category: CategoryId) {
    // Optimistic: reflect the new folder immediately, then persist.
    setMaterials((prev) => prev.map((m) => (m.id === entry.material.id ? { ...m, category } : m)))
    setActionsFor(null)
    try {
      await moveMaterial(entry.material.id, category)
    } catch {
      load() // revert to server truth on failure
    }
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

  // Which level are we rendering?
  const showCourseFolders = !searching && !folder
  const showCategoryFolders = !searching && !!folder && !subcat
  const showFiles = searching || (!!folder && !!subcat)

  return (
    <div className="mx-auto max-w-4xl">
      {/* breadcrumb + add */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <Crumb active={!folder && !searching} onClick={goRoot}>
            Materials
          </Crumb>
          {!searching && currentCourseName && (
            <>
              <Sep />
              <Crumb active={!subcat} onClick={() => setSubcat(null)}>
                <span className="max-w-[9rem] truncate sm:max-w-none">{currentCourseName}</span>
              </Crumb>
            </>
          )}
          {!searching && subcat && (
            <>
              <Sep />
              <Crumb active>{categoryLabel(subcat)}</Crumb>
            </>
          )}
          {searching && (
            <>
              <Sep />
              <Crumb active>Search</Crumb>
            </>
          )}
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={courses.length === 0}>
          Add
        </Button>
      </div>

      {/* toolbar */}
      <div className="mt-4 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        {showFiles && (
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
            <button onClick={() => setLayout("grid")} className={`flex h-9 w-9 items-center justify-center ${layout === "grid" ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100" : "text-neutral-400"}`} aria-label="Grid view">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            </button>
            <button onClick={() => setLayout("list")} className={`flex h-9 w-9 items-center justify-center ${layout === "list" ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100" : "text-neutral-400"}`} aria-label="List view">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* body */}
      {loading ? (
        <p className="mt-6 text-sm text-neutral-400">Loading…</p>
      ) : showCourseFolders ? (
        folders.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} canAdd={courses.length > 0} />
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {folders.map(({ course, count }) => (
              <FolderCard key={course.id} color={course.color} title={course.name} subtitle={`${count} item${count === 1 ? "" : "s"}`} onClick={() => setFolder(course.id)} />
            ))}
          </div>
        )
      ) : showCategoryFolders ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categoryFolders.map((c) => (
            <FolderCard key={c.id} color={c.color} title={c.label} subtitle={`${c.count} item${c.count === 1 ? "" : "s"}`} onClick={() => setSubcat(c.id)} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">{searching ? "No files match your search." : "This folder is empty. Tap Add to upload."}</p>
      ) : layout === "grid" ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {entries.map((e) => (
            <FileTile key={e.material.id} entry={e} thumb={e.material.file_path ? urls[e.material.file_path] : undefined} onOpen={() => openEntry(e)} onMenu={() => setActionsFor(e)} showCourse={searching} />
          ))}
        </div>
      ) : (
        <div className="mt-5 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200/70 dark:divide-neutral-800 dark:border-neutral-800">
          {entries.map((e) => (
            <FileRow key={e.material.id} entry={e} onOpen={() => openEntry(e)} onMenu={() => setActionsFor(e)} showCourse={searching} />
          ))}
        </div>
      )}

      {addOpen && (
        <AddModal
          courses={courses}
          defaultCourseId={folder ?? courses[0]?.id ?? ""}
          defaultCategory={subcat ?? "extras"}
          userId={user!.id}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false)
            load()
          }}
        />
      )}

      {viewer && (
        <FileViewer
          items={viewer.items}
          index={viewer.index}
          onIndexChange={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
          onClose={() => setViewer(null)}
        />
      )}

      {actionsFor && (
        <FileActionsSheet
          entry={actionsFor}
          onClose={() => setActionsFor(null)}
          onMove={(cat) => handleMove(actionsFor, cat)}
          onDelete={() => handleDelete(actionsFor)}
        />
      )}
    </div>
  )
}

function FileActionsSheet({ entry, onClose, onMove, onDelete }: { entry: Entry; onClose: () => void; onMove: (cat: CategoryId) => void; onDelete: () => void }) {
  const current = (entry.material.category as CategoryId) ?? "extras"
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-neutral-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-elevated dark:bg-neutral-900 sm:rounded-2xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="truncate px-1 pb-2 text-sm font-medium">{entry.name}</p>
        <p className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Move to folder</p>
        <div className="space-y-1">
          {CATEGORIES.map((c) => {
            const isCurrent = c.id === current
            return (
              <button
                key={c.id}
                disabled={isCurrent}
                onClick={() => onMove(c.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm ${isCurrent ? "cursor-default text-neutral-400" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none">
                  <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill={c.color} opacity={isCurrent ? 0.4 : 0.9} />
                </svg>
                <span className="flex-1 font-medium">{c.label}</span>
                {isCurrent && <span className="text-xs text-neutral-400">Current</span>}
              </button>
            )
          })}
        </div>
        <div className="mt-2 border-t border-neutral-100 pt-2 dark:border-neutral-800">
          <button onClick={onDelete} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
            <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="font-medium">Delete</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function Crumb({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  if (active || !onClick)
    return <span className="flex min-w-0 shrink items-center font-medium text-neutral-900 dark:text-neutral-100">{children}</span>
  return (
    <button onClick={onClick} className="flex shrink-0 items-center font-medium text-indigo-600 hover:underline dark:text-indigo-400">
      {children}
    </button>
  )
}

function Sep() {
  return <span className="shrink-0 text-neutral-300">/</span>
}

function EmptyState({ onAdd, canAdd }: { onAdd: () => void; canAdd: boolean }) {
  return (
    <Card className="mx-auto mt-6 max-w-md text-center">
      <p className="text-sm text-neutral-500">No files yet.</p>
      {canAdd ? <Button className="mt-3" onClick={onAdd}>Add your first file</Button> : <p className="mt-2 text-sm text-neutral-400">Add a course first.</p>}
    </Card>
  )
}

function FolderCard({ color, title, subtitle, onClick }: { color: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-neutral-200/70 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover dark:border-neutral-800 dark:bg-neutral-900"
    >
      <svg viewBox="0 0 24 24" className="h-9 w-9 shrink-0" fill="none">
        <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill={color} opacity="0.9" />
        <path d="M3 9h18" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
      </svg>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-xs text-neutral-500">{subtitle}</p>
      </div>
    </button>
  )
}

function FileGlyph({ kind, className = "h-9 w-9" }: { kind: FileKind; className?: string }) {
  const { label, color } = kindMeta(kind)
  return (
    <svg viewBox="0 0 32 40" className={`${className} shrink-0`}>
      <path d="M4 3a3 3 0 0 1 3-3h13l8 8v29a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V3Z" fill={color} opacity="0.12" />
      <path d="M20 0l8 8h-5a3 3 0 0 1-3-3V0Z" fill={color} opacity="0.3" />
      <text x="16" y="27" textAnchor="middle" fontSize="7" fontWeight="700" fill={color} fontFamily="Inter Variable, Inter, sans-serif">
        {label.slice(0, 5).toUpperCase()}
      </text>
    </svg>
  )
}

function Thumb({ entry, thumb, size }: { entry: Entry; thumb?: string; size: "tile" | "row" }) {
  const dim = size === "tile" ? "h-full w-full" : "h-10 w-10"
  if (entry.kind === "image" && thumb) {
    return <img src={thumb} alt="" className={`${dim} rounded-lg object-cover`} loading="lazy" />
  }
  return (
    <div className={`flex ${dim} items-center justify-center`}>
      <FileGlyph kind={entry.kind} className={size === "tile" ? "h-12 w-12" : "h-8 w-8"} />
    </div>
  )
}

function MoreIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
    </svg>
  )
}

function FileTile({ entry, thumb, onOpen, onMenu, showCourse }: { entry: Entry; thumb?: string; onOpen: () => void; onMenu: () => void; showCourse: boolean }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-neutral-200/70 bg-white transition-all hover:-translate-y-0.5 hover:shadow-card-hover dark:border-neutral-800 dark:bg-neutral-900">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-neutral-50 dark:bg-neutral-800/50">
          <Thumb entry={entry} thumb={thumb} size="tile" />
        </div>
        <div className="min-w-0 p-2.5">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {showCourse && entry.material.courses ? `${entry.material.courses.name} · ${categoryLabel(entry.material.category)}` : fmtDate(entry.material.created_at)}
          </p>
        </div>
      </button>
      <button
        onClick={onMenu}
        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-neutral-500 opacity-0 backdrop-blur transition-opacity hover:text-neutral-900 group-hover:opacity-100 dark:bg-neutral-900/80 dark:hover:text-neutral-100"
        aria-label="File actions"
      >
        <MoreIcon />
      </button>
    </div>
  )
}

function FileRow({ entry, onOpen, onMenu, showCourse }: { entry: Entry; onOpen: () => void; onMenu: () => void; showCourse: boolean }) {
  return (
    <div className="flex items-center gap-3 bg-white px-3 py-2.5 dark:bg-neutral-900">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Thumb entry={entry} size="row" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {(showCourse && entry.material.courses ? `${entry.material.courses.name} · ` : "") + fmtDate(entry.material.created_at)}
          </p>
        </div>
      </button>
      <button onClick={onMenu} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800" aria-label="File actions">
        <MoreIcon />
      </button>
    </div>
  )
}

function AddModal({
  courses,
  defaultCourseId,
  defaultCategory,
  userId,
  onClose,
  onAdded,
}: {
  courses: Course[]
  defaultCourseId: string
  defaultCategory: CategoryId
  userId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [title, setTitle] = useState("")
  const [courseId, setCourseId] = useState(defaultCourseId)
  const [category, setCategory] = useState<CategoryId>(defaultCategory)
  const [file, setFile] = useState<File | null>(null)
  const [link, setLink] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!courseId) return
    if (!file && !link) {
      setError("Attach a file or a link.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const filePath = file ? await uploadMaterialFile(userId, courseId, file) : null
      await createMaterial({
        course_id: courseId,
        user_id: userId,
        title: title || (file ? file.name : link),
        file_path: filePath,
        external_link: link || null,
        category,
      })
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setSubmitting(false)
    }
  }

  const selectClass = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-neutral-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-elevated dark:bg-neutral-900 sm:rounded-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Add material</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="m-title">Title <span className="font-normal text-neutral-400">(optional)</span></Label>
            <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the file name" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="m-course">Course</Label>
              <select id="m-course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className={selectClass}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="m-cat">Folder</Label>
              <select id="m-cat" value={category} onChange={(e) => setCategory(e.target.value as CategoryId)} className={selectClass}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="m-file">File</Label>
            <input id="m-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:file:bg-neutral-800 dark:file:text-neutral-100" />
          </div>
          <div>
            <Label htmlFor="m-link">Or external link</Label>
            <Input id="m-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Uploading…" : "Add"}
          </Button>
        </form>
      </div>
    </div>
  )
}
