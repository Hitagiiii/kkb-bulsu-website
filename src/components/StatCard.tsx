type Tone = 'default' | 'good' | 'warn' | 'bad'

const TONES: Record<Tone, string> = {
  default: 'text-ink',
  good: 'text-success-deep',
  warn: 'text-accent',
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
    <div className={'rounded-md border border-line bg-white p-4 ' + className}>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</p>
      <p className={'mt-1 text-2xl font-semibold tabular-nums break-words ' + TONES[tone]}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}
