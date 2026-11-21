import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import RequireAuth from './auth/RequireAuth'
import Layout from './components/Layout'
import Account from './pages/Account'
import Announcements from './pages/Announcements'
import Attendance from './pages/Attendance'
import BudgetDetail from './pages/BudgetDetail'
import CheckIn from './pages/CheckIn'
import Dashboard from './pages/Dashboard'
import Documents from './pages/Documents'
import Events from './pages/Events'
import Finance from './pages/Finance'
import Deactivated from './pages/Deactivated'
import ForgotPassword from './pages/ForgotPassword'
import Login from './pages/Login'
import Members from './pages/Members'
import Merch from './pages/Merch'
import MerchManage from './pages/MerchManage'
import Minutes from './pages/Minutes'
import Pending from './pages/Pending'
import Polls from './pages/Polls'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import Tasks from './pages/Tasks'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/deactivated" element={<Deactivated />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Everything below needs an approved account */}
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="events" element={<Events />} />
              <Route path="attend/:token" element={<CheckIn />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="polls" element={<Polls />} />
              <Route path="merch" element={<Merch />} />
              <Route path="documents" element={<Documents />} />
              <Route path="minutes" element={<Minutes />} />
              <Route path="account" element={<Account />} />

              {/* Officers, treasurer and admin */}
              <Route element={<RequireAuth minRole="officer" />}>
                <Route path="tasks" element={<Tasks />} />
              </Route>

              {/* Finance role (treasurer) only. Enforced by the database too. */}
              <Route element={<RequireAuth onlyRole="treasurer" />}>
                <Route path="merch/manage" element={<MerchManage />} />
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
