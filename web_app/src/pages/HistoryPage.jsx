import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Search, ChevronRight, Pill, Eye, Calendar, Filter } from 'lucide-react'
import { getPrescriptions } from '../services/api'

const DEMO_HISTORY = Array.from({ length: 12 }, (_, i) => ({
  id: `hist-${i}`,
  date: `2025-11-${String(25 - i * 2).padStart(2, '0')}`,
  doctor_name: ['Dr. Sharma','Dr. Patel','Dr. Roy','Dr. Das','Dr. Khan'][i % 5],
  confidence: +(0.72 + Math.random() * 0.24).toFixed(3),
  medicines: Array.from({ length: 2 + (i % 3) }, (_, j) => ({
    name: ["Napa","Esoral","Montair","Azithrocin","Fexofast","Rivotril","Ace","Diflu","Baclofen","Metro"][((i * 3) + j) % 10],
    dosage: ["500mg","20mg","10mg","250mg","120mg"][j % 5],
    frequency: ["BD","OD","TDS","1-0-1"][j % 4],
  })),
  status: 'completed',
}))

export default function HistoryPage() {
  const [prescriptions, setPrescriptions] = useState(DEMO_HISTORY)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = await getPrescriptions(30)
        if (data.length > 0) setPrescriptions(data)
      } catch { /* use demo data */ }
      setLoading(false)
    }
    load()
  }, [])

  const filtered = prescriptions.filter(rx =>
    rx.doctor_name.toLowerCase().includes(search.toLowerCase()) ||
    rx.medicines.some(m => m.name.toLowerCase().includes(search.toLowerCase())) ||
    rx.date.includes(search)
  )

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Prescription <span className="gradient-text">History</span></h1>
          <p className="text-dark-400 text-sm">{filtered.length} prescriptions on record</p>
        </div>
        <Link to="/upload" className="btn-primary flex items-center gap-2 text-sm">
          <Pill size={16} /> New Scan
        </Link>
      </div>

      {/* Search */}
      <div className="glass-card mb-6 p-3 animate-slide-up">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by doctor, medicine, or date..."
            className="input-field pl-11 py-2.5" />
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {filtered.map((rx, i) => (
          <Link key={rx.id} to={`/results/${rx.id}`}
            className="glass-card flex items-center gap-4 group animate-slide-up cursor-pointer"
            style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}>
            {/* Date badge */}
            <div className="hidden sm:flex flex-col items-center min-w-[60px]">
              <span className="text-2xl font-bold gradient-text">{rx.date.split('-')[2]}</span>
              <span className="text-[10px] uppercase tracking-wider text-dark-400">
                {new Date(rx.date + 'T00:00:00').toLocaleString('en', { month: 'short' })}
              </span>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-16 bg-dark-700" />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-white">{rx.doctor_name}</span>
                <span className="text-xs text-dark-500 sm:hidden">{rx.date}</span>
                <span className="ml-auto text-xs font-mono text-primary-400">{Math.round(rx.confidence * 100)}%</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {rx.medicines.map((m, j) => (
                  <span key={j} className="text-xs px-2 py-0.5 rounded-md bg-dark-800/80 text-dark-300 border border-dark-700">
                    {m.name} {m.dosage}
                  </span>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <ChevronRight size={18} className="text-dark-500 group-hover:text-primary-400 transition-colors flex-shrink-0" />
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-dark-400">
          <Clock size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">No prescriptions found</p>
          <p className="text-sm mt-1">Upload your first prescription to get started</p>
        </div>
      )}
    </div>
  )
}
