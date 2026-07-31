import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "./context/AuthContext"
import { ProtectedRoute } from "./components/layout/ProtectedRoute"
import { AppLayout } from "./components/layout/AppLayout"
import { Login } from "./pages/Login"
import { SignUp } from "./pages/SignUp"
import { Dashboard } from "./pages/Dashboard"

// Everything past the two entry screens (Login) and the landing page (Today) is
// code-split, so the initial download/parse only covers what the first screen
// needs; each other page arrives as its own small chunk on first navigation.
const named = <T extends Record<string, unknown>, K extends keyof T>(loader: () => Promise<T>, key: K) =>
  lazy(() => loader().then((m) => ({ default: m[key] as React.ComponentType })))

const Courses = named(() => import("./pages/Courses"), "Courses")
const NewCourse = named(() => import("./pages/NewCourse"), "NewCourse")
const EditCourse = named(() => import("./pages/EditCourse"), "EditCourse")
const CourseDetail = named(() => import("./pages/CourseDetail"), "CourseDetail")
const Materials = named(() => import("./pages/Materials"), "Materials")
const Calendar = named(() => import("./pages/Calendar"), "Calendar")
const Timetable = named(() => import("./pages/Timetable"), "Timetable")
const Insights = named(() => import("./pages/Insights"), "Insights")
const Grades = named(() => import("./pages/Grades"), "Grades")
const PlanDayOff = named(() => import("./pages/PlanDayOff"), "PlanDayOff")
const Deadlines = named(() => import("./pages/Deadlines"), "Deadlines")
const Settings = named(() => import("./pages/Settings"), "Settings")
const SharedMaterial = named(() => import("./pages/SharedMaterial"), "SharedMaterial")

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          {/* Public link-only file viewer -- no auth gate. */}
          <Route
            path="/s/:token"
            element={
              <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
                <SharedMaterial />
              </Suspense>
            }
          />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/courses/new" element={<NewCourse />} />
              <Route path="/courses/:courseId" element={<CourseDetail />} />
              <Route path="/courses/:courseId/edit" element={<EditCourse />} />
              <Route path="/materials" element={<Materials />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/timetable" element={<Timetable />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/grades" element={<Grades />} />
              <Route path="/plan" element={<PlanDayOff />} />
              <Route path="/deadlines" element={<Deadlines />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
