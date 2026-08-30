import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText, Pill, Gauge, PenLine, Loader2, Wallet, Stethoscope, ScanLine,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import { getStats, getPrescriptions } from '../services/api'

/**
 * Everything on this screen is computed from records that exist.
 *
 * The previous version shipped a fabricated six-month series and a falling
 * "OCR error rate" curve for a model this project does not run. A chart of
 * invented numbers is worse than no chart: it is the one artefact a reader will
 * quote back at you.
 *
 * The headline is COVERAGE — the share of readings resolved without a human —
 * not accuracy. For a system whose whole design is to abstain, coverage is the
 * number that can be honestly reported.
 */

const OUTCOME_COLOR = {
  confirmed: '#166B60',
  probable:  '#D97706',
  ambiguous: '#EA580C',
  unmatched: '#7C5CD6',
  illegible: '#96A19E',
}

const VERIFY_COLOR = {
  verified:   '#166B60',
  partial:    '#6FBDAD',
  unverified: '#D96565',
  unknown:    '#C5CDCB',
}

const OUTCOME_LABEL = {
  confirmed: 'Confirmed', probable: 'Probable', ambiguous: 'Ambiguous',
  unmatched: 'Not in register', illegible: 'Could not read',
}

const VERIFY_LABEL = {
  verified: 'NLEM verified', partial: 'Part-verified',
  unverified: 'Not on NLEM', unknown: 'Unknown drug',
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getStats().catch(() => null),
      getPrescriptions(50).catch(() => []),
    ]).then(([s, r]) => { setStats(s); setRows(r ?? []); setLoading(false) })
  }, [])

  const derived = useMemo(() => {
    const outcome = {}, verify = {}, generic = {}, risk = {}
    let checked = 0, skipped = 0
    for (const rx of rows) {
      risk[rx.interactions?.overall_risk ?? 'none'] = (risk[rx.interactions?.overall_risk ?? 'none'] ?? 0) + 1
      checked += (rx.interactions?.medicines_checked ?? []).length
      skipped += (rx.interactions?.skipped ?? []).length
      for (const m of rx.medicines ?? []) {
        outcome[m.outcome] = (outcome[m.outcome] ?? 0) + 1
        verify[m.verification] = (verify[m.verification] ?? 0) + 1
        for (const g of m.ingredients ?? []) generic[g] = (generic[g] ?? 0) + 1
      }
    }
    const toSeries = (obj, labels) =>
      Object.entries(obj).map(([k, v]) => ({ key: k, name: labels[k] ?? k, value: v }))
                         .sort((a, b) => b.value - a.value)
    return {
      outcome: toSeries(outcome, OUTCOME_LABEL),
      verify: toSeries(verify, VERIFY_LABEL),
      top: Object.entries(generic).map(([name, count]) => ({ name, count }))
                 .sort((a, b) => b.count - a.count).slice(0, 8),
      legibility: [...rows].reverse().map((rx, i) => ({
        i: i + 1, pct: Math.round((rx.overall_legibility ?? 0) * 100),
      })),
      risk, checked, skipped,
    }
  }, [rows])

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-12 text-ink-600">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading dashboard…
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-2xl px-4">
        <div className="card text-center">
          <p className="font-display text-xl text-ink-900">The API is not reachable</p>
          <p className="mt-2 text-sm text-ink-600">
            Start the backend on port 8000 and reload. Nothing is shown here that was not measured.
          </p>
        </div>
      </div>
    )
  }

  const coverage = Math.round((stats.coverage ?? 0) * 100)
  const empty = (stats.total_prescriptions ?? 0) === 0

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <header className="mb-8 animate-fade-in">
        <span className="rule-label text-care-700">Operations</span>
        <h1 className="mt-2 font-display text-4xl font-normal text-ink-900">Dashboard</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Measured from the records in this database. Coverage — not accuracy — is the headline:
          this system is designed to abstain, so what matters is how much it resolved without a human.
        </p>
      </header>

      {empty && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 border-care-200 bg-care-50">
          <p className="text-sm text-care-900">
            No prescriptions have been processed yet, so every figure below is zero.
          </p>
          <Link to="/upload" className="btn-primary py-2.5 text-sm"><ScanLine size={16} /> Scan the first page</Link>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={FileText}   label="Pages processed"  value={stats.total_prescriptions ?? 0}
              sub={`${stats.reviewed ?? 0} signed off by a clinician`} />
        <Stat icon={Pill}       label="Lines extracted"  value={stats.total_medicines ?? 0}
              sub={`${derived.checked} eligible for interaction screening`} />
        <Stat icon={Gauge}      label="Coverage"         value={`${coverage}%`}
              sub="resolved without a human" />
        <Stat icon={PenLine}    label="Corrections"      value={stats.corrections_logged ?? 0}
              sub="audit trail + training corpus" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Reading outcomes" hint="How sure we are what was written">
          {derived.outcome.length === 0 ? <Blank /> : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={derived.outcome} layout="vertical" margin={{ left: 10, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F0" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6C7876', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={118}
                       tick={{ fill: '#3A4543', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: '#F7F8F7' }} />
                <Bar dataKey="value" name="lines" radius={[0, 5, 5, 0]} barSize={20}>
                  {derived.outcome.map((d) => <Cell key={d.key} fill={OUTCOME_COLOR[d.key] ?? '#96A19E'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Ingredient verification" hint="How sure we are what drug that is">
          {derived.verify.length === 0 ? <Blank /> : (
            <div className="flex flex-wrap items-center gap-6">
              <ResponsiveContainer width={168} height={168}>
                <PieChart>
                  <Pie data={derived.verify} dataKey="value" cx="50%" cy="50%"
                       innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                    {derived.verify.map((d) => <Cell key={d.key} fill={VERIFY_COLOR[d.key] ?? '#C5CDCB'} />)}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="min-w-[9rem] flex-1 space-y-2.5">
                {derived.verify.map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2 text-ink-700">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: VERIFY_COLOR[d.key] }} />
                      {d.name}
                    </span>
                    <span className="data font-medium text-ink-900">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Page legibility" hint="Per page, oldest to newest">
          {derived.legibility.length === 0 ? <Blank /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={derived.legibility} margin={{ left: -18, right: 8 }}>
                <defs>
                  <linearGradient id="legGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1F8375" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#1F8375" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F0" />
                <XAxis dataKey="i" tick={{ fill: '#6C7876', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#6C7876', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip suffix="%" />} />
                <Area type="monotone" dataKey="pct" name="legibility"
                      stroke="#166B60" strokeWidth={2} fill="url(#legGrad)" dot={{ r: 3, fill: '#166B60' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Most-seen ingredients" hint="Resolved compositions across all pages">
          {derived.top.length === 0 ? <Blank /> : (
            <ul className="space-y-3">
              {derived.top.map((m, i) => (
                <li key={m.name} className="flex items-center gap-3">
                  <span className="data w-4 text-right text-xs text-ink-400">{i + 1}</span>
                  <span className="w-36 truncate text-sm text-ink-800" title={m.name}>{m.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span className="block h-full rounded-full bg-care-600"
                          style={{ width: `${(m.count / derived.top[0].count) * 100}%` }} />
                  </span>
                  <span className="data w-6 text-right text-xs text-ink-500">{m.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Interaction screening" hint="What entered the safety check, and what did not">
          <div className="grid grid-cols-2 gap-4">
            <Figure value={derived.checked} label="ingredients screened"
                    note="NLEM-verified, so a mapping error cannot become a wrong safety verdict" />
            <Figure value={derived.skipped} label="named as not screened" tone="warn"
                    note="unverified or unreadable — listed to the reviewer, never dropped" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(derived.risk).map(([k, v]) => (
              <span key={k} className={`chip severity-${k}`}>{v} page{v === 1 ? '' : 's'} · {k} risk</span>
            ))}
          </div>
        </Panel>

        <Panel title="Reading budget" hint="Live model spend against the hard cap">
          <div className="flex items-baseline gap-2">
            <Wallet size={18} className="text-care-700" />
            <span className="data text-3xl font-bold text-ink-900">${(stats.spend_usd ?? 0).toFixed(4)}</span>
            <span className="text-sm text-ink-500">
              spent · ${(stats.spend_remaining_usd ?? 0).toFixed(2)} left
            </span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-care-600"
              style={{
                width: `${Math.min(100, ((stats.spend_usd ?? 0) /
                  Math.max((stats.spend_usd ?? 0) + (stats.spend_remaining_usd ?? 0), 0.0001)) * 100).toFixed(2)}%`,
              }}
            />
          </div>
          <p className="mt-3 text-xs text-ink-500">
            The cap is enforced before each call, not after. A read that would cross it is refused
            rather than billed.
          </p>
          <Link to="/history" className="btn-secondary mt-5 py-2.5 text-sm">
            <Stethoscope size={16} /> Review pending pages
          </Link>
        </Panel>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="stat-card animate-slide-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="rule-label">{label}</p>
          <p className="data mt-1.5 text-3xl font-bold text-ink-900">{value}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-care-200 bg-care-50 text-care-700">
          <Icon size={18} />
        </span>
      </div>
      {sub && <p className="mt-2 text-xs leading-snug text-ink-500">{sub}</p>}
    </div>
  )
}

function Panel({ title, hint, children }) {
  return (
    <section className="card animate-slide-up">
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2>
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Figure({ value, label, note, tone }) {
  return (
    <div className={`rounded-lg border p-4 ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-care-200 bg-care-50'}`}>
      <p className={`data text-2xl font-bold ${tone === 'warn' ? 'text-amber-900' : 'text-care-800'}`}>{value}</p>
      <p className={`text-xs font-medium ${tone === 'warn' ? 'text-amber-900' : 'text-care-800'}`}>{label}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-500">{note}</p>
    </div>
  )
}

function Blank() {
  return <p className="py-12 text-center text-sm text-ink-400">Nothing measured yet.</p>
}

function ChartTip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs shadow-clinical-lg">
      {label != null && <p className="mb-1 text-ink-500">{payload[0].payload.name ?? `Page ${label}`}</p>}
      {payload.map((p, i) => (
        <p key={i} className="data font-semibold text-ink-900">{p.value}{suffix} {p.name}</p>
      ))}
    </div>
  )
}
