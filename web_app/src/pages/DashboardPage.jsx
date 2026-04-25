import { useState, useEffect } from 'react'
import { FileText, Pill, Activity, AlertTriangle, TrendingUp, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts'
import { getStats } from '../services/api'

const DEMO_STATS = { total_prescriptions: 156, total_medicines: 487, avg_confidence: 0.843, interaction_alerts: 23, prescriptions_today: 4 }

const monthlyData = [
  { month: 'Jun', count: 12 }, { month: 'Jul', count: 19 }, { month: 'Aug', count: 28 },
  { month: 'Sep', count: 35 }, { month: 'Oct', count: 52 }, { month: 'Nov', count: 10 },
]

const accuracyTrend = [
  { week: 'W1', cer: 22.4 }, { week: 'W2', cer: 19.1 }, { week: 'W3', cer: 16.8 },
  { week: 'W4', cer: 14.2 }, { week: 'W5', cer: 12.5 }, { week: 'W6', cer: 11.1 },
  { week: 'W7', cer: 9.8 }, { week: 'W8', cer: 8.6 },
]

const severityDist = [
  { name: 'None', value: 68, color: '#22c55e' },
  { name: 'Minor', value: 19, color: '#a3e635' },
  { name: 'Moderate', value: 10, color: '#f59e0b' },
  { name: 'Severe', value: 3, color: '#ef4444' },
]

const topMedicines = [
  { name: 'Napa', count: 45 }, { name: 'Esoral', count: 38 }, { name: 'Montair', count: 31 },
  { name: 'Azithrocin', count: 27 }, { name: 'Fexofast', count: 22 }, { name: 'Ace', count: 19 },
  { name: 'Metro', count: 16 }, { name: 'Rivotril', count: 12 },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs shadow-xl border border-dark-600">
      <p className="text-dark-300 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-medium" style={{ color: p.color || '#3b82f6' }}>{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, trend, color = 'from-primary-500 to-primary-600' }) {
  return (
    <div className="glass-card animate-slide-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-dark-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
          {trend && <p className="text-xs text-accent-400 mt-1 flex items-center gap-1"><TrendingUp size={12} />{trend}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState(DEMO_STATS)

  useEffect(() => {
    getStats().then(setStats).catch(() => {})
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-bold text-white mb-1">Analytics <span className="gradient-text">Dashboard</span></h1>
        <p className="text-dark-400 text-sm">System performance and prescription analytics</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FileText} label="Total Prescriptions" value={stats.total_prescriptions} trend="+12% this month" color="from-blue-500 to-blue-600" />
        <StatCard icon={Pill} label="Medicines Extracted" value={stats.total_medicines} trend="+8% this month" color="from-emerald-500 to-emerald-600" />
        <StatCard icon={Activity} label="Avg Confidence" value={`${Math.round(stats.avg_confidence * 100)}%`} trend="+3.2%" color="from-purple-500 to-purple-600" />
        <StatCard icon={AlertTriangle} label="Interaction Alerts" value={stats.interaction_alerts} color="from-amber-500 to-amber-600" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly prescriptions */}
        <div className="glass-card animate-slide-up">
          <h3 className="text-sm font-medium text-dark-300 mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-primary-400" /> Monthly Prescriptions
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Prescriptions" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1a56db" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* CER Trend */}
        <div className="glass-card animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-sm font-medium text-dark-300 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-accent-400" /> OCR Error Rate Trend (CER %)
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={accuracyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} domain={[0, 25]} />
              <Tooltip content={<CustomTooltip />} />
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="cer" name="CER" stroke="#14b8a6" fill="url(#areaGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Severity Distribution */}
        <div className="glass-card animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <h3 className="text-sm font-medium text-dark-300 mb-4">Interaction Severity Distribution</h3>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={severityDist} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {severityDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 flex-1">
              {severityDist.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-sm text-dark-300">{s.name}</span>
                  </div>
                  <span className="text-sm font-medium text-white">{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top medicines */}
        <div className="glass-card animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-sm font-medium text-dark-300 mb-4">Top Prescribed Medicines</h3>
          <div className="space-y-3">
            {topMedicines.map((m, i) => {
              const pct = (m.count / topMedicines[0].count) * 100
              return (
                <div key={m.name} className="flex items-center gap-3">
                  <span className="text-xs text-dark-500 w-4 text-right">{i + 1}</span>
                  <span className="text-sm text-dark-200 w-24 truncate">{m.name}</span>
                  <div className="flex-1 h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full gradient-bg transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-mono text-dark-400 w-8 text-right">{m.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
