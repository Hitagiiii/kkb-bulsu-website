import type { ReactNode } from 'react'
import { eyebrowClass } from './ui'

/** Eyebrow label, regular-weight title, muted subtitle, optional action on the right. */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-5">
      <div className="min-w-0">
        {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
        <h1 className="font-display mt-1 text-[28px] leading-tight font-medium tracking-tight text-ink sm:text-[40px]">
          {title}
        </h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
