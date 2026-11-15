import { supabase } from './supabase'

export type ReportKind = 'bug' | 'idea' | 'other'
export type ReportArea = 'today' | 'courses' | 'plan' | 'calendar' | 'profile' | 'sign_in' | 'widgets' | 'notifications' | 'other'

export const KINDS: Array<{ id: ReportKind; title: string; hint: string }> = [
  { id: 'bug', title: 'Something is wrong', hint: 'A bug, a wrong number, a crash' },
  { id: 'idea', title: 'I have an idea', hint: 'A feature or a change you would like' },
  { id: 'other', title: 'Something else', hint: 'Anything that fits nowhere else' },
]

export const AREAS: Array<{ id: ReportArea; label: string; hint: string }> = [
  { id: 'today', label: 'Today', hint: 'Home screen and class cards' },
  { id: 'courses', label: 'Courses', hint: 'Course list, details and editing' },
  { id: 'plan', label: 'Plan', hint: 'Skip planner and what-ifs' },
  { id: 'calendar', label: 'Calendar', hint: 'Week and month views' },
  { id: 'profile', label: 'Profile', hint: 'Streaks, badges and avatar' },
  { id: 'sign_in', label: 'Sign in', hint: 'Login, account and sync' },
  { id: 'widgets', label: 'Widgets', hint: 'Android home screen widgets' },
  { id: 'notifications', label: 'Notifications', hint: 'Reminders on Android' },
  { id: 'other', label: 'Other', hint: 'Anything that fits nowhere else' },
]

export const MAX_FILES = 5
export const MAX_MESSAGE = 4000
export const MIN_MESSAGE = 10
const LONG_EDGE = 1600
const JPEG_QUALITY = 0.85
const MAX_BYTES = 5 * 1024 * 1024

export interface Attachment { id: string; name: string; blob: Blob; url: string; width: number; height: number }

/** Shrinks a screenshot to at most 1600 px on its long side and saves it as JPEG, so uploads stay small. */
export async function prepareImage(file: File): Promise<Attachment> {
  if (!/^image\/(png|jpeg|webp|heic|heif|gif)$/i.test(file.type)) throw new Error(`${file.name || 'That file'} is not a picture.`)
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, LONG_EDGE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot prepare pictures.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Could not read that picture.')
  if (blob.size > MAX_BYTES) throw new Error(`${file.name || 'That picture'} is still over 5 MB after shrinking.`)
  return { id: crypto.randomUUID(), name: (file.name || 'screenshot').replace(/\.[^.]+$/, '').slice(0, 80) + '.jpg', blob, url: URL.createObjectURL(blob), width: w, height: h }
}

export function deviceInfo(theme: string, version: string): Record<string, string | number> {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown'
  return { browser, os, screen: `${window.innerWidth}x${window.innerHeight}`, pixel_ratio: window.devicePixelRatio, theme, language: navigator.language, app_version: version, local_time: new Date().toString().slice(0, 33) }
}

export const describeDevice = (d: Record<string, string | number>): string => `${d.browser} on ${d.os}, ${d.screen}, ${d.theme} theme, ${d.language}`

export interface ReportInput {
  kind: ReportKind
  area: ReportArea | null
  message: string
  files: Attachment[]
  device: Record<string, string | number> | null
  version: string
  name: string
  email: string
}

/** Uploads the screenshots first, then the report, then one row per screenshot. Returns an error text, or null on success. */
export async function submitReport(input: ReportInput, userId: string, onProgress: (done: number, total: number) => void): Promise<string | null> {
  const reportId = crypto.randomUUID()
  const total = input.files.length + 1
  let done = 0
  const uploaded: Array<{ path: string; name: string; size: number }> = []
  for (const [i, f] of input.files.entries()) {
    const path = `${userId}/${reportId}/${i + 1}.jpg`
    const { error } = await supabase.storage.from('report-files').upload(path, f.blob, { contentType: 'image/jpeg', upsert: false })
    if (error) return `A screenshot did not upload (${error.message}). Your text is kept, try again.`
    uploaded.push({ path, name: f.name, size: f.blob.size })
    onProgress(++done, total)
  }
  const { error } = await supabase.from('reports').insert({
    id: reportId, kind: input.kind, area: input.area, message: input.message.trim(), platform: 'web', app_version: input.version,
    device: input.device, reporter_name: input.name || null, reporter_email: input.email || null,
  })
  if (error) return error.message.includes('Too many') ? 'You have sent a lot of reports today. Please try again tomorrow.' : `The report did not send (${error.message}). Your text is kept, try again.`
  if (uploaded.length) {
    const { error: fe } = await supabase.from('report_files').insert(uploaded.map((u) => ({ report_id: reportId, path: u.path, name: u.name, mime: 'image/jpeg', size_bytes: u.size })))
    if (fe) return `The report was sent, but its screenshots could not be linked (${fe.message}).`
  }
  onProgress(total, total)
  return null
}
