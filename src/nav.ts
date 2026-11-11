import type { Role } from './lib/types'

export interface NavItem {
  to: string
  label: string
  description: string
  minRole?: Role
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', description: 'Your overview', end: true },
  { to: '/announcements', label: 'Announcements', description: 'News and notices from the officers' },
  { to: '/events', label: 'Events', description: 'Calendar, meeting places and call links' },
  { to: '/polls', label: 'Polls', description: 'Vote on organization decisions' },
  { to: '/chat', label: 'Chat rooms', description: 'Talk with other members' },
  { to: '/finance', label: 'Finance', description: 'Budgets, expenses and receipts', minRole: 'officer' },
  { to: '/members', label: 'Members', description: 'Approve sign-ups and set roles', minRole: 'admin' },
]
