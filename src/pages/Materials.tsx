import { useEffect, useMemo, useState, useCallback, type FormEvent } from "react"
import { useAuth } from "../context/AuthContext"
import { listAccessibleCourses, shareCourse, updateShareRole, listCourseShares, unshareCourse, listMyEditCourseIds, listUploadableCourseIds, listCourseOwners, type Course, type CourseShare } from "../features/courses/api"
import {
  listMaterials,
  uploadMaterialFile,
  getMaterialFileUrl,
  getMaterialFileUrls,
  createMaterial,
  moveMaterial,
  updateMaterialNotes,
  setMaterialStarred,
  renameMaterial,
  touchMaterialOpened,
  deleteMaterial,
  listFolders,
  createFolder,
  deleteFolder,
  type Material,
  type MaterialFolder,
} from "../features/materials/api"
import { fileKind, isViewable, displayName, kindMeta, type FileKind } from "../features/materials/fileKind"
import { driveFileId, drivePdfSource } from "../features/materials/drive"
import { maybeCompressImage, formatBytes } from "../features/materials/compressImage"
import { DocViewer, type OpenDoc } from "../features/materials/DocViewer"

// Stay a little under Supabase's 50 MB per-file cap so the error is friendly
// rather than a raw storage rejection mid-upload.
const MAX_UPLOAD_BYTES = 48 * 1024 * 1024
import { Card } from "../components/ui/Card"
import { ListSkeleton } from "../components/ui/Skeleton"
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
  const { user } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [materials, setMaterials] = useState<MaterialWithCourse[]>([])
  const [loading, setLoading] = useState(true)
  // Courses I can write to (own, or shared with "edit"), and the subset where I
  // may upload files (file-enabled member in a file-enabled course). A view-only
  // share can read but not write.
  const [uploadableCourses, setUploadableCourses] = useState<Set<string>>(new Set())
  const [editCourses, setEditCourses] = useState<Set<string>>(new Set())
  // course_id -> owner email, to tag shared folders ("shared by alice@…").
  const [courseOwners, setCourseOwners] = useState<Record<string, string>>({})

  const [folder, setFolder] = useState<string | null>(null) // course_id, or null = root
  const [subcat, setSubcat] = useState<CategoryId | null>(null) // default category within a course
  const [subfolder, setSubfolder] = useState<string | null>(null) // custom folder id within a course
  const [special, setSpecial] = useState<"starred" | "recent" | null>(null) // virtual root folders
  const [customFolders, setCustomFolders] = useState<MaterialFolder[]>([])
  const [folderModalCourse, setFolderModalCourse] = useState<string | null>(null) // "new folder" modal target
  const [dragOver, setDragOver] = useState(false)
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const [sort, setSort] = useState<"name" | "date" | "type">("name")
  const [typeFilter, setTypeFilter] = useState<"all" | "pdf" | "image" | "doc" | "link">("all")
  const [query, setQuery] = useState("")
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [openDocs, setOpenDocs] = useState<OpenDoc[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [viewerVisible, setViewerVisible] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [actionsFor, setActionsFor] = useState<Entry | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [c, m, f, up, edit, owners] = await Promise.all([
      listAccessibleCourses(),
      listMaterials(user.id),
      listFolders(),
      listUploadableCourseIds().catch(() => [] as string[]),
      listMyEditCourseIds(user.email ?? "").catch(() => [] as string[]),
      listCourseOwners().catch(() => ({} as Record<string, string>)),
    ])
    setCourses(c)
    setMaterials(m as MaterialWithCourse[])
    setCustomFolders(f)
    setUploadableCourses(new Set(up))
    setEditCourses(new Set(edit))
    setCourseOwners(owners)
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const searching = query.trim().length > 0

  const goRoot = () => {
    setFolder(null)
    setSubcat(null)
    setSubfolder(null)
    setSpecial(null)
    setQuery("")
  }
  const openCourse = (courseId: string) => { setFolder(courseId); setSubcat(null); setSubfolder(null) }
  const openCategory = (cat: CategoryId) => { setSubcat(cat); setSubfolder(null) }
  const openSubfolder = (id: string) => { setSubfolder(id); setSubcat(null) }
  const backToCourse = () => { setSubcat(null); setSubfolder(null) }

  // Custom folders for the open course.
  const courseFolders = useMemo(() => customFolders.filter((f) => f.course_id === folder), [customFolders, folder])
  const openFolderName = subfolder ? customFolders.find((f) => f.id === subfolder)?.name ?? null : null

  const starredCount = useMemo(() => materials.filter((m) => m.starred).length, [materials])
  const recentCount = useMemo(() => materials.filter((m) => m.last_opened_at).length, [materials])

  // Level 1: a folder for every course, shown by default (even before any file
  // is uploaded). Course folders are permanent -- they can't be deleted here.
  const folders = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of materials) counts.set(m.course_id, (counts.get(m.course_id) ?? 0) + 1)
    return courses.map((c) => ({ course: c, count: counts.get(c.id) ?? 0 }))
  }, [courses, materials])

  // Level 2: the four category folders inside the open course, always shown.
  const categoryFolders = useMemo(() => {
    if (!folder) return []
    const counts = new Map<string, number>()
    for (const m of materials) {
      if (m.course_id !== folder || m.folder_id) continue // foldered files count under their folder
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
    } else if (special === "starred") {
      list = list.filter((m) => m.starred)
    } else if (special === "recent") {
      list = list
        .filter((m) => m.last_opened_at)
        .slice()
        .sort((a, b) => (b.last_opened_at ?? "").localeCompare(a.last_opened_at ?? ""))
        .slice(0, 30)
    } else if (folder && subfolder) {
      list = list.filter((m) => m.course_id === folder && m.folder_id === subfolder)
    } else if (folder && subcat) {
      // Files in a custom folder don't also show under a category.
      list = list.filter((m) => m.course_id === folder && !m.folder_id && ((m.category as CategoryId) ?? "extras") === subcat)
    } else {
      list = []
    }
    let result = list.map(toEntry)
    if (typeFilter !== "all") result = result.filter((e) => e.kind === typeFilter)
    // "Recent" is intentionally kept in recency order; everything else honours
    // the sort control.
    if (special !== "recent") {
      result = [...result].sort((a, b) => {
        if (sort === "date") return (b.material.created_at ?? "").localeCompare(a.material.created_at ?? "")
        if (sort === "type") return a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)
        return a.name.localeCompare(b.name)
      })
    }
    return result
  }, [materials, folder, subcat, subfolder, special, query, searching, sort, typeFilter])

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
        // A shared Google Drive PDF opens in our own viewer (proxied so pdf.js
        // can fetch it) with full annotation support; anything else opens out.
        const fid = driveFileId(entry.material.external_link)
        if (fid) {
          touchMaterialOpened(entry.material.id)
          const nowIso = new Date().toISOString()
          setMaterials((prev) => prev.map((m) => (m.id === entry.material.id ? { ...m, last_opened_at: nowIso } : m)))
          const { url, httpHeaders } = drivePdfSource(fid)
          setOpenDocs((prev) => {
            if (prev.some((d) => d.id === entry.material.id)) return prev
            const doc: OpenDoc = { id: entry.material.id, name: entry.name, kind: "pdf", url, notes: entry.material.notes ?? "", httpHeaders, drive: true }
            return [...prev, doc]
          })
          setActiveDocId(entry.material.id)
          setViewerVisible(true)
          return
        }
        window.open(entry.material.external_link, "_blank", "noopener,noreferrer")
        return
      }
      const path = entry.material.file_path
      if (!path) return
      // Bump "recently opened" (fire-and-forget + optimistic).
      touchMaterialOpened(entry.material.id)
      const nowIso = new Date().toISOString()
      setMaterials((prev) => prev.map((m) => (m.id === entry.material.id ? { ...m, last_opened_at: nowIso } : m)))

      const url = urls[path] ?? (await getMaterialFileUrl(path))
      if (!urls[path]) setUrls((prev) => ({ ...prev, [path]: url }))

      if (isViewable(entry.kind)) {
        // Open (or re-focus) this file as a tab in the viewer.
        setOpenDocs((prev) => {
          if (prev.some((d) => d.id === entry.material.id)) return prev
          const doc: OpenDoc = { id: entry.material.id, name: entry.name, kind: entry.kind, url, notes: entry.material.notes ?? "" }
          return [...prev, doc]
        })
        setActiveDocId(entry.material.id)
        setViewerVisible(true)
      } else {
        window.open(url, "_blank", "noopener,noreferrer")
      }
    },
    [urls],
  )

  const closeTab = useCallback(
    (id: string) => {
      setOpenDocs((prev) => {
        const next = prev.filter((d) => d.id !== id)
        setActiveDocId((cur) => (cur === id ? (next[next.length - 1]?.id ?? null) : cur))
        if (next.length === 0) setViewerVisible(false)
        return next
      })
    },
    [],
  )

  const saveNotes = useCallback((id: string, notes: string) => {
    setOpenDocs((prev) => prev.map((d) => (d.id === id ? { ...d, notes } : d)))
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, notes } : m)))
    updateMaterialNotes(id, notes).catch(() => {})
  }, [])

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

  function handleStar(entry: Entry) {
    const starred = !entry.material.starred
    setMaterials((prev) => prev.map((m) => (m.id === entry.material.id ? { ...m, starred } : m)))
    setActionsFor(null)
    setMaterialStarred(entry.material.id, starred).catch(() => load())
  }

  async function handleDeleteFolder(f: MaterialFolder) {
    if (!confirm(`Delete the folder “${f.name}”? Files inside move back to their category.`)) return
    setCustomFolders((prev) => prev.filter((x) => x.id !== f.id))
    setMaterials((prev) => prev.map((m) => (m.folder_id === f.id ? { ...m, folder_id: null } : m)))
    if (subfolder === f.id) backToCourse()
    try {
      await deleteFolder(f.id)
    } catch {
      load()
    }
  }

  async function handleRename(entry: Entry) {
    const next = prompt("Rename file", entry.name)?.trim()
    setActionsFor(null)
    if (!next || next === entry.name) return
    setMaterials((prev) => prev.map((m) => (m.id === entry.material.id ? { ...m, title: next } : m)))
    try {
      await renameMaterial(entry.material.id, next)
    } catch {
      load()
    }
  }

  // Upload dropped files into the folder currently being viewed.
  const uploadInto = useCallback(
    async (files: FileList | File[], courseId: string, category: CategoryId, folderId: string | null = null) => {
      if (!user) return
      for (const file of Array.from(files)) {
        try {
          const toUpload = await maybeCompressImage(file)
          if (toUpload.size > MAX_UPLOAD_BYTES) continue
          const filePath = await uploadMaterialFile(user.id, courseId, toUpload)
          await createMaterial({ course_id: courseId, user_id: user.id, title: file.name, file_path: filePath, external_link: null, category, folder_id: folderId })
        } catch {
          /* skip a failed file, keep going */
        }
      }
      load()
    },
    [user, load],
  )

  // Permission helpers. Materials is open to anyone signed in; a folder share is
  // read-only ("view") unless it grants "edit".
  //  - canEdit: write to this folder (own it, or hold an edit share)
  //  - canUpload: additionally allowed to upload FILES (file-enabled member in a
  //    file-enabled course); everyone else with edit can only add links
  //  - canManage: edit/move/delete a specific material (edit rights, or own it)
  const ownsCourse = (courseId: string) => courses.find((c) => c.id === courseId)?.user_id === user?.id
  const canEdit = (courseId: string) => ownsCourse(courseId) || editCourses.has(courseId)
  const canUpload = (courseId: string) => uploadableCourses.has(courseId)
  const canManage = (m: MaterialWithCourse) => canEdit(m.course_id) || m.user_id === user?.id
  // Editable courses feed the Add sheet's course picker.
  const editableCourses = courses.filter((c) => canEdit(c.id))

  // Which level are we rendering?
  const showCourseFolders = !searching && !folder && !special
  const showCategoryFolders = !searching && !!folder && !subcat && !subfolder
  const showFiles = searching || !!special || (!!folder && (!!subcat || !!subfolder))
  const specialLabel = special === "starred" ? "Starred" : special === "recent" ? "Recent" : null

  return (
    <div className="mx-auto max-w-4xl">
      {/* breadcrumb + add */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <Crumb active={!folder && !searching && !special} onClick={goRoot}>
            Materials
          </Crumb>
          {!searching && !special && currentCourseName && (
            <>
              <Sep />
              <Crumb active={!subcat && !subfolder} onClick={backToCourse}>
                <span className="max-w-[9rem] truncate sm:max-w-none">{currentCourseName}</span>
              </Crumb>
            </>
          )}
          {!searching && !special && subcat && (
            <>
              <Sep />
              <Crumb active>{categoryLabel(subcat)}</Crumb>
            </>
          )}
          {!searching && !special && openFolderName && (
            <>
              <Sep />
              <Crumb active>{openFolderName}</Crumb>
            </>
          )}
          {specialLabel && (
            <>
              <Sep />
              <Crumb active>{specialLabel}</Crumb>
            </>
          )}
          {searching && (
            <>
              <Sep />
              <Crumb active>Search</Crumb>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {folder && courses.find((c) => c.id === folder)?.user_id === user?.id && (
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="hidden sm:inline">Share</span>
            </button>
          )}
          {editableCourses.length > 0 && (
            <Button onClick={() => setAddOpen(true)}>Add</Button>
          )}
        </div>
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

      {/* sort + type filter (only when a file list is showing) */}
      {showFiles && (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-lg border border-neutral-200 bg-white py-1.5 pl-2.5 pr-7 text-xs text-neutral-600 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            aria-label="Sort files"
          >
            <option value="name">Sort: Name</option>
            <option value="date">Sort: Newest</option>
            <option value="type">Sort: Type</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="rounded-lg border border-neutral-200 bg-white py-1.5 pl-2.5 pr-7 text-xs text-neutral-600 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            <option value="pdf">PDFs</option>
            <option value="image">Images</option>
            <option value="doc">Docs</option>
            <option value="link">Links</option>
          </select>
          <span className="ml-auto text-xs text-neutral-400">{entries.length} file{entries.length === 1 ? "" : "s"}</span>
        </div>
      )}

      {/* body */}
      {loading ? (
        <ListSkeleton />
      ) : showCourseFolders ? (
        folders.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} canAdd={courses.length > 0} />
        ) : (
          <>
            {(starredCount > 0 || recentCount > 0) && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {starredCount > 0 && (
                  <QuickCard glyph="star" tint="#f59e0b" title="Starred" subtitle={`${starredCount} item${starredCount === 1 ? "" : "s"}`} onClick={() => setSpecial("starred")} />
                )}
                {recentCount > 0 && (
                  <QuickCard glyph="clock" tint="#6366f1" title="Recent" subtitle="Recently opened" onClick={() => setSpecial("recent")} />
                )}
              </div>
            )}
            <p className="mt-6 text-xs font-medium uppercase tracking-wide text-neutral-400">Courses</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {folders.map(({ course, count }) => {
                const isShared = course.user_id !== user?.id
                const owner = courseOwners[course.id]
                return (
                  <FolderCard
                    key={course.id}
                    color={course.color}
                    title={course.name}
                    // Shared folders show whose they are, so same-named folders
                    // (e.g. two "Physics") stay distinguishable.
                    subtitle={isShared && owner ? `shared by ${owner}` : `${count} item${count === 1 ? "" : "s"}`}
                    shared={isShared}
                    onClick={() => openCourse(course.id)}
                  />
                )
              })}
            </div>
          </>
        )
      ) : showCategoryFolders ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categoryFolders.map((c) => (
            <FolderCard key={c.id} color={c.color} title={c.label} subtitle={`${c.count} item${c.count === 1 ? "" : "s"}`} onClick={() => openCategory(c.id)} />
          ))}
          {courseFolders.map((f) => {
            const count = materials.filter((m) => m.folder_id === f.id).length
            return (
              <FolderCard
                key={f.id}
                color="#64748b"
                title={f.name}
                subtitle={`${count} item${count === 1 ? "" : "s"}`}
                onClick={() => openSubfolder(f.id)}
                onDelete={courses.find((c) => c.id === folder)?.user_id === user?.id ? () => handleDeleteFolder(f) : undefined}
              />
            )
          })}
          {courses.find((c) => c.id === folder)?.user_id === user?.id && (
            <button
              onClick={() => setFolderModalCourse(folder)}
              className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-300 text-sm font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:hover:text-neutral-300"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
              New folder
            </button>
          )}
        </div>
      ) : (
        <div
          onDragOver={folder && canUpload(folder) && (subcat || subfolder) ? (e) => { e.preventDefault(); setDragOver(true) } : undefined}
          onDragLeave={folder && canUpload(folder) && (subcat || subfolder) ? () => setDragOver(false) : undefined}
          onDrop={
            folder && canUpload(folder) && (subcat || subfolder)
              ? (e) => {
                  e.preventDefault()
                  setDragOver(false)
                  if (e.dataTransfer.files.length) uploadInto(e.dataTransfer.files, folder, subcat ?? "extras", subfolder)
                }
              : undefined
          }
          className={`relative mt-5 min-h-[6rem] rounded-xl ${dragOver ? "outline-dashed outline-2 outline-indigo-400" : ""}`}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-indigo-50/80 text-sm font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              Drop files to upload here
            </div>
          )}
          {entries.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {searching ? "No files match your search." : special ? "Nothing here yet." : "This folder is empty. Drop files here, or tap Add."}
            </p>
          ) : layout === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {entries.map((e) => (
                <FileTile key={e.material.id} entry={e} thumb={e.material.file_path ? urls[e.material.file_path] : undefined} onOpen={() => openEntry(e)} onMenu={canManage(e.material) ? () => setActionsFor(e) : undefined} showCourse={searching || !!special} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200/70 dark:divide-neutral-800 dark:border-neutral-800">
              {entries.map((e) => (
                <FileRow key={e.material.id} entry={e} onOpen={() => openEntry(e)} onMenu={canManage(e.material) ? () => setActionsFor(e) : undefined} showCourse={searching || !!special} />
              ))}
            </div>
          )}
        </div>
      )}

      {addOpen && (
        <AddModal
          courses={editableCourses}
          defaultCourseId={folder && canEdit(folder) ? folder : editableCourses[0]?.id ?? ""}
          defaultCategory={subcat ?? "extras"}
          folderId={subfolder}
          userId={user!.id}
          canUploadFor={canUpload}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false)
            load()
          }}
        />
      )}

      {folderModalCourse && (
        <NewFolderModal
          existing={customFolders.filter((f) => f.course_id === folderModalCourse).map((f) => f.name.toLowerCase())}
          onClose={() => setFolderModalCourse(null)}
          onCreate={async (name) => {
            const f = await createFolder(folderModalCourse, name)
            setCustomFolders((prev) => [...prev, f])
            setFolderModalCourse(null)
          }}
        />
      )}

      {viewerVisible && openDocs.length > 0 && activeDocId && (
        <DocViewer
          docs={openDocs}
          activeId={activeDocId}
          onActivate={setActiveDocId}
          onCloseTab={closeTab}
          onMinimize={() => setViewerVisible(false)}
          onNotesChange={saveNotes}
        />
      )}

      {/* Minimised viewer -> quick reopen pill (keeps tabs across folders). */}
      {!viewerVisible && openDocs.length > 0 && (
        <button
          onClick={() => setViewerVisible(true)}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-brand sm:bottom-6"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" /></svg>
          {openDocs.length} open
        </button>
      )}

      {actionsFor && (
        <FileActionsSheet
          entry={actionsFor}
          onClose={() => setActionsFor(null)}
          onMove={(cat) => handleMove(actionsFor, cat)}
          onStar={() => handleStar(actionsFor)}
          onRename={() => handleRename(actionsFor)}
          onDelete={() => handleDelete(actionsFor)}
        />
      )}

      {shareOpen && folder && user && (
        <ShareModal
          courseId={folder}
          courseName={courses.find((c) => c.id === folder)?.name ?? "this course"}
          ownerId={user.id}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

function ShareModal({ courseId, courseName, ownerId, onClose }: { courseId: string; courseName: string; ownerId: string; onClose: () => void }) {
  const [shares, setShares] = useState<CourseShare[]>([])
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    listCourseShares(courseId).then(setShares).catch(() => {})
  }, [courseId])
  useEffect(() => load(), [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!addr || !addr.includes("@")) {
      setError("Enter a valid email.")
      return
    }
    // Already in the list -> guide to the toggle instead of a failed insert.
    if (shares.some((s) => s.shared_with_email.toLowerCase() === addr)) {
      setError("Already shared — set their access with the View/Edit toggle below.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await shareCourse(courseId, ownerId, addr, "view")
      setEmail("")
      load()
    } catch (err) {
      // Supabase throws a PostgrestError (a plain object, not an Error), so match
      // on its code/message rather than `instanceof Error`.
      const code = (err as { code?: string })?.code
      const msg = (err as { message?: string })?.message ?? ""
      const dup = code === "23505" || /duplicate|already exists/i.test(msg)
      setError(dup ? "Already shared — set their access with the View/Edit toggle below." : "Couldn't share.")
    } finally {
      setBusy(false)
    }
  }

  async function setRole(id: string, role: "edit" | "view") {
    setShares((prev) => prev.map((s) => (s.id === id ? { ...s, role } : s)))
    try {
      await updateShareRole(id, role)
    } catch {
      load()
    }
  }

  async function remove(id: string) {
    setShares((prev) => prev.filter((s) => s.id !== id))
    try {
      await unshareCourse(id)
    } catch {
      load()
    }
  }

  return (
    <div className="aw-overlay fixed inset-0 z-40 flex items-end justify-center bg-neutral-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="aw-sheet w-full max-w-md rounded-t-2xl bg-white p-5 shadow-elevated dark:bg-neutral-900 sm:rounded-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="min-w-0 truncate text-base font-semibold">Share “{courseName}”</h2>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>
        <p className="mt-1 text-sm text-neutral-500">Share this course folder. <span className="font-medium">View-only</span> people can just read it; <span className="font-medium">Edit</span> people can add and manage materials.</p>

        <form onSubmit={add} className="mt-4 flex gap-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@email.com" className="flex-1" />
          <Button type="submit" disabled={busy}>{busy ? "…" : "Share"}</Button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 space-y-1">
          {shares.length === 0 ? (
            <p className="text-sm text-neutral-400">Not shared with anyone yet.</p>
          ) : (
            shares.map((s) => {
              const edit = s.role === "edit"
              return (
                <div key={s.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{s.shared_with_email}</span>
                  <div className="flex shrink-0 overflow-hidden rounded-md border border-neutral-200 text-xs dark:border-neutral-700">
                    <button onClick={() => setRole(s.id, "view")} className={`px-2 py-1 ${!edit ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>View</button>
                    <button onClick={() => setRole(s.id, "edit")} className={`px-2 py-1 ${edit ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>Edit</button>
                  </div>
                  <button onClick={() => remove(s.id)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">Remove</button>
                </div>
              )
            })
          )}
        </div>
        <p className="mt-3 text-xs text-neutral-400">“View” members can only read the folder. “Edit” members can add links and manage materials; uploading actual files stays limited to your course's file-enabled members.</p>
      </div>
    </div>
  )
}

function QuickCard({ glyph, tint, title, subtitle, onClick }: { glyph: "star" | "clock"; tint: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-neutral-200/70 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover dark:border-neutral-800 dark:bg-neutral-900"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${tint}1a` }}>
        {glyph === "star" ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill={tint}><path d="M12 2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.9l1.2-6.6L2.5 9.7l6.6-.9L12 2z" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={tint} strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-neutral-500">{subtitle}</p>
      </div>
    </button>
  )
}

function FileActionsSheet({ entry, onClose, onMove, onStar, onRename, onDelete }: { entry: Entry; onClose: () => void; onMove: (cat: CategoryId) => void; onStar: () => void; onRename: () => void; onDelete: () => void }) {
  const current = (entry.material.category as CategoryId) ?? "extras"
  const starred = entry.material.starred
  return (
    <div className="aw-overlay fixed inset-0 z-40 flex items-end justify-center bg-neutral-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="aw-sheet w-full max-w-md rounded-t-2xl bg-white p-4 shadow-elevated dark:bg-neutral-900 sm:rounded-2xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="truncate px-1 pb-2 text-sm font-medium">{entry.name}</p>
        <div className="mb-2 flex gap-2 border-b border-neutral-100 pb-3 dark:border-neutral-800">
          <button onClick={onStar} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-100 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill={starred ? "#f59e0b" : "none"} stroke={starred ? "#f59e0b" : "currentColor"} strokeWidth="2"><path d="M12 2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.9l1.2-6.6L2.5 9.7l6.6-.9L12 2z" strokeLinejoin="round" /></svg>
            {starred ? "Starred" : "Star"}
          </button>
          <button onClick={onRename} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-100 py-2 text-sm font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Rename
          </button>
        </div>
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

function FolderCard({ color, title, subtitle, shared, onClick, onDelete }: { color: string; title: string; subtitle: string; shared?: boolean; onClick: () => void; onDelete?: () => void }) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl border border-neutral-200/70 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover dark:border-neutral-800 dark:bg-neutral-900"
      >
        <svg viewBox="0 0 24 24" className="h-9 w-9 shrink-0" fill="none">
          <path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" fill={color} opacity="0.9" />
          <path d="M3 9h18" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
        </svg>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{title}</p>
            {shared && (
              <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                Shared
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
      </button>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600 group-hover:flex dark:hover:bg-neutral-800"
          aria-label="Delete folder"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
    </div>
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

function FileTile({ entry, thumb, onOpen, onMenu, showCourse }: { entry: Entry; thumb?: string; onOpen: () => void; onMenu?: () => void; showCourse: boolean }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-neutral-200/70 bg-white transition-all hover:-translate-y-0.5 hover:shadow-card-hover dark:border-neutral-800 dark:bg-neutral-900">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-neutral-50 dark:bg-neutral-800/50">
          <Thumb entry={entry} thumb={thumb} size="tile" />
          {entry.material.starred && (
            <svg viewBox="0 0 24 24" className="absolute left-1.5 top-1.5 h-4 w-4 drop-shadow" fill="#f59e0b"><path d="M12 2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.9l1.2-6.6L2.5 9.7l6.6-.9L12 2z" /></svg>
          )}
        </div>
        <div className="min-w-0 p-2.5">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {showCourse && entry.material.courses ? `${entry.material.courses.name} · ${categoryLabel(entry.material.category)}` : fmtDate(entry.material.created_at)}
          </p>
        </div>
      </button>
      {onMenu && (
        <button
          onClick={onMenu}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 text-neutral-500 opacity-0 backdrop-blur transition-opacity hover:text-neutral-900 group-hover:opacity-100 dark:bg-neutral-900/80 dark:hover:text-neutral-100"
          aria-label="File actions"
        >
          <MoreIcon />
        </button>
      )}
    </div>
  )
}

function FileRow({ entry, onOpen, onMenu, showCourse }: { entry: Entry; onOpen: () => void; onMenu?: () => void; showCourse: boolean }) {
  return (
    <div className="flex items-center gap-3 bg-white px-3 py-2.5 dark:bg-neutral-900">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Thumb entry={entry} size="row" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            {entry.material.starred && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="#f59e0b"><path d="M12 2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.9l1.2-6.6L2.5 9.7l6.6-.9L12 2z" /></svg>}
            <span className="truncate">{entry.name}</span>
          </p>
          <p className="truncate text-xs text-neutral-500">
            {(showCourse && entry.material.courses ? `${entry.material.courses.name} · ` : "") + fmtDate(entry.material.created_at)}
          </p>
        </div>
      </button>
      {onMenu && (
        <button onClick={onMenu} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800" aria-label="File actions">
          <MoreIcon />
        </button>
      )}
    </div>
  )
}

function NewFolderModal({ existing, onClose, onCreate }: { existing: string[]; onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) { setError("Enter a folder name."); return }
    if (existing.includes(n.toLowerCase())) { setError("A folder with that name already exists."); return }
    setSubmitting(true)
    setError(null)
    try {
      await onCreate(n)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ""
      setError(/duplicate|unique/i.test(msg) ? "A folder with that name already exists." : "Couldn't create the folder.")
      setSubmitting(false)
    }
  }
  return (
    <div className="aw-overlay fixed inset-0 z-40 flex items-end justify-center bg-neutral-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="aw-sheet w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-elevated dark:bg-neutral-900 sm:rounded-2xl" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold">New folder</h2>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name" maxLength={60} />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting} className="flex-1">{submitting ? "Creating…" : "Create"}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddModal({
  courses,
  defaultCourseId,
  defaultCategory,
  folderId = null,
  userId,
  canUploadFor,
  onClose,
  onAdded,
}: {
  courses: Course[]
  defaultCourseId: string
  defaultCategory: CategoryId
  folderId?: string | null
  userId: string
  canUploadFor: (courseId: string) => boolean
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

  // In courses where you can't upload files, the picker is hidden and any
  // previously chosen file is dropped -- you can still add an external link.
  const fileAllowed = canUploadFor(courseId)
  useEffect(() => {
    if (!fileAllowed && file) setFile(null)
  }, [fileAllowed, file])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!courseId) return
    if (!file && !link) {
      setError(fileAllowed ? "Attach a file or a link." : "Add a link.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // Shrink big photos before upload; PDFs/others pass through unchanged.
      const toUpload = file ? await maybeCompressImage(file) : null
      if (toUpload && toUpload.size > MAX_UPLOAD_BYTES) {
        setError(`That file is ${formatBytes(toUpload.size)} — over the 48 MB limit. Compress it, or paste a link instead.`)
        return
      }
      const filePath = toUpload ? await uploadMaterialFile(userId, courseId, toUpload) : null
      await createMaterial({
        course_id: courseId,
        user_id: userId,
        title: title || (file ? file.name : link),
        file_path: filePath,
        external_link: link || null,
        category,
        // Only file into the custom folder when the course wasn't changed.
        folder_id: courseId === defaultCourseId ? folderId : null,
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
    <div className="aw-overlay fixed inset-0 z-40 flex items-end justify-center bg-neutral-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="aw-sheet w-full max-w-md rounded-t-2xl bg-white p-5 shadow-elevated dark:bg-neutral-900 sm:rounded-2xl"
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
          {fileAllowed ? (
            <div>
              <Label htmlFor="m-file">File</Label>
              <input id="m-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-neutral-500 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:file:bg-neutral-800 dark:file:text-neutral-100" />
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/50">
              You can add a link here. File uploads for this course are limited to its file-enabled members.
            </div>
          )}
          <div>
            <Label htmlFor="m-link">{fileAllowed ? "Or external link" : "External link"}</Label>
            <Input id="m-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" />
            <p className="mt-1 text-xs text-neutral-500">A Google Drive PDF shared as “Anyone with the link” opens right here — with annotations.</p>
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
