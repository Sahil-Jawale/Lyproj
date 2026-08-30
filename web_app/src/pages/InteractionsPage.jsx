import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ShieldPlus, Plus, X, AlertTriangle, CheckCircle2, AlertOctagon,
  Search, Loader2, Info, BookMarked,
} from 'lucide-react'
import { checkInteractions } from '../services/api'
import { useAppStore } from '../store/useAppStore'
import { DDI_DRUGS, SAMPLE_COMBOS } from '../data/ddiDrugs'

/**
 * Manual interaction lookup, by GENERIC name.
 *
 * This screen bypasses the reading pipeline entirely — the caller asserts the
 * names are right. It answers from the same cited graph the prescription flow
 * uses, and when the API cannot be reached it says so. There is no local
 * fallback table: a safety verdict invented by the browser is indistinguishable
 * on screen from one backed by a citation, and that is exactly the confusion
 * this product exists to prevent.
 */

const SEVERITY = {
  none:            { icon: CheckCircle2, label: 'No interaction', cls: 'severity-none' },
  minor:           { icon: Info,         label: 'Minor',          cls: 'severity-minor' },
  moderate:        { icon: AlertTriangle,label: 'Moderate',       cls: 'severity-moderate' },
  severe:          { icon: AlertOctagon, label: 'Severe',         cls: 'severity-severe' },
  contraindicated: { icon: AlertOctagon, label: 'Contraindicated',cls: 'severity-contraindicated' },
}

