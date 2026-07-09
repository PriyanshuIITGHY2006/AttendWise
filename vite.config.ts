import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served under /AttendWise/ on GitHub Pages, but at the domain root in dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/AttendWise/' : '/',
  plugins: [react(), tailwindcss()],
}))
