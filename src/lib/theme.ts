// Theme control. The app ships light by default (dark is opt-in), so existing
// users see no change until they pick Dark or System in Settings. The `.dark`
// class on <html> drives Tailwind's class-based `dark:` variant.
export type Theme = "light" | "dark" | "system"

const KEY = "attendwise_theme"

export function getStoredTheme(): Theme {
  const v = localStorage.getItem(KEY)
  return v === "dark" || v === "system" || v === "light" ? v : "light"
}

export function resolveTheme(t: Theme): "light" | "dark" {
  if (t === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  return t
}

export function applyTheme(t: Theme) {
  const resolved = resolveTheme(t)
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0a0a0f" : "#ffffff")
}

export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t)
  applyTheme(t)
}

// Keep "system" mode reactive to OS changes. Call once at startup.
export function initTheme() {
  applyTheme(getStoredTheme())
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getStoredTheme() === "system") applyTheme("system")
  })
}
