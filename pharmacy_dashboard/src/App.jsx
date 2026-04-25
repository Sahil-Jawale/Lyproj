import { useState } from 'react'
import { ClipboardList, CheckCircle2, BarChart3, Pill, Menu, X, Search, AlertTriangle, Eye, ChevronRight, Clock, Filter, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

/* ─── Demo Data ─────────────────────────────────────────────────────── */
const QUEUE = Array.from({ length: 8 }, (_, i) => ({
  id: `RX-${1001 + i}`,
  patient: ['Rahim Ahmed','Fatima Begum','Karim Hossain','Nasreen Akter','Jamal Uddin','Shakila Khatun','Rafi Islam','Mitu Das'][i],
  doctor: ['Dr. Sharma','Dr. Patel','Dr. Roy','Dr. Das','Dr. Khan'][i % 5],
  time: `${9 + Math.floor(i / 2)}:${i % 2 === 0 ? '15' : '45'} AM`,
  medicines: [
    [{ name:'Napa', dosage:'500mg', freq:'BD' }, { name:'Esoral', dosage:'20mg', freq:'OD' }],
    [{ name:'Azithrocin', dosage:'250mg', freq:'OD' }, { name:'Montair', dosage:'10mg', freq:'OD' }, { name:'Fexofast', dosage:'120mg', freq:'BD' }],
    [{ name:'Rivotril', dosage:'0.5mg', freq:'OD' }, { name:'Baclofen', dosage:'10mg', freq:'TDS' }],
    [{ name:'Metro', dosage:'400mg', freq:'TDS' }, { name:'Napa', dosage:'500mg', freq:'BD' }],
    [{ name:'Ace', dosage:'500mg', freq:'SOS' }, { name:'Maxpro', dosage:'20mg', freq:'OD' }],
    [{ name:'Diflu', dosage:'150mg', freq:'OD' }],
    [{ name:'Atrizin', dosage:'10mg', freq:'OD' }, { name:'Montair', dosage:'10mg', freq:'OD' }],
    [{ name:'Flamyd', dosage:'400mg', freq:'TDS' }, { name:'Napa', dosage:'500mg', freq:'BD' }, { name:'Esoral', dosage:'20mg', freq:'OD' }],
  ][i],
  confidence: +(0.72 + Math.random() * 0.24).toFixed(2),
  status: i < 2 ? 'verified' : i < 4 ? 'reviewing' : 'pending',
  hasInteraction: i === 2,
}))

const dailyStats = [
  { hour:'9AM', count:3 },{ hour:'10AM', count:5 },{ hour:'11AM', count:8 },
  { hour:'12PM', count:6 },{ hour:'1PM', count:2 },{ hour:'2PM', count:7 },
  { hour:'3PM', count:9 },{ hour:'4PM', count:4 },
]
const statusDist = [
  { name:'Verified', value:45, color:'#22c55e' },
  { name:'Reviewing', value:12, color:'#f59e0b' },
  { name:'Pending', value:8, color:'#64748b' },
  { name:'Flagged', value:3, color:'#ef4444' },
]

const statusColors = { verified:'text-green-400 bg-green-500/10 border-green-500/20', reviewing:'text-amber-400 bg-amber-500/10 border-amber-500/20', pending:'text-dark-400 bg-dark-700/50 border-dark-600' }

/* ─── Sidebar ───────────────────────────────────────────────────────── */
const TABS = [
  { id:'queue', label:'Prescription Queue', icon:ClipboardList },
  { id:'verify', label:'Verification', icon:CheckCircle2 },
  { id:'analytics', label:'Analytics', icon:BarChart3 },
  { id:'medicines', label:'Medicine DB', icon:Pill },
]

function Sidebar({ active, setActive, collapsed, toggle }) {
  return (
    <aside className={`fixed left-0 top-0 h-full z-40 glass border-r border-white/5 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}>
      <div className="flex items-center gap-3 p-4 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">P</div>
        {!collapsed && <div><span className="text-sm font-bold gradient-text">Pharmacy</span><p className="text-[10px] text-dark-400">MedScript Dashboard</p></div>}
        <button onClick={toggle} className="ml-auto text-dark-400 hover:text-white p-1">{collapsed ? <Menu size={18}/> : <X size={18}/>}</button>
      </div>
      <nav className="p-2 space-y-1 mt-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActive(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              active === id ? 'bg-primary-600/20 text-primary-400' : 'text-dark-400 hover:text-dark-200 hover:bg-white/5'
            }`}>
            <Icon size={18} />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  )
}

/* ─── Queue Page ────────────────────────────────────────────────────── */
function QueuePage({ onSelect }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? QUEUE : QUEUE.filter(q => q.status === filter)
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="text-2xl font-bold text-white">Prescription Queue</h2><p className="text-sm text-dark-400">{QUEUE.length} prescriptions today</p></div>
        <div className="flex gap-2">
          {['all','pending','reviewing','verified'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter===f ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30' : 'text-dark-400 hover:bg-white/5'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {filtered.map((rx, i) => (
          <div key={rx.id} onClick={() => onSelect(rx)}
            className="glass-card flex items-center gap-4 cursor-pointer group" style={{ animationDelay:`${i*0.05}s` }}>
            <div className="w-12 h-12 rounded-xl bg-dark-800/80 flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary-400">{rx.id}</span>
              <span className="text-[10px] text-dark-500">{rx.time}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-white">{rx.patient}</span>
                {rx.hasInteraction && <AlertTriangle size={14} className="text-red-400" />}
              </div>
              <div className="flex flex-wrap gap-1">
                {rx.medicines.map((m, j) => (
                  <span key={j} className="text-[11px] px-1.5 py-0.5 rounded bg-dark-800/80 text-dark-300">{m.name} {m.dosage}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`text-[11px] px-2 py-1 rounded-lg border capitalize font-medium ${statusColors[rx.status]}`}>{rx.status}</span>
              <span className="text-xs font-mono text-dark-400">{Math.round(rx.confidence * 100)}%</span>
              <ChevronRight size={16} className="text-dark-600 group-hover:text-primary-400 transition-colors" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Verification Page ─────────────────────────────────────────────── */
function VerifyPage({ rx }) {
  const data = rx || QUEUE[2]
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Verification Panel</h2>
      <p className="text-sm text-dark-400 mb-6">Review and verify prescription {data.id}</p>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Image placeholder */}
        <div className="glass-card flex items-center justify-center min-h-[300px]">
          <div className="text-center">
            <Eye size={48} className="mx-auto text-dark-600 mb-3" />
            <p className="text-dark-400 text-sm">Prescription Image</p>
            <p className="text-dark-500 text-xs mt-1">{data.id} — {data.patient}</p>
          </div>
        </div>
        {/* Right: Extracted data */}
        <div className="space-y-4">
          <div className="glass-card">
            <h3 className="text-sm font-medium text-dark-400 uppercase tracking-wider mb-3">Patient Info</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-dark-500 text-xs">Patient</span><p className="text-white font-medium">{data.patient}</p></div>
              <div><span className="text-dark-500 text-xs">Doctor</span><p className="text-white font-medium">{data.doctor}</p></div>
              <div><span className="text-dark-500 text-xs">Time</span><p className="text-dark-200">{data.time}</p></div>
              <div><span className="text-dark-500 text-xs">Confidence</span><p className="text-primary-400 font-mono">{Math.round(data.confidence * 100)}%</p></div>
            </div>
          </div>
          <div className="glass-card">
            <h3 className="text-sm font-medium text-dark-400 uppercase tracking-wider mb-3">Extracted Medicines</h3>
            <div className="space-y-2">
              {data.medicines.map((m, i) => (
                <div key={i} className="flex items-center justify-between bg-dark-800/50 rounded-xl px-4 py-3">
                  <div>
                    <span className="text-sm font-medium text-white">{m.name}</span>
                    <span className="text-xs text-dark-400 ml-2">{m.dosage} • {m.freq}</span>
                  </div>
                  <CheckCircle2 size={18} className="text-green-500" />
                </div>
              ))}
            </div>
          </div>
          {data.hasInteraction && (
            <div className="glass-card border border-red-500/30 bg-red-500/5">
              <div className="flex items-center gap-2 text-red-400 mb-2"><AlertTriangle size={18} /><span className="font-semibold text-sm">Interaction Detected</span></div>
              <p className="text-xs text-dark-300">Rivotril + Baclofen: CNS depression — combined sedation risk (Severe)</p>
            </div>
          )}
          <div className="flex gap-3">
            <button className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"><CheckCircle2 size={16} /> Verify & Dispense</button>
            <button className="px-5 py-2.5 rounded-xl font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-all text-sm">Flag Issue</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Analytics Page ────────────────────────────────────────────────── */
function AnalyticsPage() {
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return <div className="glass rounded-lg px-3 py-2 text-xs border border-dark-600"><p className="text-dark-300">{label}</p><p className="font-medium text-primary-400">{payload[0].value} prescriptions</p></div>
  }
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Analytics</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label:'Today', value:'8', sub:'+3 vs yesterday' },
          { label:'This Week', value:'47', sub:'+12% vs last' },
          { label:'Verified', value:'89%', sub:'Verification rate' },
          { label:'Flagged', value:'3', sub:'Require attention' },
        ].map(s => (
          <div key={s.label} className="glass-card">
            <p className="text-xs text-dark-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold gradient-text mt-1">{s.value}</p>
            <p className="text-[11px] text-dark-500 mt-1 flex items-center gap-1"><TrendingUp size={10}/>{s.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-card">
          <h3 className="text-sm font-medium text-dark-300 mb-4">Prescriptions by Hour</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="hour" tick={{ fill:'#94a3b8', fontSize:11 }} axisLine={false} />
              <YAxis tick={{ fill:'#94a3b8', fontSize:11 }} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card">
          <h3 className="text-sm font-medium text-dark-300 mb-4">Status Distribution</h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={140} height={140}>
              <PieChart><Pie data={statusDist} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                {statusDist.map((e,i) => <Cell key={i} fill={e.color} />)}
              </Pie></PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {statusDist.map(s => (
                <div key={s.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background:s.color }} />
                  <span className="text-xs text-dark-300">{s.name}</span>
                  <span className="text-xs font-medium text-white ml-auto">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Medicine DB Page ──────────────────────────────────────────────── */
const ALL_MEDS = ["Beklo","Maxima","Leptic","Esoral","Omastin","Esonix","Canazole","Fixal","Progut","Diflu","Montair","Flexilax","Maxpro","Vifas","Conaz","Fexofast","Fenadin","Telfast","Dinafex","Ritch","Renova","Flugal","Axodin","Sergel","Nexum","Opton","Nexcap","Fexo","Montex","Exium","Lumona","Napa","Azithrocin","Atrizin","Monas","Nidazyl","Metsina","Baclon","Rozith","Bicozin","Ace","Amodis","Alatrol","Napa Extend","Rivotril","Montene","Filmet","Aceta","Tamen","Bacmax","Disopan","Rhinil","Flamyd","Metro","Zithrin","Candinil","Lucan-R","Backtone","Bacaid","Etizin","Az","Romycin","Azyth","Cetisoft","Dancel","Tridosil","Nizoder","Ketoral","Ketocon","Ketotab","Ketozol","Denixil","Provair","Odmon","Baclofen","MKast","Trilock","Flexibac"]

function MedicineDBPage() {
  const [search, setSearch] = useState('')
  const filtered = ALL_MEDS.filter(m => m.toLowerCase().includes(search.toLowerCase()))
  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-1">Medicine Database</h2>
      <p className="text-sm text-dark-400 mb-6">{ALL_MEDS.length} medicines from BD Prescription Dataset</p>
      <div className="glass-card p-3 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search medicines..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-dark-800/50 border border-dark-600 text-dark-200 text-sm focus:outline-none focus:border-primary-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(m => (
          <div key={m} className="glass-card py-3 px-4 text-center">
            <Pill size={18} className="mx-auto text-primary-400 mb-2" />
            <span className="text-sm font-medium text-white">{m}</span>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <p className="text-center text-dark-400 py-12">No medicines match "{search}"</p>}
    </div>
  )
}

/* ─── Main App ──────────────────────────────────────────────────────── */
export default function App() {
  const [tab, setTab] = useState('queue')
  const [collapsed, setCollapsed] = useState(false)
  const [selectedRx, setSelectedRx] = useState(null)

  const handleSelect = (rx) => { setSelectedRx(rx); setTab('verify') }

  return (
    <div className="min-h-screen bg-dark-900">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-600/8 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-accent-600/5 rounded-full blur-[100px]" />
      </div>
      <Sidebar active={tab} setActive={setTab} collapsed={collapsed} toggle={() => setCollapsed(!collapsed)} />
      <main className={`relative z-10 transition-all duration-300 p-6 pt-8 ${collapsed ? 'ml-16' : 'ml-60'}`}>
        {tab === 'queue' && <QueuePage onSelect={handleSelect} />}
        {tab === 'verify' && <VerifyPage rx={selectedRx} />}
        {tab === 'analytics' && <AnalyticsPage />}
        {tab === 'medicines' && <MedicineDBPage />}
      </main>
    </div>
  )
}
