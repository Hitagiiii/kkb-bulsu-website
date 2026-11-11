import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { hasRole, ROLE_LABEL } from '../lib/types'
import { NAV_ITEMS } from '../nav'

export default function Dashboard() {
  const { profile } = useAuth()
  const firstName = profile?.full_name.split(' ')[0] || 'there'
  const links = NAV_ITEMS.filter(
    (i) => i.to !== '/' && (!i.minRole || hasRole(profile?.role, i.minRole)),
  )

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl font-semibold">Hello, {firstName}</h1>
      <p className="mt-2 text-slate-600">
        You're signed in as {profile ? ROLE_LABEL[profile.role].toLowerCase() : 'a member'}.
      </p>

      <ul className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
        {links.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="flex items-baseline justify-between gap-4 py-4 transition-colors hover:text-brand-700"
            >
              <span className="font-display text-lg font-semibold">{item.label}</span>
              <span className="text-right text-sm text-slate-500">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
