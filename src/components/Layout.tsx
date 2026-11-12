import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasRole, ROLE_LABEL } from '../lib/types'
import { formatEventTime, timeUntil } from '../lib/announcements'
import { useUpcoming } from '../lib/useUpcoming'
import { NAV_ITEMS } from '../nav'

const STORAGE_KEY = 'kkb.sidebar.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const MenuIcon = () => (
  <svg {...iconProps}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)
const CloseIcon = () => (
  <svg {...iconProps}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
const ChevronLeftIcon = () => (
  <svg {...iconProps}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
)

export default function Layout() {
  const { profile, session, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(readCollapsed) // desktop: sidebar hidden
  const [drawerOpen, setDrawerOpen] = useState(false) // phone: sidebar slides over the page
  const { upcoming, dismiss, permission, enableAlerts } = useUpcoming()

  const items = NAV_ITEMS.filter((i) => !i.minRole || hasRole(profile?.role, i.minRole))
  const name = profile?.full_name || session?.user.email || 'Member'

  function setCollapsedAndRemember(value: boolean) {
    setCollapsed(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      // storage can be blocked; the menu still works for this visit
    }
  }

  function openMenu() {
    if (window.matchMedia('(min-width: 768px)').matches) setCollapsedAndRemember(false)
    else setDrawerOpen(true)
  }

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="min-h-screen md:flex">
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden print:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="sidebar"
        className={
          'fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-brand-900 text-white ' +
          'transition-[transform,visibility] duration-200 motion-reduce:transition-none ' +
          (drawerOpen ? 'translate-x-0 ' : '-translate-x-full max-md:invisible ') +
          'md:sticky md:top-0 md:bottom-auto md:h-screen md:w-64 md:max-w-none md:shrink-0 md:translate-x-0 ' +
          (collapsed ? 'md:hidden ' : '') +
          'print:hidden'
        }
      >
        <div className="flex items-center justify-between px-5 py-5">
          <span className="font-display text-xl font-bold tracking-tight">KKB BULSU</span>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white md:hidden"
          >
            <CloseIcon />
          </button>
          <button
            type="button"
            onClick={() => setCollapsedAndRemember(true)}
            aria-label="Hide menu"
            className="hidden rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white md:block"
          >
            <ChevronLeftIcon />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                'flex items-center justify-between rounded-md px-3 py-3 text-base font-medium transition-colors md:py-2 md:text-sm ' +
                (isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white')
              }
            >
              {item.label}
              {item.to === '/announcements' && upcoming.length > 0 && (
                <span className="rounded-full bg-gold-400 px-2 py-0.5 text-xs font-semibold text-brand-900">
                  {upcoming.length}
                  <span className="sr-only"> events starting within 24 hours</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs text-white/60">{profile ? ROLE_LABEL[profile.role] : ''}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 py-1 text-sm text-white/70 underline-offset-2 hover:text-white hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header
          className={
            'sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-3 py-2 backdrop-blur print:hidden ' +
            (collapsed ? '' : 'md:hidden')
          }
        >
          <button
            type="button"
            onClick={openMenu}
            aria-label="Open menu"
            aria-controls="sidebar"
            className="rounded-md p-2 text-brand-800 hover:bg-slate-100"
          >
            <MenuIcon />
          </button>
          <span className="font-display text-lg font-bold text-brand-800">KKB BULSU</span>
        </header>

        {upcoming.length > 0 && (
          <div
            role="status"
            className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-6 md:px-10 print:hidden"
          >
            <ul className="space-y-2">
              {upcoming.map((u) => (
                <li key={`${u.id}@${u.event_at}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 break-words">
                    <strong>Starts {u.event_at ? timeUntil(u.event_at) : 'soon'}:</strong>{' '}
                    <Link to="/announcements" className="underline underline-offset-2">
                      {u.title}
                    </Link>
                    {u.event_at && <span className="text-amber-900/80"> ({formatEventTime(u.event_at)})</span>}
                  </span>
                  <button type="button" onClick={() => dismiss(u)} className="py-1 underline underline-offset-2">
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
            {permission === 'default' && (
              <button type="button" onClick={() => void enableAlerts()} className="mt-2 py-1 underline underline-offset-2">
                Turn on device alerts
              </button>
            )}
          </div>
        )}

        <main className="px-4 py-6 sm:px-6 md:px-10 md:py-10 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
