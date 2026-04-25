import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Activity, Upload, History, BarChart3, Shield, Menu, X } from 'lucide-react'

const navLinks = [
  { to: '/', label: 'Home', icon: Activity },
  { to: '/upload', label: 'Scan', icon: Upload },
  { to: '/interactions', label: 'Interactions', icon: Shield },
  { to: '/history', label: 'History', icon: History },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
]

export default function Navbar() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center shadow-lg shadow-primary-500/20 group-hover:shadow-primary-500/40 transition-shadow">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-accent-500 rounded-full border-2 border-dark-900 animate-pulse" />
            </div>
            <div>
              <span className="text-lg font-bold gradient-text">MedScript</span>
              <span className="hidden sm:block text-[10px] text-dark-400 -mt-1 tracking-wider uppercase">AI Prescription Intelligence</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to
              return (
                <Link key={to} to={to}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-primary-600/20 text-primary-400 shadow-sm shadow-primary-500/10'
                      : 'text-dark-300 hover:text-dark-100 hover:bg-white/5'
                  }`}>
                  <Icon size={16} />
                  {label}
                </Link>
              )
            })}
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden p-2 text-dark-300 hover:text-white" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden glass border-t border-white/5 animate-fade-in">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to
              return (
                <Link key={to} to={to} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    active ? 'bg-primary-600/20 text-primary-400' : 'text-dark-300 hover:bg-white/5'
                  }`}>
                  <Icon size={18} />
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </nav>
  )
}
