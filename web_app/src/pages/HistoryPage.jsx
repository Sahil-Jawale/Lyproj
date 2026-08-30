import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronRight, ScanLine, FileX2, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react'
import { getPrescriptions } from '../services/api'

/**
 * The record shelf.
 *
 * There is deliberately no demo dataset behind this screen. An empty shelf is
 * an honest answer; a shelf of invented patients that looks identical to real
 * records is not — and the previous fixture used field names (`doctor_name`,
 * `confidence`, `medicines[].name`) the API does not return, so it also broke
 * the moment a real record arrived.
 */

const RISK_TONE = {
  none:            'severity-none',
  minor:           'severity-minor',
  moderate:        'severity-moderate',
  severe:          'severity-severe',
  contraindicated: 'severity-contraindicated',
}

export default function HistoryPage() {
  const [prescriptions, setPrescriptions] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getPrescriptions(50)
      .then(setPrescriptions)
      .catch((e) => setError(e?.response?.data?.detail ?? 'Could not reach the PrescriptAI API.'))
      .finally(() => setLoading(false))
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = !q ? prescriptions : prescriptions.filter((rx) =>
    [rx.prescriber_name, rx.patient_name, rx.date, ...(rx.medicines ?? []).map((m) => m.brand ?? m.raw_reading)]
      .filter(Boolean)
      .some((s) => String(s).toLowerCase().includes(q)),
  )

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <header className="mb-8 flex animate-fade-in flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="rule-label text-care-700">Records</span>
          <h1 className="mt-2 font-display text-4xl font-normal text-ink-900">Prescription history</h1>
          <p className="mt-1 text-sm text-ink-600">
            {loading ? 'Loading…' : `${filtered.length} page${filtered.length === 1 ? '' : 's'} on record`}
          </p>
        </div>
        <Link to="/upload" className="btn-primary py-2.5 text-sm"><ScanLine size={16} /> New scan</Link>
      </header>

      <div className="relative mb-6 animate-slide-up">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by prescriber, patient, medicine or date…"
          className="input-field py-3 pl-11"
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 p-8 text-ink-600">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading records…
        </div>
      )}

      {error && (
        <div className="card border-vital-200 bg-vital-50 text-sm text-vital-800">{error}</div>
      )}

      <div className="space-y-3">
        {filtered.map((rx, i) => {
          const risk = rx.interactions?.overall_risk ?? 'none'
          const day = rx.date || (rx.created_at ?? '').slice(0, 10)
          return (
            <Link
              key={rx.id} to={`/results/${rx.id}`}
              className="card-link flex animate-slide-up items-center gap-4"
              style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
            >
              <div className="hidden w-16 shrink-0 flex-col items-center border-r border-dashed border-ink-200 pr-4 sm:flex">
                <span className="data text-2xl font-bold text-care-700">
                  {String(day).split(/[-/]/).pop()?.slice(0, 2) || '—'}
                </span>
                <span className="rule-label mt-0.5">{monthOf(rx)}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900">
                    {rx.prescriber_name || 'Prescriber not read'}
                  </span>
                  {rx.patient_name && <span className="text-sm text-ink-500">· {rx.patient_name}</span>}
                  <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${RISK_TONE[risk] ?? RISK_TONE.none}`}>
                    {risk === 'none' ? 'no interactions' : `${risk} risk`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(rx.medicines ?? []).map((m, j) => (
                    <span key={j} className={`chip ${m.outcome === 'illegible' ? 'border-dashed text-ink-500' : ''}`}>
                      {m.brand ?? (m.outcome === 'illegible' ? 'unreadable line' : m.raw_reading)}
                      {m.dosage && <span className="data text-ink-500">{m.dosage}</span>}
                    </span>
                  ))}
                  {(rx.medicines ?? []).length === 0 && (
                    <span className="chip border-dashed text-ink-500">no medicines reported</span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                  <span className="data">legibility {Math.round((rx.overall_legibility ?? 0) * 100)}%</span>
                  {rx.reviewed
                    ? <span className="inline-flex items-center gap-1 text-care-700"><CheckCircle2 size={12} /> reviewed</span>
                    : <span className="inline-flex items-center gap-1 text-amber-700"><ShieldAlert size={12} /> awaiting review</span>}
                  <span className="sm:hidden">{day}</span>
                </div>
              </div>

              <ChevronRight size={18} className="shrink-0 text-ink-300" />
            </Link>
          )
        })}
      </div>

      {!loading && !error && filtered.length === 0 && (
        <div className="card py-16 text-center">
          <FileX2 size={40} className="mx-auto text-ink-300" />
          <p className="mt-4 font-display text-xl text-ink-800">
            {prescriptions.length === 0 ? 'No prescriptions on record yet' : 'Nothing matches that search'}
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {prescriptions.length === 0
              ? 'Scan a page and it will appear here once it has been read.'
              : 'Try a prescriber, patient, medicine name or date.'}
          </p>
          {prescriptions.length === 0 && (
            <Link to="/upload" className="btn-primary mt-6"><ScanLine size={18} /> Scan a prescription</Link>
          )}
        </div>
      )}
    </div>
  )
}

function monthOf(rx) {
  const raw = rx.created_at ?? rx.date
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en', { month: 'short' })
}
