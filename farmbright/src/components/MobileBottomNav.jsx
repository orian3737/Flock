import { useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Scale,
  ClipboardList,
  TrendingUp,
  Menu,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Home',     icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Feed',     icon: Scale,           path: '/scale-house' },
  { label: 'Log',      icon: ClipboardList,   path: '/log' },
  { label: 'Costs',    icon: TrendingUp,      path: '/financials' },
  { label: 'More',     icon: Menu,            path: null }, // opens sidebar
]

export default function MobileBottomNav({ onMore }) {
  const location = useLocation()
  const navigate = useNavigate()

  function isActive(path) {
    if (!path) return false
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-[55] bg-[var(--bg-surface)] border-t border-[var(--border)] flex items-stretch"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        height: 'calc(56px + env(safe-area-inset-bottom))',
      }}
      aria-label="Mobile navigation"
    >
      {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
        const active = isActive(path)
        return (
          <button
            key={label}
            type="button"
            onClick={() => (path ? navigate(path) : onMore?.())}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors min-h-[56px] ${
              active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
            }`}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span className="font-mono text-[9px] leading-none">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
