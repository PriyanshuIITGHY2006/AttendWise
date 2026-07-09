import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AuthProvider } from "./context/AuthContext"
import { ProtectedRoute } from "./components/layout/ProtectedRoute"
import { AppLayout } from "./components/layout/AppLayout"
import { Login } from "./pages/Login"
import { SignUp } from "./pages/SignUp"
import { Dashboard } from "./pages/Dashboard"
import { Courses } from "./pages/Courses"
import { NewCourse } from "./pages/NewCourse"
import { EditCourse } from "./pages/EditCourse"
import { CourseDetail } from "./pages/CourseDetail"
import { Materials } from "./pages/Materials"
import { Calendar } from "./pages/Calendar"
import { Settings } from "./pages/Settings"

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/courses/new" element={<NewCourse />} />
              <Route path="/courses/:courseId" element={<CourseDetail />} />
              <Route path="/courses/:courseId/edit" element={<EditCourse />} />
              <Route path="/materials" element={<Materials />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
