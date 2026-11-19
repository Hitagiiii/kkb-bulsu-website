import type { ReactNode } from 'react'
import type { ChipTone } from '../lib/merch'

// Palette only: success pair, error, cream neutrals, brand tint. "amber" keeps its name
// (other files use it) but is now the tiny gold highlight.
const TONES: Record<ChipTone, string> = {
  green: 'bg-success-pale text-success-deep',
  amber: 'bg-gold-100 text-ink',
  red: 'bg-red-100 text-error',
  slate: 'bg-secondary text-body',
  brand: 'bg-brand-100 text-brand-900',
}

export default function Chip({ tone = 'slate', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className={'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ' + TONES[tone]}>{children}</span>
  )
}
