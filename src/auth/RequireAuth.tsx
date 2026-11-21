import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { hasRole, type Role } from '../lib/types'
import FullScreenMessage from '../components/FullScreenMessage'

/**
 * Guards a group of routes.
 *  - not logged in        -> /login
 *  - logged in, unapproved -> /pending
 *  - approved but paused   -> /deactivated
 *  - role too low          -> back to Home
 *  - onlyRole: exactly this role, nobody above or below
 */
export default function RequireAuth({ minRole, onlyRole }: { minRole?: Role; onlyRole?: Role }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenMessage text="Loading…" />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile || !profile.approved) return <Navigate to="/pending" replace />
  if (profile.deactivated_at) return <Navigate to="/deactivated" replace />
  if (minRole && !hasRole(profile.role, minRole)) return <Navigate to="/" replace />
  if (onlyRole && profile.role !== onlyRole) return <Navigate to="/" replace />

  return <Outlet />
}
