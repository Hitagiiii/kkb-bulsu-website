export type Role = 'member' | 'officer' | 'treasurer' | 'admin'

export interface Profile {
  id: string
  full_name: string
  student_no: string | null
  role: Role
  approved: boolean
  created_at: string
}

export const ROLE_RANK: Record<Role, number> = {
  member: 0,
  officer: 1,
  treasurer: 2,
  admin: 3,
}

export const ROLE_LABEL: Record<Role, string> = {
  member: 'Member',
  officer: 'Officer',
  treasurer: 'Treasurer',
  admin: 'Admin',
}

export function hasRole(role: Role | undefined | null, min: Role): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min]
}
