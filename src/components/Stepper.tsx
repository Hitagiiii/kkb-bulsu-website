import { CheckIcon } from './Icons'

/**
 * Order status: Ordered, Paid, Arrived, Claimed.
 * Only completed steps use maroon; the current step is outlined, the rest stay quiet.
 */
export default function Stepper({
  steps,
  done,
  label = 'Order status',
}: {
  steps: string[]
  /** How many steps are complete (0 to steps.length) */
  done: number
  label?: string
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</p>
      <ol className="mt-3 flex items-start">
        {steps.map((s, i) => {
          const complete = i < done
          const current = i === done
          return (
            <li key={s} className="relative flex flex-1 flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={'absolute top-3 right-1/2 h-px w-full ' + (i <= done ? 'bg-brand-700' : 'bg-line')}
                />
              )}
              <span
                className={
                  'relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ' +
                  (complete
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : current
                      ? 'border-brand-700 bg-white text-brand-700'
                      : 'border-line bg-white text-muted')
                }
              >
                {complete ? <CheckIcon size={13} /> : i + 1}
              </span>
              <span className={'mt-1.5 text-xs ' + (complete || current ? 'font-semibold text-ink' : 'text-muted')}>{s}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
