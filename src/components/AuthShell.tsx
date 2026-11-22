import type { ReactNode } from 'react'
import { eyebrowClass } from './ui'

/**
 * Members-only screens. Desktop: brand story and photo on the left, a quiet single-column form on the right.
 * Phone: the form only, under a slim top bar.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  /** Extra content under the form, e.g. a "new here?" block */
  aside?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between border-b border-line bg-white px-5 py-4 sm:px-8">
        <span className="text-base font-bold tracking-tight text-brand-700">KKB BULSU</span>
        <span className="text-xs text-muted">
          <span className="hidden sm:inline">Bulacan State University · </span>Members portal
        </span>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 sm:px-8 md:grid-cols-2 md:items-center md:gap-12 md:py-8">
        <section className="hidden md:block">
          <img
            src="/images/community.jpg"
            alt="KKB BULSU members chatting on campus"
            className="aspect-[4/3] w-full rounded-md object-cover"
          />
          <h2 className="font-display mt-5 text-[36px] leading-[1.08] font-medium tracking-tight text-ink">
            More than an organization,
            <br />
            Your people on campus
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
            Connect with the KKB BULSU community.
            <br />
            Show up, lend a hand,
            <br />
            and make your university years count.
          </p>
          <p className={eyebrowClass + ' mt-4'}>Malolos, Bulacan / AY 2026–2027</p>
        </section>

        <main className="w-full max-w-lg md:justify-self-start">
          <p className={eyebrowClass}>Members only / KKB BULSU</p>
          <h1 className="font-display mt-2 text-[28px] leading-tight font-medium tracking-tight sm:text-[32px]">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-4">{children}</div>
          {aside}
        </main>
      </div>
    </div>
  )
}