export default function InteractionsPage() {
  const location = useLocation()
  const { selectedMedicines, addMedicine, removeMedicine, clearMedicines } = useAppStore()
  const [search, setSearch] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (location.state?.medicines) {
      clearMedicines()
      location.state.medicines.forEach(addMedicine)
    }
  }, [])

  useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return DDI_DRUGS
      .filter((d) => d.toLowerCase().includes(q) && !selectedMedicines.includes(d))
      .slice(0, 8)
  }, [search, selectedMedicines])

  const run = async () => {
    if (selectedMedicines.length < 2) return
    setLoading(true); setError(null)
    try {
      setResult(await checkInteractions(selectedMedicines))
    } catch (e) {
      setResult(null)
      setError(e?.response?.data?.detail
        ?? 'Could not reach the interaction graph. No verdict is shown, because none was computed.')
    } finally { setLoading(false) }
  }

  const pick = (m) => { addMedicine(m); setSearch(''); setOpen(false) }
  const overall = result ? (SEVERITY[result.overall_risk] ?? SEVERITY.none) : null

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <header className="mb-8 animate-fade-in">
        <span className="rule-label text-care-700">Manual lookup</span>
        <h1 className="mt-2 font-display text-4xl font-normal text-ink-900">Interaction checker</h1>
        <p className="mt-2 max-w-2xl text-ink-600">
          Screen two or more drugs against {DDI_DRUGS.length} generics and 180 cited pairwise rules.
          Enter <strong>generic names</strong> — this screen does not resolve brands, which is what
          the prescription pipeline is for.
        </p>
      </header>

      <div className="card mb-6 animate-slide-up">
        <div className="relative" ref={boxRef}>
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text" value={search} placeholder="Add a generic — warfarin, digoxin, sildenafil…"
            className="input-field pl-11"
            onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { e.preventDefault(); pick(matches[0]) } }}
          />
          {open && search && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-60 overflow-y-auto rounded-xl border border-ink-200 bg-white py-1 shadow-clinical-lg">
              {matches.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-500">
                  “{search}” is not on any edge of the interaction graph — nothing to screen it against.
                </p>
              ) : matches.map((m) => (
                <button key={m} onClick={() => pick(m)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink-800 transition-colors hover:bg-care-50">
                  <Plus size={14} className="text-care-600" /> {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedMedicines.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {selectedMedicines.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 rounded-lg border border-care-200 bg-care-50 px-3 py-1.5 text-sm font-medium text-care-800">
                {m}
                <button onClick={() => removeMedicine(m)} className="text-care-600 transition-colors hover:text-vital-600"
                        aria-label={`Remove ${m}`}>
                  <X size={14} />
                </button>
              </span>
            ))}
            <button onClick={() => { clearMedicines(); setResult(null) }} className="btn-ghost text-xs">
              Clear all
            </button>
          </div>
        )}

        <button onClick={run} disabled={selectedMedicines.length < 2 || loading}
                className="btn-primary mt-5 w-full">
          {loading
            ? <><Loader2 size={18} className="animate-spin" /> Screening…</>
            : <><ShieldPlus size={18} /> Screen {selectedMedicines.length || 'these'} drug{selectedMedicines.length === 1 ? '' : 's'}</>}
        </button>
        {selectedMedicines.length < 2 && (
          <p className="mt-2 text-center text-xs text-ink-500">Add at least two drugs to screen a pair.</p>
        )}
      </div>

      {error && (
        <div className="card mb-6 flex items-start gap-3 border-vital-200 bg-vital-50 text-sm text-vital-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">No verdict.</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {result && (
        <div className="animate-slide-up space-y-4">
          <div className={`card border ${overall.cls}`}>
            <div className="flex items-center gap-3">
              <overall.icon size={26} className="shrink-0" />
              <div>
                <h2 className="font-display text-xl font-semibold">
                  {result.total_count === 0
                    ? 'No known interaction between these drugs'
                    : `${result.total_count} interaction${result.total_count > 1 ? 's' : ''} found`}
                </h2>
                <p className="text-sm opacity-90">
                  Overall risk: <strong className="uppercase">{result.overall_risk}</strong> ·
                  screened {result.medicines_checked?.length ?? selectedMedicines.length} drugs
                </p>
              </div>
            </div>
            {result.total_count === 0 && (
              <p className="mt-3 border-t border-current/15 pt-3 text-sm opacity-90">
                “No known interaction” means no rule in this graph covers the pair — not that the
                combination is safe. The graph is built around high-risk combinations, so a quiet
                answer on routine outpatient drugs is the expected one.
              </p>
            )}
          </div>

          {result.interactions?.map((it, i) => {
            const cfg = SEVERITY[it.severity] ?? SEVERITY.none
            return (
              <article key={i} className={`card animate-slide-up border ${cfg.cls}`}
                       style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="flex items-start gap-3">
                  <cfg.icon size={20} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-semibold text-ink-900">{it.drug_a}</span>
                      <span className="text-ink-400">+</span>
                      <span className="font-display text-lg font-semibold text-ink-900">{it.drug_b}</span>
                      <span className="ml-auto rounded-full border border-current px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        {cfg.label}
                      </span>
                    </div>
                    {it.effect && <p className="mt-2 text-sm text-ink-800">{it.effect}</p>}
                    {it.mechanism && <p className="mt-1 text-xs text-ink-600">Mechanism: {it.mechanism}</p>}
                    {it.safer_alternative && (
                      <p className="mt-2 inline-flex rounded-lg bg-white/70 px-3 py-1.5 text-sm font-medium text-care-800">
                        Safer alternative: {it.safer_alternative}
                      </p>
                    )}
                    {/* The citation is what makes this usable by a clinician. */}
                    {it.reference && (
                      <p className="mt-3 flex items-start gap-1.5 border-t border-ink-200/70 pt-2 text-[11px] italic leading-snug text-ink-500">
                        <BookMarked size={12} className="mt-0.5 shrink-0" />{it.reference}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            )
          })}

          {result.skipped?.length > 0 && (
            <div className="card border-amber-200 bg-amber-50 text-sm text-amber-900">
              <strong>Not screened ({result.skipped.length}):</strong>
              <ul className="mt-1 list-disc pl-5">{result.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {!result && !error && selectedMedicines.length === 0 && (
        <div className="animate-slide-up" style={{ animationDelay: '.15s' }}>
          <p className="rule-label mb-3">Combinations that do fire</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_COMBOS.map((combo, i) => (
              <button key={i}
                      onClick={() => { clearMedicines(); combo.forEach(addMedicine); setResult(null); setError(null) }}
                      className="btn-secondary px-3.5 py-2 text-xs">
                {combo.join(' + ')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
