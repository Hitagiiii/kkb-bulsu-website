type Tone = 'default' | 'good' | 'warn' | 'bad'

const TONES: Record<Tone, string> = {
  default: 'text-ink',
  good: 'text-brand-800',
  warn: 'text-amber-800',
  bad: 'text-red-700',
}

export default function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  className = '',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: Tone
  className?: string
}) {
  return (
    <div className={'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ' + className}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={'font-display mt-1 text-2xl font-semibold tabular-nums break-words ' + TONES[tone]}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
