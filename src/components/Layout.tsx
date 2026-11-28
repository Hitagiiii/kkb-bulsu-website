import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL } from '../lib/types'
import { timeUntil } from '../lib/announcements'
import { useUpcoming } from '../lib/useUpcoming'
import { canSeeNav, NAV_ITEMS } from '../nav'
import NavIcon from './NavIcon'
import NotificationsMenu from './NotificationsMenu'
import { useNotifications } from '../lib/useNotifications'
import { useTheme } from '../theme/useTheme'

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

function ThemeToggle({ theme, toggle }: { theme: 'light' | 'dark'; toggle: () => void }) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      title={theme === 'light' ? 'Dark mode' : 'Light mode'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink"
    >
      {theme === 'light' ? (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx={12} cy={12} r={5} />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      )}
    </button>
  )
}

export default function Layout() {
  const { profile, session, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { upcoming, dismiss, permission, enableAlerts } = useUpcoming()
  const notifications = useNotifications(profile?.id)
  const { theme, toggle } = useTheme()

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
    'gap-3 px-3 py-3 md:py-2 hover:bg-sidebar-hover hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-sidebar-ink ' +
    (isActive
      ? 'bg-sidebar-active font-semibold text-sidebar-ink ring-1 ring-inset ring-sidebar-border before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:bg-sidebar-indicator'
      : 'text-sidebar-muted')

  return (
    <div className="min-h-screen bg-bg md:flex">
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-ink/40 md:hidden print:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside
        id="sidebar"
        className={
          'fixed inset-y-0 left-0 z-40 flex w-80 max-w-[90vw] flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar-bg text-sidebar-ink ' +
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
              <p className="flex items-center gap-2 text-base font-bold tracking-tight text-sidebar-ink">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-sidebar-active font-num text-[10px] font-semibold text-sidebar-ink">KKB</span>
                <span className={collapsed ? 'md:hidden' : ''}>KKB BULSU</span>
              </p>
              <p className={'mt-1 text-[10px] tracking-[0.06em] text-sidebar-muted uppercase ' + (collapsed ? 'md:hidden' : '')}>
                Bulacan State University
              </p>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle theme={theme} toggle={toggle} />
              <button
                type="button"
                onClick={() => setCollapsedAndRemember(!collapsed)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink md:flex"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={collapsed ? 'rotate-180' : ''}>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16M15 10l-2 2 2 2" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="-mt-1 rounded-md px-2 py-1 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink md:hidden" title="Close menu"
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
              <span className="shrink-0 text-sidebar-muted">
                <NavIcon to={item.to} />
              </span>
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

        <div className={'mt-6 border-t border-sidebar-border p-4 ' + (collapsed ? 'md:px-2 md:text-center' : '')}>
          <p className={'text-[10px] tracking-[0.06em] text-sidebar-muted uppercase ' + (collapsed ? 'md:hidden' : '')}>AY 2026–2027</p>
          <Link to="/account" onClick={() => setDrawerOpen(false)} title="Account settings" className={'mt-1 block rounded-md px-2 py-2 hover:bg-surface/10 ' + (collapsed ? 'md:py-2' : '')}>
            <span className={'block truncate text-sm font-semibold text-sidebar-ink ' + (collapsed ? 'md:hidden' : '')}>{name}</span>
            <span className={'block text-xs text-sidebar-muted ' + (collapsed ? 'md:hidden' : '')}>{role}</span>
            {collapsed && <span className="hidden text-xs font-semibold text-sidebar-ink md:block">{name.slice(0, 1).toUpperCase()}</span>}
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 inline-flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-sidebar-ink"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></svg>
            <span className={collapsed ? 'md:sr-only' : ''}>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden print:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-controls="sidebar"
            className="-ml-2 px-2 py-1 text-sm font-semibold text-brand-700"
          >
            Menu
          </button>
          <span className="flex items-center gap-2 text-base font-bold tracking-tight text-ink"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-sidebar-active font-num text-[10px] font-semibold text-sidebar-ink">KKB</span>KKB BULSU</span>
          <NotificationsMenu data={notifications} permission={permission} enableAlerts={enableAlerts} />
        </header>

        <div className="hidden items-center justify-between border-b border-border bg-surface px-10 py-4 text-xs text-muted md:flex print:hidden">
          <p>
            Members portal <span className="mx-1.5 text-border">/</span>
            <span className="text-ink">{pageLabel(location.pathname)}</span>
          </p>
          <div className="flex items-center gap-4">
            <NotificationsMenu data={notifications} permission={permission} enableAlerts={enableAlerts} />
            <a href={`mailto:${HELP_EMAIL}`} className="hover:text-ink hover:underline">Help</a>
            <span className="text-border">|</span>
            <span className="font-semibold tracking-tight text-brand-700">KKB BULSU</span>
            <span>{role}</span>
          </div>
        </div>

        {next && (
          <div
            role="status"
            className="mt-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-surface px-4 py-2.5 text-xs text-brand-700 sm:px-6 md:px-10 print:hidden"
          >
            <p className="min-w-0 break-words">
              <span className="font-semibold tracking-[0.06em] uppercase"><span aria-hidden="true" className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-gold align-middle" />Up next</span>
              <span className="mx-2 text-muted">·</span>
              <span>
                {next.title} starts {timeUntil(next.at)}
              </span>
            </p>
            <p className="flex items-center gap-4">
              <Link to={next.to} className="font-semibold hover:underline">
                View event →
              </Link>
              <button type="button" onClick={() => dismiss(next)} className="py-1 text-muted hover:text-ink hover:underline">
                Dismiss
              </button>
            </p>
          </div>
        )}

        <main className="px-4 py-4 sm:px-6 md:px-8 md:py-6 lg:px-10 print:p-0"><div className="mx-auto w-full max-w-[1440px]">
          {location.pathname !== '/' && (
            <div className="mb-5 flex items-center">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-surface-sunken hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-700"
                aria-label="Go back to the previous page"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>
          )}
          <Outlet />
        </div></main>
      </div>
    </div>
  )
}
