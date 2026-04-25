import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Shield, Plus, X, AlertTriangle, CheckCircle2, AlertOctagon, Search, Loader2, Info } from 'lucide-react'
import { checkInteractions } from '../services/api'
import { useAppStore } from '../store/useAppStore'

const BD_MEDICINES = [
  "Beklo","Maxima","Leptic","Esoral","Omastin","Esonix","Canazole","Fixal",
  "Progut","Diflu","Montair","Flexilax","Maxpro","Vifas","Conaz","Fexofast",
  "Fenadin","Telfast","Dinafex","Ritch","Renova","Flugal","Axodin","Sergel",
  "Nexum","Opton","Nexcap","Fexo","Montex","Exium","Lumona","Napa",
  "Azithrocin","Atrizin","Monas","Nidazyl","Metsina","Baclon","Rozith",
  "Bicozin","Ace","Amodis","Alatrol","Napa Extend","Rivotril","Montene",
  "Filmet","Aceta","Tamen","Bacmax","Disopan","Rhinil","Flamyd","Metro",
  "Zithrin","Candinil","Lucan-R","Backtone","Bacaid","Etizin","Az",
  "Romycin","Azyth","Cetisoft","Dancel","Tridosil","Nizoder","Ketoral",
  "Ketocon","Ketotab","Ketozol","Denixil","Provair","Odmon","Baclofen",
  "MKast","Trilock","Flexibac"
]

const SEVERITY_CONFIG = {
  none: { icon: CheckCircle2, label: 'No Interaction', bg: 'severity-none', color: 'text-green-400' },
  minor: { icon: Info, label: 'Minor', bg: 'severity-minor', color: 'text-lime-400' },
  moderate: { icon: AlertTriangle, label: 'Moderate', bg: 'severity-moderate', color: 'text-amber-400' },
  severe: { icon: AlertOctagon, label: 'Severe', bg: 'severity-severe', color: 'text-red-400' },
  contraindicated: { icon: AlertOctagon, label: 'Contraindicated', bg: 'severity-contraindicated', color: 'text-red-500' },
}

// Local interaction data for demo mode
const LOCAL_INTERACTIONS = [
  { drug_a:'Napa', drug_b:'Ace', severity:'minor', severity_color:'#a3e635', description:'Both contain paracetamol/acetaminophen — risk of overdose if combined' },
  { drug_a:'Napa', drug_b:'Aceta', severity:'minor', severity_color:'#a3e635', description:'Duplicate paracetamol — do not combine' },
  { drug_a:'Rivotril', drug_b:'Baclofen', severity:'severe', severity_color:'#ef4444', description:'CNS depression — combined sedation risk' },
  { drug_a:'Rivotril', drug_b:'Etizin', severity:'severe', severity_color:'#ef4444', description:'Both benzodiazepines — respiratory depression risk' },
  { drug_a:'Esoral', drug_b:'Maxpro', severity:'minor', severity_color:'#a3e635', description:'Both are proton pump inhibitors — no benefit from combining' },
  { drug_a:'Napa', drug_b:'Metro', severity:'moderate', severity_color:'#f59e0b', description:'Paracetamol + metronidazole — hepatotoxicity risk' },
  { drug_a:'Fexofast', drug_b:'Fexo', severity:'minor', severity_color:'#a3e635', description:'Same active ingredient (fexofenadine) — duplicate therapy' },
  { drug_a:'Montair', drug_b:'Monas', severity:'minor', severity_color:'#a3e635', description:'Both contain montelukast — duplicate therapy' },
  { drug_a:'Baclofen', drug_b:'Flexilax', severity:'moderate', severity_color:'#f59e0b', description:'Both muscle relaxants — excessive sedation' },
  { drug_a:'Atrizin', drug_b:'Cetisoft', severity:'minor', severity_color:'#a3e635', description:'Both contain cetirizine — duplicate antihistamine' },
]

function localCheck(medicines) {
  const meds = medicines.map(m => m.toLowerCase())
  const found = []
  for (const int of LOCAL_INTERACTIONS) {
    const a = int.drug_a.toLowerCase(), b = int.drug_b.toLowerCase()
    if (meds.includes(a) && meds.includes(b)) found.push(int)
  }
  const hasSevere = found.some(i => i.severity === 'severe' || i.severity === 'contraindicated')
  const hasMod = found.some(i => i.severity === 'moderate')
  return {
    interactions: found, total_count: found.length,
    overall_risk: hasSevere ? 'severe' : hasMod ? 'moderate' : found.length ? 'minor' : 'none',
    has_severe: hasSevere, has_moderate: hasMod, medicines_checked: medicines,
  }
}

