import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-dark-900">
      {/* Ambient background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-600/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/3 -left-40 w-96 h-96 bg-accent-600/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-primary-500/5 rounded-full blur-[100px]" />
      </div>
      <Navbar />
      <main className="relative z-10 pt-20 pb-12">
        <Outlet />
      </main>
    </div>
  )
}
