import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL } from '../lib/types'
import { timeUntil } from '../lib/announcements'
import { useUpcoming } from '../lib/useUpcoming'
import { canSeeNav, NAV_ITEMS } from '../nav'
import NavIcon from './NavIcon'
import NotificationsMenu from './NotificationsMenu'
import { useNotifications } from '../lib/useNotifications'

const STORAGE_KEY = 'kkb.sidebar.collapsed'
const HELP_EMAIL = 'membership@kkbbulsu.org'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Breadcrumb label for the current route */
function pageLabel(pathname: string): string {
  if (pathname === '/account') return 'Account settings'
  const exact = NAV_ITEMS.find((i) => i.to === pathname)
  if (exact) return exact.label === 'Home' ? 'Home' : exact.label
  const parent = [...NAV_ITEMS].filter((i) => i.to !== '/').sort((a, b) => b.to.length - a.to.length).find((i) => pathname.startsWith(i.to + '/'))
  return parent ? parent.label : 'Home'
}

export default function Layout() {
  const { profile, session, signOut } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed) // desktop: 64px rail
  const [drawerOpen, setDrawerOpen] = useState(false) // phone: drawer slides over the page
  const { upcoming, dismiss, permission, enableAlerts } = useUpcoming()
  const notifications = useNotifications(profile?.id)

  const items = NAV_ITEMS.filter((i) => canSeeNav(i, profile?.role))
  const name = profile?.full_name || session?.user.email || 'Member'
  const role = profile ? ROLE_LABEL[profile.role] : 'Member'
  const next = upcoming[0]
  const badgeFor = (to: string) =>
    to === '/announcements'
      ? upcoming.filter((u) => u.source === 'announcement').length
      : to === '/events'
        ? upcoming.filter((u) => u.source === 'event').length
        : 0

  function setCollapsedAndRemember(value: boolean) {
    setCollapsed(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      // storage can be blocked; the menu still works for this visit
    }
  }

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const navLinkClass = (isActive: boolean, rail: boolean) =>
    'group relative flex items-center rounded-md text-sm transition-colors ' +
    (rail ? 'md:justify-center md:px-0 md:py-2.5 ' : '') +
    'gap-3 px-3 py-3 md:py-2 ' +
    (isActive ? 'bg-white/15 font-semibold text-white ring-1 ring-inset ring-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white')

  return (
    <div className="min-h-screen md:flex">
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-ink/40 md:hidden print:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside
        id="sidebar"
        className={
          'fixed inset-y-0 left-0 z-40 flex w-80 max-w-[90vw] flex-col overflow-y-auto border-r border-brand-900 bg-brand-900 text-white ' +
          'transition-[transform,visibility] duration-200 motion-reduce:transition-none ' +
          (drawerOpen ? 'translate-x-0 ' : '-translate-x-full max-md:invisible ') +
          'md:sticky md:top-0 md:bottom-auto md:h-screen md:max-w-none md:shrink-0 md:translate-x-0 ' +
          (collapsed ? 'md:w-16 ' : 'md:w-64 ') +
          'print:hidden'
        }
      >
        <div className={'px-5 pt-6 pb-4 ' + (collapsed ? 'md:px-0' : '')}>
          <div className={'flex items-start justify-between gap-2 ' + (collapsed ? 'md:flex-col md:items-center' : '')}>
            <div className={collapsed ? 'md:text-center' : ''}>
              <p className="text-base font-bold tracking-tight text-white">
                <span className={collapsed ? 'md:hidden' : ''}>KKB BULSU</span>
                {collapsed && <span className="hidden md:inline">KKB</span>}
              </p>
              <p className={'mt-0.5 text-[10px] tracking-[0.06em] text-white/60 uppercase ' + (collapsed ? 'md:hidden' : '')}>
                Bulacan State University
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCollapsedAndRemember(!collapsed)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/25 text-white/80 transition-colors hover:bg-white/10 hover:text-white md:flex"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={collapsed ? 'rotate-180' : ''}>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16M15 10l-2 2 2 2" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="-mt-1 rounded-md px-2 py-1 text-sm text-white/80 hover:bg-white/10 hover:text-white md:hidden"
            >
              Close ×
            </button>
          </div>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) => navLinkClass(isActive, collapsed)}
            >
              {collapsed && (
                <span className="hidden md:block">
                  <NavIcon to={item.to} />
                </span>
              )}
              <span className={'flex-1 ' + (collapsed ? 'md:sr-only' : '')}>{item.label}</span>
              {badgeFor(item.to) > 0 && (
                <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
                  {badgeFor(item.to)}
                  <span className="sr-only"> starting within 24 hours</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={'mt-6 border-t border-white/20 p-4 ' + (collapsed ? 'md:px-2 md:text-center' : '')}>
          <p className={'text-[10px] tracking-[0.06em] text-white/60 uppercase ' + (collapsed ? 'md:hidden' : '')}>AY 2026–2027</p>
          <Link to="/account" onClick={() => setDrawerOpen(false)} title="Account settings" className={'mt-1 block rounded-md px-2 py-2 hover:bg-white/10 ' + (collapsed ? 'md:py-2' : '')}>
            <span className={'block truncate text-sm font-semibold text-white ' + (collapsed ? 'md:hidden' : '')}>{name}</span>
            <span className={'block text-xs text-white/65 ' + (collapsed ? 'md:hidden' : '')}>{role} · Account settings</span>
            {collapsed && <span className="hidden text-xs font-semibold text-ink md:block">{name.slice(0, 1).toUpperCase()}</span>}
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 py-1 text-sm text-white/70 underline-offset-2 hover:text-white hover:underline"
          >
            {collapsed ? <span className="hidden md:inline">↩</span> : null}
            <span className={collapsed ? 'md:sr-only' : ''}>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden print:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-controls="sidebar"
            className="-ml-2 px-2 py-1 text-sm font-semibold text-brand-700"
          >
            Menu
          </button>
          <span className="text-base font-bold tracking-tight text-brand-900">KKB BULSU</span>
          <NotificationsMenu data={notifications} permission={permission} enableAlerts={enableAlerts} />
        </header>

        {/* Desktop utility bar: breadcrumb on the left, account context on the right. */}
        <div className="hidden items-center justify-between border-b border-line px-10 py-4 text-xs text-muted md:flex print:hidden">
          <p>
            Members portal <span className="mx-1.5">/</span>
            <span className="text-ink">{pageLabel(location.pathname)}</span>
          </p>
          <div className="flex items-center gap-4">
            <NotificationsMenu data={notifications} permission={permission} enableAlerts={enableAlerts} />
            <a href={`mailto:${HELP_EMAIL}`} className="hover:text-ink hover:underline">Help</a>
            <span className="text-line">|</span>
            <span className="font-semibold tracking-tight text-brand-700">KKB BULSU</span>
            <span>{role}</span>
          </div>
        </div>

        {next && (
          <div
            role="status"
            className="mt-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-white px-4 py-2.5 text-xs text-brand-700 sm:px-6 md:px-10 print:hidden"
          >
            <p className="min-w-0 break-words">
              <span className="font-semibold tracking-[0.06em] uppercase">Up next</span>
              <span className="mx-2">·</span>
              <span>
                {next.title} starts {timeUntil(next.at)}
              </span>
            </p>
            <p className="flex items-center gap-4">
              <Link to={next.to} className="font-semibold hover:underline">
                View event →
              </Link>
              <button type="button" onClick={() => dismiss(next)} className="py-1 hover:underline">
                Dismiss
              </button>
            </p>
          </div>
        )}

        <main className="px-4 py-7 sm:px-6 md:px-8 md:py-9 lg:px-10 print:p-0"><div className="mx-auto w-full max-w-[1440px]">
          <Outlet />
        </div></main>
      </div>
    </div>
  )
}
