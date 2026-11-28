import type { ReactNode } from 'react'
import { eyebrowClass } from './ui'

/** Members-only screens. The auth surface stays compact and centered on a brand background. */
export default function AuthShell({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-brand-900 px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex min-h-[calc(100vh-2.5rem)] items-center justify-center sm:min-h-[calc(100vh-3rem)]">
        <main className="w-full max-w-md rounded-md border border-white/15 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-700 font-num text-[11px] font-semibold text-white">KKB</span>
            <div>
              <p className="text-sm font-bold tracking-tight text-brand-900">KKB BULSU</p>
              <p className="text-[10px] uppercase tracking-[0.06em] text-muted">Bulacan State University</p>
            </div>
          </div>

          <section>
            <p className={eyebrowClass}>Members only / KKB BULSU</p>
            <h2 className="font-display mt-2 text-[26px] leading-[1.08] font-semibold tracking-tight text-ink sm:text-[30px]">
              More than an organization,
              <br />
              Your people on campus
            </h2>
            <p className="mt-2 text-sm leading-5 text-muted">
              Connect with the KKB BULSU community.
              <br />
              Show up, lend a hand,
              <br />
              and make your university years count.
            </p>
          </section>

          <section className="mt-5 border-t border-line pt-4">
            <h1 className="font-display text-xl leading-tight font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm leading-5 text-muted">{subtitle}</p>}
            <div className="mt-3">{children}</div>
          </section>

          {aside}
        </main>
      </div>
    </div>
  )
}
