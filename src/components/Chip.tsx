import type { ReactNode } from 'react'
import type { ChipTone } from '../lib/merch'

const TONES: Record<ChipTone, string> = {
  green: 'bg-emerald-100 text-emerald-900',
  amber: 'bg-amber-200 text-amber-950',
  red: 'bg-red-100 text-red-800',
  slate: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-100 text-brand-900',
}

export default function Chip({ tone = 'slate', children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className={'inline-block rounded-full px-2 py-0.5 text-xs font-medium ' + TONES[tone]}>{children}</span>
  )
}
