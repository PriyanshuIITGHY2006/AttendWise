import type { CapacitorConfig } from "@capacitor/cli"

// Points at the already-deployed site instead of bundling a local copy of
// dist/ -- any web update goes live in the "app" immediately with no
// separate native rebuild, since there's no offline story here anyway.
const config: CapacitorConfig = {
  appId: "in.ac.iitg.attendwise",
  appName: "AttendWise",
  webDir: "dist",
  server: {
    url: "https://priyanshuiitghy2006.github.io/AttendWise/",
    cleartext: false,
  },
}

export default config
