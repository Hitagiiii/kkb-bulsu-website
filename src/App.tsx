import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import RequireAuth from './auth/RequireAuth'
import Layout from './components/Layout'
import Announcements from './pages/Announcements'
import BudgetDetail from './pages/BudgetDetail'
import Dashboard from './pages/Dashboard'
import Events from './pages/Events'
import Finance from './pages/Finance'
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
              <Route path="announcements" element={<Announcements />} />
              <Route path="events" element={<Events />} />
              <Route
                path="polls"
                element={<Placeholder title="Polls" description="Vote on organization decisions." />}
              />
              <Route
                path="chat"
                element={<Placeholder title="Chat rooms" description="Talk with other members." />}
              />

              {/* Officers, treasurer and admin can view. Only treasurer and admin can edit (enforced by the database). */}
              <Route element={<RequireAuth minRole="officer" />}>
                <Route path="finance" element={<Finance />} />
                <Route path="finance/:budgetId" element={<BudgetDetail />} />
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
