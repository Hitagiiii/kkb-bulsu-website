export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Task {
  id: string
  title: string
  description: string | null
  due_on: string | null
  status: TaskStatus
  assigned_to: string | null
  minutes_id: string | null
  created_at: string
  completed_at: string | null
}

export interface MinutesRow {
  id: string
  title: string
  held_at: string
  attendees: string
  body: string
  visible_to_members: boolean
  author_name: string
  created_at: string
}

export interface Officer {
  id: string
  full_name: string
}

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Done' }
