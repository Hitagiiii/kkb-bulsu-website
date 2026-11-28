import type { ReactNode } from 'react'
import type { ChipTone } from '../lib/merch'

// Status pills. Green/teal use the quiet success pair, amber/orange is the time-sensitive signal,
// red/brand use the soft maroon tint, slate is a neutral metadata chip.
const TONES: Record<ChipTone, string> = {
  green: 'bg-success-pale text-success-deep',
  amber: 'bg-accent-100 text-accent-700',
  red: 'bg-soft text-brand-700',
  slate: 'bg-surface-sunken text-muted',
  brand: 'bg-soft text-brand-700',
}

export default function Chip({ tone = 'slate', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className={'inline-block rounded-md px-2 py-0.5 text-xs font-semibold ' + TONES[tone]}>{children}</span>
  )
}