export default function InteractionsPage() {
  const location = useLocation()
  const { selectedMedicines, addMedicine, removeMedicine, clearMedicines } = useAppStore()
  const [search, setSearch] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    if (location.state?.medicines) {
      clearMedicines()
      location.state.medicines.forEach(m => addMedicine(m))
    }
  }, [])

  const filteredMeds = BD_MEDICINES.filter(m =>
    m.toLowerCase().includes(search.toLowerCase()) && !selectedMedicines.includes(m)
  )

  const handleCheck = async () => {
    if (selectedMedicines.length < 2) return
    setLoading(true)
    try {
      const data = await checkInteractions(selectedMedicines)
      setResult(data)
    } catch {
      setResult(localCheck(selectedMedicines))
    } finally {
      setLoading(false)
    }
  }

  const addAndClear = (med) => { addMedicine(med); setSearch(''); setShowSuggestions(false) }

  const overallConfig = result ? SEVERITY_CONFIG[result.overall_risk] || SEVERITY_CONFIG.none : null

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-10 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
          Drug <span className="gradient-text">Interaction Checker</span>
        </h1>
        <p className="text-dark-400">Add medicines to check for dangerous interactions</p>
      </div>

      {/* Medicine Input */}
      <div className="glass-card mb-6 animate-slide-up">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            type="text" value={search} placeholder="Search and add medicines..."
            className="input-field pl-11"
            onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
          />
          {showSuggestions && search && filteredMeds.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 glass rounded-xl overflow-hidden z-20 max-h-48 overflow-y-auto">
              {filteredMeds.slice(0, 10).map(m => (
                <button key={m} onClick={() => addAndClear(m)}
                  className="w-full text-left px-4 py-2.5 text-sm text-dark-200 hover:bg-white/5 transition-colors flex items-center gap-2">
                  <Plus size={14} className="text-primary-400" /> {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected medicines */}
        {selectedMedicines.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {selectedMedicines.map(m => (
              <span key={m} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500/10 text-primary-300 text-sm border border-primary-500/20">
                {m}
                <button onClick={() => removeMedicine(m)} className="hover:text-red-400 transition-colors">
                  <X size={14} />
                </button>
              </span>
            ))}
            <button onClick={clearMedicines} className="text-xs text-dark-400 hover:text-red-400 px-2 py-1.5 transition-colors">
              Clear all
            </button>
          </div>
        )}

        <button onClick={handleCheck} disabled={selectedMedicines.length < 2 || loading}
          className="btn-primary w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? <><Loader2 size={18} className="animate-spin" /> Checking...</>
            : <><Shield size={18} /> Check Interactions ({selectedMedicines.length} medicines)</>}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="animate-slide-up space-y-4">
          {/* Overall risk */}
          <div className={`glass-card border ${overallConfig?.bg || 'severity-none'}`}>
            <div className="flex items-center gap-3">
              {overallConfig && <overallConfig.icon size={24} className={overallConfig.color} />}
              <div>
                <h3 className={`text-lg font-semibold ${overallConfig?.color}`}>
                  {result.total_count === 0 ? 'No Interactions Found' : `${result.total_count} Interaction${result.total_count > 1 ? 's' : ''} Detected`}
                </h3>
                <p className="text-sm text-dark-400">
                  Overall risk level: <span className={`font-medium ${overallConfig?.color}`}>{result.overall_risk.toUpperCase()}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Interaction cards */}
          {result.interactions.map((int, i) => {
            const cfg = SEVERITY_CONFIG[int.severity] || SEVERITY_CONFIG.none
            const Icon = cfg.icon
            return (
              <div key={i} className={`glass-card border ${cfg.bg} animate-slide-up`} style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="flex items-start gap-4">
                  <div className="mt-0.5">
                    <Icon size={22} className={cfg.color} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white">{int.drug_a}</span>
                      <span className="text-dark-500">×</span>
                      <span className="font-semibold text-white">{int.drug_b}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.bg} font-medium`}>{cfg.label}</span>
                    </div>
                    <p className="text-sm text-dark-300">{int.description}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Quick add presets */}
      {!result && selectedMedicines.length === 0 && (
        <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <p className="text-sm text-dark-400 mb-3">Quick test combinations:</p>
          <div className="flex flex-wrap gap-2">
            {[
              ['Napa', 'Ace'],
              ['Rivotril', 'Baclofen'],
              ['Napa', 'Metro', 'Esoral'],
              ['Fexofast', 'Fexo', 'Atrizin'],
            ].map((combo, i) => (
              <button key={i} onClick={() => { clearMedicines(); combo.forEach(m => addMedicine(m)) }}
                className="btn-secondary text-xs px-3 py-1.5">
                {combo.join(' + ')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
