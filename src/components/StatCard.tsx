type Tone = 'default' | 'good' | 'warn' | 'bad'

const TONES: Record<Tone, string> = {
  default: 'text-brand-900',
  good: 'text-brand-700',
  warn: 'text-brand-700',
  bad: 'text-brand-900',
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
    <div className={'rounded-md border border-line border-t-4 border-t-brand-100 bg-white p-5 sm:p-6 ' + className}>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</p>
      <p className={'mt-1 text-2xl font-semibold tracking-tight tabular-nums break-words sm:text-3xl ' + TONES[tone]}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}
