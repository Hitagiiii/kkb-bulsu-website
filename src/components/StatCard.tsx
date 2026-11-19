type Tone = 'default' | 'good' | 'warn' | 'bad'

const TONES: Record<Tone, string> = {
  default: 'text-ink',
  good: 'text-success-deep',
  warn: 'text-brand-700',
  bad: 'text-error',
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
    <div className={'rounded-md border border-hairline bg-white p-3 ' + className}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={'font-display mt-0.5 text-2xl font-bold tabular-nums break-words ' + TONES[tone]}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
