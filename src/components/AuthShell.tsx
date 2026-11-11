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
      <div className="hidden bg-brand-900 p-12 text-white md:flex md:flex-col md:justify-between">
        <div className="font-display text-2xl font-bold tracking-tight">KKB BULSU</div>
        <div>
          <p className="font-display max-w-sm text-4xl leading-tight font-semibold">
            One place for announcements, events and the organization's funds.
          </p>
          <div className="mt-6 h-1 w-16 bg-gold-400" />
        </div>
        <p className="text-sm text-white/60">Members only. New accounts are approved by an officer.</p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="font-display mb-8 text-xl font-bold text-brand-800 md:hidden">KKB BULSU</div>
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  )
}
