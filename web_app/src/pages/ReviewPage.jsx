import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import MedicineCard from '../components/MedicineCard'
import {
  getPrescription, submitCorrection, markReviewed, imageUrl,
} from '../services/api'

/**
 * Doctor verification screen.  (ARCHITECTURE_V2 §8.2)
 *
 * Phase 1: every extraction is reviewed here before it is used. The corrections
 * this screen produces are simultaneously the clinical audit trail and the
 * training corpus (§8.3) — which is why the correction type is captured rather
 * than just the new value.
 *
 * The page image sits beside the extraction on purpose: reviewing against the
 * pixels is a glance, reviewing against memory is a rubber-stamp.
 */

const CORRECTION_TYPES = [
  { value: 'misread',      label: 'Misread — wrong characters' },
  { value: 'hallucinated', label: 'Hallucinated — not on the page' },
  { value: 'missed',       label: 'Missed — present but not reported' },
  { value: 'wrong_field',  label: 'Wrong field — right drug, wrong dose/frequency' },
  { value: 'other',        label: 'Other' },
]

export default function ReviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [rx, setRx] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    try { setRx(await getPrescription(id)) }
    catch (e) { setError(e?.response?.data?.detail ?? e.message) }
  }
  useEffect(() => { load() }, [id])

  const src = useMemo(() => imageUrl(rx?.image_url), [rx])

  const needsAttention = useMemo(
    () => (rx?.medicines ?? []).filter((m) => m.needs_hard_confirmation).length,
    [rx],
  )

  const record = async (payload) => {
    setBusy(true)
    try { await submitCorrection(id, payload); await load(); setEditing(null) }
    catch (e) { setError(e?.response?.data?.detail ?? e.message) }
    finally { setBusy(false) }
  }

  const pickCandidate = (index, value) =>
    record({ medicine_index: index, field: 'brand', corrected_value: value,
             correction_type: 'misread', note: 'picked from candidates' })

  const confirmPage = async () => {
    setBusy(true)
    try { await markReviewed(id); navigate(`/results/${id}`) }
    catch (e) { setError(e?.response?.data?.detail ?? e.message) }
    finally { setBusy(false) }
  }

  if (error) return <Banner tone="error">{error}</Banner>
  if (!rx) return <div className="flex items-center gap-2 p-8 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Loading…</div>

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Verify prescription</h1>
        <p className="mt-1 text-sm text-slate-600">
          {rx.patient_name && <>Patient <strong>{rx.patient_name}</strong> · </>}
          {rx.prescriber_name && <>{rx.prescriber_name} · </>}
          {rx.date && <>{rx.date} · </>}
          page legibility {Math.round((rx.overall_legibility ?? 0) * 100)}%
        </p>
      </header>

      <Banner tone="warn">{rx.disclaimer}</Banner>

      {rx.document_type === 'not_a_prescription' && (
        <Banner tone="info">
          This page does not appear to be a prescription — no medicines were
          reported. That is a valid result, not a failure.
        </Banner>
      )}

      {needsAttention > 0 && (
        <Banner tone="error">
          <ShieldAlert className="mr-1 inline h-4 w-4" />
          {needsAttention} item{needsAttention > 1 ? 's' : ''} require prescriber
          confirmation before dispensing.
        </Banner>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-3">
          {rx.medicines.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
              No medicines were reported on this page.
            </p>
          )}
          {rx.medicines.map((m) => (
            <MedicineCard
              key={m.index}
              medicine={m}
              imageSrc={src}
              onPickCandidate={pickCandidate}
              onCorrect={setEditing}
            />
          ))}

          {rx.unreadable_regions?.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">Reader notes</h2>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
                {rx.unreadable_regions.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}

          <SafetySection interactions={rx.interactions} />
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Original</h2>
          {src && (
            <img src={src} alt="Uploaded prescription"
                 className="w-full rounded-xl border border-slate-300" />
          )}
          <button
            type="button" onClick={confirmPage} disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {rx.reviewed ? 'Confirmed' : 'Confirm as reviewed'}
          </button>
          <p className="mt-2 text-xs text-slate-500">
            Confirming an unchanged page is itself useful — it records a fully
            verified example.
          </p>
        </aside>
      </div>

      {editing && (
        <CorrectionDialog
          medicine={editing} busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(field, value, type, note) =>
            record({ medicine_index: editing.index, field, corrected_value: value,
                     correction_type: type, note })}
        />
      )}
    </div>
  )
}

function SafetySection({ interactions }) {
  if (!interactions) return null
  const { overall_risk: risk, interactions: list = [], skipped = [], medicines_checked = [] } = interactions
  const tone = risk === 'severe' ? 'error' : risk === 'moderate' ? 'warn' : 'info'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-800">Interaction check</h2>
      <Banner tone={tone}>
        Overall risk: <strong>{risk}</strong> · {list.length} interaction{list.length === 1 ? '' : 's'} found
      </Banner>
      {list.map((i, k) => (
        <div key={k} className="mt-2 rounded-lg border p-3" style={{ borderColor: i.severity_color }}>
          <p className="font-semibold" style={{ color: i.severity_color }}>
            {i.severity.toUpperCase()} — {i.drug_a} + {i.drug_b}
          </p>
          {i.effect && <p className="mt-1 text-sm text-slate-700">{i.effect}</p>}
          {i.mechanism && <p className="mt-1 text-xs text-slate-500">Mechanism: {i.mechanism}</p>}
          {i.safer_alternative && <p className="mt-1 text-sm text-emerald-800">Safer: {i.safer_alternative}</p>}
          {/* The citation is what makes this trustworthy to a clinician —
              surface it, do not hide it behind a severity dot. */}
          {i.reference && <p className="mt-1 text-xs italic text-slate-500">{i.reference}</p>}
        </div>
      ))}
      <p className="mt-3 text-xs text-slate-600">
        Checked: {medicines_checked.length ? medicines_checked.join(', ') : 'nothing'}
      </p>
      {skipped.length > 0 && (
        <div className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Not checked ({skipped.length}):</strong>
          <ul className="mt-1 list-disc pl-4">{skipped.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

function CorrectionDialog({ medicine, busy, onCancel, onSave }) {
  const [field, setField] = useState('brand')
  const [value, setValue] = useState(medicine.brand ?? '')
  const [type, setType] = useState('misread')
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Correct entry</h3>
        <p className="mt-1 font-mono text-xs text-slate-500">read as “{medicine.raw_reading}”</p>

        <label className="mt-4 block text-sm font-medium text-slate-700">Field</label>
        <select value={field} onChange={(e) => { setField(e.target.value); setValue(medicine[e.target.value] ?? '') }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
          {['brand', 'dosage', 'frequency', 'duration', 'instructions'].map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <label className="mt-3 block text-sm font-medium text-slate-700">Correct value</label>
        <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus
               className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />

        {/* The reward signal for later calibration — one dropdown (§16.3). */}
        <label className="mt-3 block text-sm font-medium text-slate-700">What went wrong?</label>
        <select value={type} onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
          {CORRECTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <label className="mt-3 block text-sm font-medium text-slate-700">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)}
               className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-slate-700 hover:bg-slate-100">Cancel</button>
          <button type="button" disabled={busy} onClick={() => onSave(field, value, type, note)}
                  className="rounded-lg bg-sky-700 px-4 py-2 font-medium text-white hover:bg-sky-800 disabled:opacity-60">
            {busy ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Banner({ tone = 'info', children }) {
  const cls = {
    info:  'border-sky-200 bg-sky-50 text-sky-900',
    warn:  'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  }[tone]
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      {tone !== 'info' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div>{children}</div>
    </div>
  )
}
