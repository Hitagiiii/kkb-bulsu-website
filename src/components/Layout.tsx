import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasRole, ROLE_LABEL } from '../lib/types'
import { NAV_ITEMS } from '../nav'

export default function Layout() {
  const { profile, session, signOut } = useAuth()
  const items = NAV_ITEMS.filter((i) => !i.minRole || hasRole(profile?.role, i.minRole))
  const name = profile?.full_name || session?.user.email || 'Member'

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-brand-900 text-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between px-5 py-4 md:block md:py-6">
          <div className="font-display text-xl font-bold tracking-tight">KKB BULSU</div>
          <button
            onClick={() => void signOut()}
            className="text-sm text-white/70 hover:text-white md:hidden"
          >
            Sign out
          </button>
        </div>

        <nav
          aria-label="Main"
          className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pb-0"
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                'shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
                (isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-white/10 p-4 md:block">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs text-white/60">{profile ? ROLE_LABEL[profile.role] : ''}</p>
          <button
            onClick={() => void signOut()}
            className="mt-3 text-sm text-white/70 underline-offset-2 hover:text-white hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-10">
        <Outlet />
      </main>
    </div>
  )
}
