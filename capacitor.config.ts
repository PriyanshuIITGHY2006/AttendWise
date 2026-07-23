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
  plugins: {
    // Default status-bar icon + brand tint for local notifications, so they
    // stop falling back to the generic system "i". The named drawable lives in
    // android/app/src/main/res/drawable/ic_stat_attendwise.xml.
    LocalNotifications: {
      smallIcon: "ic_stat_attendwise",
      iconColor: "#4F46E5",
    },
  },
}

export default config
