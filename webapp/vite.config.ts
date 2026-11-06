import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The app is served from /AttendWise/app/ on GitHub Pages.
export default defineConfig({
  base: process.env.APP_BASE ?? '/AttendWise/app/',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
})
