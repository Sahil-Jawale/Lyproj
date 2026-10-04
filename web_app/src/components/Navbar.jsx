import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, ScanLine, ShieldPlus, History, Activity, Menu, X, FileText, Store, LogIn, UserPlus,
  UserRound, LogOut, ShieldCheck,
} from 'lucide-react'
import Logo from './Logo'
import { getHealth } from '../services/api'
import { ROLE_LABEL } from '../services/auth'
import { useAuthStore } from '../store/useAuthStore'

const HOME = { to: '/', label: 'Home', icon: Home }
const INTERACTIONS = { to: '/interactions', label: 'Interactions', icon: ShieldPlus }

// Each stakeholder sees the screens their role can use (Workflow.md §2).
const LINKS = {
  anon:    [HOME, INTERACTIONS],
  doctor:  [HOME,
            { to: '/upload',    label: 'Scan',      icon: ScanLine },
            INTERACTIONS,
            { to: '/history',   label: 'Records',   icon: History },
            { to: '/dashboard', label: 'Dashboard', icon: Activity }],
  patient: [HOME, { to: '/patient', label: 'My prescriptions', icon: FileText }, INTERACTIONS],
  chemist: [HOME, { to: '/pharmacy', label: 'Dispensing', icon: Store }, INTERACTIONS],
}

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { status, user, logout } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [health, setHealth] = useState(null)

  const navLinks = LINKS[status === 'authed' ? user.role : 'anon'] || LINKS.anon
  const showReader = user?.role === 'doctor'
  const signOut = async () => { setMobileOpen(false); await logout(); navigate('/login') }

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
            {showReader && <ReaderBadge health={health} />}
            <div className="ml-3 flex items-center gap-2 border-l border-ink-200 pl-3">
              {status === 'authed'
                ? <UserMenu user={user} onSignOut={signOut} />
                : status === 'anon' && <AuthButtons />}
            </div>
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
            {showReader && <div className="px-1 pt-2"><ReaderBadge health={health} /></div>}
            <div className="mt-2 border-t border-ink-200 pt-3">
              {status === 'authed' ? (
                <>
                  <p className="px-4 pb-2 text-sm">
                    <span className="font-medium text-ink-900">{user.full_name}</span>
                    <span className="text-ink-500"> · {ROLE_LABEL[user.role]}</span>
                  </p>
                  <Link to="/account" onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-ink-600 hover:bg-ink-100">
                    <ShieldCheck size={18} /> Account and security
                  </Link>
                  <button onClick={signOut}
                          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-vital-700 hover:bg-vital-50">
                    <LogOut size={18} /> Sign out
                  </button>
                </>
              ) : status === 'anon' && (
                <div className="flex gap-2 px-1" onClick={() => setMobileOpen(false)}><AuthButtons /></div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}

function AuthButtons() {
  return (
    <>
      <Link to="/login" className="btn-ghost"><LogIn size={16} /> Sign in</Link>
      <Link to="/register" className="btn-primary px-3.5 py-2 text-sm"><UserPlus size={16} /> Create account</Link>
    </>
  )
}

function initials(name = '') {
  return name.replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
}

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-care-50 font-display text-sm font-semibold text-care-800 ring-1 ring-inset ring-care-200">
          {initials(user.full_name)}
        </span>
        <span className="hidden max-w-[9rem] truncate lg:block">{user.full_name}</span>
      </button>
      {open && (
        <div role="menu" className="card-tight absolute right-0 mt-2 w-64 animate-fade-in overflow-hidden p-1.5">
          <div className="border-b border-ink-100 px-3 pb-2.5 pt-1.5">
            <p className="truncate font-medium text-ink-900">{user.full_name}</p>
            <p className="truncate text-xs text-ink-500">
              {ROLE_LABEL[user.role]} · {user.email || user.phone || user.username}
            </p>
          </div>
          <Link to="/account" role="menuitem" onClick={() => setOpen(false)}
                className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-100">
            <UserRound size={16} /> Account and security
            {!user.mfa_enabled && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-500" title="Two-step verification is off" />}
          </Link>
          <button role="menuitem" onClick={onSignOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-vital-700 hover:bg-vital-50">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
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
