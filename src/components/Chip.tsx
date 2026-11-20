import type { ReactNode } from 'react'
import type { ChipTone } from '../lib/merch'

// Status pills. Brand/red use the soft maroon tint, green the quiet success pair, gold is the one tiny signal.
const TONES: Record<ChipTone, string> = {
  green: 'bg-success-pale text-success-deep',
  amber: 'bg-gold-100 text-[#6b5320]',
  red: 'bg-soft text-accent',
  slate: 'bg-secondary text-muted',
  brand: 'bg-soft text-accent',
}

export default function Chip({ tone = 'slate', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className={'inline-block rounded-md px-2 py-0.5 text-xs font-semibold ' + TONES[tone]}>{children}</span>
  )
}
