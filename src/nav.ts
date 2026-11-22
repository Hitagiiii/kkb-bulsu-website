import { hasRole, type Role } from './lib/types'

export interface NavItem {
  to: string
  label: string
  description: string
  /** This role or higher */
  minRole?: Role
  /** Exactly this role and no other */
  onlyRole?: Role
  end?: boolean
  accent?: 'maroon' | 'orange' | 'teal' | 'gold' | 'plum'
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', description: 'Your overview', end: true, accent: 'maroon' },
  { to: '/announcements', label: 'Announcements', description: 'News and notices from the officers', accent: 'maroon' },
  { to: '/events', label: 'Events', description: 'Calendar, RSVP, meeting places and call links', accent: 'orange' },
  { to: '/polls', label: 'Polls', description: 'Vote on organization decisions', accent: 'plum' },
  { to: '/attendance', label: 'Attendance', description: 'Events you attended, and reports for officers', accent: 'teal' },
  { to: '/merch', label: 'Merch', description: 'Order shirts, ID laces and pins, and track pickup', end: true, accent: 'gold' },
  { to: '/documents', label: 'Documents', description: 'Forms, templates and organization files', accent: 'teal' },
  { to: '/minutes', label: 'Minutes', description: 'Meeting notes and decisions', accent: 'teal' },
  { to: '/tasks', label: 'Tasks', description: 'Action items for officers', minRole: 'officer', accent: 'orange' },
  { to: '/finance', label: 'Finance', description: 'Budgets, expenses and receipts', onlyRole: 'treasurer', accent: 'gold' },
  { to: '/merch/manage', label: 'Merch orders', description: 'Verify payments and hand over orders', onlyRole: 'treasurer', accent: 'gold' },
  { to: '/members', label: 'Members', description: 'Approve sign-ups and set roles', minRole: 'admin', accent: 'maroon' },
]

export function canSeeNav(item: NavItem, role: Role | null | undefined): boolean {
  if (item.onlyRole) return role === item.onlyRole
  return !item.minRole || hasRole(role, item.minRole)
}
