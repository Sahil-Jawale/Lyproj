import { Outlet, Link } from 'react-router-dom'
import Navbar from './Navbar'
import MedicalBackdrop from './MedicalBackdrop'

export default function Layout() {
  return (
    <div className="relative min-h-screen bg-paper">
      <MedicalBackdrop />
      <Navbar />
      <main className="relative z-10 pb-16 pt-24">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="relative z-10 border-t border-ink-200 bg-white/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>
          <span className="font-display text-sm font-semibold text-ink-800">PrescriptAI</span>
          {' '}— decision support only. Every reading is verified by a clinician before use.
        </p>
        <div className="flex items-center gap-4">
          <Link to="/upload" className="hover:text-care-700">Scan</Link>
          <Link to="/interactions" className="hover:text-care-700">Interactions</Link>
          <Link to="/history" className="hover:text-care-700">Records</Link>
        </div>
      </div>
    </footer>
  )
}
