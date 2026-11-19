import type { ReactNode } from 'react'

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden bg-brand-700 px-10 py-12 text-white md:flex md:min-h-screen md:flex-col md:justify-between lg:px-14">
        <div className="font-display text-2xl font-bold tracking-tight">KKB BULSU</div>
        <p className="max-w-sm text-sm leading-relaxed text-white/90">
          Your organization, connected in one place.
        </p>
        <p className="text-xs text-white/75">Members only. New accounts are approved by an officer.</p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 md:px-10">
        <div className="w-full max-w-sm">
          <div className="font-display mb-7 text-xl font-bold tracking-tight text-brand-700 md:hidden">KKB BULSU</div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-slate-600">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  )
}
