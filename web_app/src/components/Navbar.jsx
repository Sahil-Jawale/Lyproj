import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, ScanLine, ShieldPlus, History, Activity, Menu, X } from 'lucide-react'
import Logo from './Logo'
import { getHealth } from '../services/api'

const navLinks = [
  { to: '/',             label: 'Home',         icon: Home },
  { to: '/upload',       label: 'Scan',         icon: ScanLine },
  { to: '/interactions', label: 'Interactions', icon: ShieldPlus },
  { to: '/history',      label: 'Records',      icon: History },
  { to: '/dashboard',    label: 'Dashboard',    icon: Activity },
]

export default function Navbar() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [health, setHealth] = useState(null)

  // The reader in use is worth showing: a demo running on the mock reader and
  // one running on the live model look identical otherwise, and confusing the
  // two is how a cached fixture gets mistaken for a real read.
  useEffect(() => { getHealth().then(setHealth).catch(() => setHealth(false)) }, [])

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-ink-200 bg-white/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <Logo />
            <span className="leading-tight">
              <span className="block font-display text-lg font-semibold text-ink-900">PrescriptAI</span>
              <span className="hidden text-[10px] uppercase tracking-[0.16em] text-ink-500 sm:block">
                Prescription Intelligence
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to
              return (
                <Link
                  key={to} to={to}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-care-50 text-care-800 ring-1 ring-inset ring-care-200'
                      : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              )
            })}
            <ReaderBadge health={health} />
          </div>

          <button
            className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="animate-fade-in border-t border-ink-200 bg-white md:hidden">
          <div className="space-y-1 px-4 py-3">
            {navLinks.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to
              return (
                <Link
                  key={to} to={to} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${
                    active ? 'bg-care-50 text-care-800' : 'text-ink-600 hover:bg-ink-100'
                  }`}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              )
            })}
            <div className="px-1 pt-2"><ReaderBadge health={health} /></div>
          </div>
        </div>
      )}
    </nav>
  )
}

function ReaderBadge({ health }) {
  if (health === null) return null
  if (health === false) {
    return (
      <span className="ml-2 chip border-vital-200 bg-vital-50 text-vital-800">
        <span className="h-1.5 w-1.5 rounded-full bg-vital-500" />
        API offline
      </span>
    )
  }
  const live = health.reader !== 'mock'
  return (
    <span
      className={`ml-2 chip ${live ? 'border-care-200 bg-care-50 text-care-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
      title={live ? `Live reader · $${health.spend_usd?.toFixed(2)} of $${health.spend_cap_usd?.toFixed(2)} spent` : 'Mock reader — no model calls, no cost'}
    >
      <span className={`h-1.5 w-1.5 rounded-full animate-vitals ${live ? 'bg-care-600' : 'bg-amber-500'}`} />
      {live ? 'Live reader' : 'Mock reader'}
    </span>
  )
}
