export interface Poll {
  id: string
  question: string
  closes_at: string | null
  created_by: string
  created_at: string
}

export interface PollOption {
  id: string
  poll_id: string
  label: string
  position: number
}

export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 6

export function isClosed(p: Pick<Poll, 'closes_at'>, now: number): boolean {
  return !!p.closes_at && new Date(p.closes_at).getTime() <= now
}
