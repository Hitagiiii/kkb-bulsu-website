/** Small ring showing how much of a budget is used. */
export default function ProgressRing({ pct, over, size = 56 }: { pct: number; over?: boolean; size?: number }) {
  const r = 22
  const c = 2 * Math.PI * r
  const shown = Math.max(0, Math.min(100, pct))
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" role="img" aria-label={`${Math.round(shown)}% used`} className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-umber" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - shown / 100)}
        transform="rotate(-90 28 28)"
        className={over ? 'text-brand-700' : 'text-brand-700'}
      />
      <text x="28" y="32.5" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-ink">
        {Math.round(shown)}%
      </text>
    </svg>
  )
}
