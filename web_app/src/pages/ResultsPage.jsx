import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { CheckCircle2, AlertTriangle, XCircle, ChevronRight, Shield, Copy, Check, Pill, Clock, FileText } from 'lucide-react'

function ConfidenceMeter({ value }) {
  const pct = Math.round(value * 100)
  const color = pct >= 85 ? 'text-green-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'
  const bg = pct >= 85 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono font-medium ${color}`}>{pct}%</span>
    </div>
  )
}

function MedicineCard({ med, index }) {
  return (
    <div className="glass-card animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">
            {index + 1}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{med.name}</h3>
            {med.was_corrected && (
              <p className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle size={12} /> Corrected from "{med.original_name}"
              </p>
            )}
          </div>
        </div>
        <ConfidenceMeter value={med.confidence} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {[
          { label: 'Dosage', value: med.dosage, icon: Pill },
          { label: 'Frequency', value: med.frequency_expanded || med.frequency, icon: Clock },
          { label: 'Duration', value: med.duration, icon: FileText },
          { label: 'Instructions', value: med.instructions, icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-dark-800/50 rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} className="text-dark-400" />
              <span className="text-[10px] uppercase tracking-wider text-dark-400">{label}</span>
            </div>
            <span className="text-sm font-medium text-dark-200">{value || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ResultsPage() {
  const { id } = useParams()
  const { currentResult } = useAppStore()
  const [copied, setCopied] = useState(false)
  const result = currentResult

  // Demo fallback
  const data = result || {
    id: id || 'demo',
    raw_text: 'Napa 500mg BD | Esoral 20mg OD | Montair 10mg OD',
    confidence: 0.847,
    medicines: [
      { name: 'Napa', dosage: '500mg', frequency: 'BD', duration: '7 days', instructions: 'After meal', confidence: 0.92, match_score: 100, was_corrected: false, frequency_expanded: 'Twice daily' },
      { name: 'Esoral', dosage: '20mg', frequency: 'OD', duration: '14 days', instructions: 'Before meal', confidence: 0.88, match_score: 100, was_corrected: false, frequency_expanded: 'Once daily' },
      { name: 'Montair', dosage: '10mg', frequency: 'OD', duration: '10 days', instructions: 'At bedtime', confidence: 0.74, match_score: 95.2, was_corrected: true, original_name: 'Montiar', frequency_expanded: 'Once daily' },
    ],
    patient_name: 'Patient',
    doctor_name: 'Dr. Physician',
    date: new Date().toISOString().split('T')[0],
    processed_at: new Date().toISOString(),
    status: 'completed',
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const avgConfidence = data.medicines.length > 0
    ? data.medicines.reduce((s, m) => s + m.confidence, 0) / data.medicines.length
    : 0

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">OCR <span className="gradient-text">Results</span></h1>
          <p className="text-dark-400 text-sm">Prescription processed on {data.date}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleCopy} className="btn-secondary flex items-center gap-2 text-sm px-4 py-2">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
          <Link to="/interactions" state={{ medicines: data.medicines.map(m => m.name) }}
            className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
            <Shield size={16} /> Check Interactions
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 animate-slide-up">
        <div className="stat-card">
          <span className="text-xs text-dark-400 uppercase tracking-wider">Medicines</span>
          <span className="text-2xl font-bold gradient-text">{data.medicines.length}</span>
        </div>
        <div className="stat-card">
          <span className="text-xs text-dark-400 uppercase tracking-wider">Avg Confidence</span>
          <span className="text-2xl font-bold text-white">{Math.round(avgConfidence * 100)}%</span>
        </div>
        <div className="stat-card">
          <span className="text-xs text-dark-400 uppercase tracking-wider">Doctor</span>
          <span className="text-sm font-medium text-dark-200 truncate">{data.doctor_name}</span>
        </div>
        <div className="stat-card">
          <span className="text-xs text-dark-400 uppercase tracking-wider">Status</span>
          <span className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
            <CheckCircle2 size={16} /> Completed
          </span>
        </div>
      </div>

      {/* Raw Text */}
      <div className="glass-card mb-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <h3 className="text-sm font-medium text-dark-400 uppercase tracking-wider mb-3">Raw OCR Output</h3>
        <div className="bg-dark-800/50 rounded-xl p-4 font-mono text-sm text-dark-200 leading-relaxed">
          {data.raw_text}
        </div>
      </div>

      {/* Medicine Cards */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Extracted Medicines</h2>
        <div className="space-y-4">
          {data.medicines.map((med, i) => (
            <MedicineCard key={i} med={med} index={i} />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 animate-slide-up">
        <Link to="/upload" className="btn-secondary flex-1 flex items-center justify-center gap-2">
          Scan Another Prescription
        </Link>
        <Link to="/interactions" state={{ medicines: data.medicines.map(m => m.name) }}
          className="btn-primary flex-1 flex items-center justify-center gap-2">
          <Shield size={18} /> Check Drug Interactions <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  )
}
