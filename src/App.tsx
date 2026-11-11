import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import RequireAuth from './auth/RequireAuth'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Members from './pages/Members'
import Pending from './pages/Pending'
import Placeholder from './pages/Placeholder'
import Register from './pages/Register'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/pending" element={<Pending />} />

          {/* Everything below needs an approved account */}
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route
                path="announcements"
                element={<Placeholder title="Announcements" description="News and notices from the officers." />}
              />
              <Route
                path="events"
                element={<Placeholder title="Events" description="Calendar, meeting places and call links." />}
              />
              <Route
                path="polls"
                element={<Placeholder title="Polls" description="Vote on organization decisions." />}
              />
              <Route
                path="chat"
                element={<Placeholder title="Chat rooms" description="Talk with other members." />}
              />

              {/* Officers, treasurer and admin */}
              <Route element={<RequireAuth minRole="officer" />}>
                <Route
                  path="finance"
                  element={<Placeholder title="Finance" description="Budgets, expenses and receipts." />}
                />
              </Route>

              {/* Admin only */}
              <Route element={<RequireAuth minRole="admin" />}>
                <Route path="members" element={<Members />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
