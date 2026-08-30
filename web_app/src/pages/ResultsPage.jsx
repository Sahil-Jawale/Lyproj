import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2, Stethoscope } from 'lucide-react'
import MedicineCard from '../components/MedicineCard'
import { getPrescription, getPrescriptions, imageUrl } from '../services/api'

/**
 * Read-only result view.  (ARCHITECTURE_V2 §8)
 *
 * Shows every outcome state honestly. There is no "Unrecognized" row any more —
 * the prototype this replaces emitted one, which is a failure state wearing the
 * costume of a result.
 */
export default function ResultsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [rx, setRx] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        if (id) return setRx(await getPrescription(id))
        const list = await getPrescriptions(1, 0)
        if (list.length) return setRx(list[0])
        setError('No prescriptions yet. Upload one to get started.')
      } catch (e) { setError(e?.response?.data?.detail ?? e.message) }
    })()
  }, [id])

  const src = useMemo(() => imageUrl(rx?.image_url), [rx])
  const unresolved = useMemo(
    () => (rx?.medicines ?? []).filter((m) => m.needs_hard_confirmation).length, [rx])

  if (error) return <div className="mx-auto max-w-3xl p-8 text-ink-700">{error}</div>
  if (!rx) return <div className="flex items-center gap-2 p-8 text-ink-600"><Loader2 className="h-5 w-5 animate-spin" />Loading…</div>

  const risk = rx.interactions?.overall_risk ?? 'none'

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-normal text-ink-900">Extraction result</h1>
          <p className="mt-1 text-sm text-ink-600">
            {rx.patient_name && <>Patient <strong>{rx.patient_name}</strong> · </>}
            {rx.prescriber_name && <>{rx.prescriber_name} · </>}
            {rx.date && <>{rx.date} · </>}
            legibility {Math.round((rx.overall_legibility ?? 0) * 100)}%
            {rx.reviewed && <span className="ml-2 rounded-full bg-care-100 px-2 py-0.5 text-xs font-medium text-care-800">reviewed</span>}
          </p>
        </div>
        <button type="button" onClick={() => navigate(`/review/${rx.id}`)}
          className="btn-primary py-2.5 text-sm">
          <Stethoscope className="h-4 w-4" />{rx.reviewed ? 'Review again' : 'Verify as doctor'}
        </button>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>{rx.disclaimer}</div>
      </div>

      {unresolved > 0 && (
        <div className="mt-3 rounded-xl border border-vital-200 bg-vital-50 px-4 py-3 text-sm text-vital-900">
          <strong>{unresolved}</strong> item{unresolved > 1 ? 's need' : ' needs'} prescriber
          confirmation. Coverage is deliberately incomplete rather than guessed.
        </div>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-3">
          {rx.medicines.length === 0
            ? <p className="rounded-xl border border-ink-200 bg-white p-6 text-ink-600 shadow-clinical">
                No medicines reported on this page{rx.document_type === 'not_a_prescription' && ' — it does not appear to be a prescription'}.
              </p>
            : rx.medicines.map((m) => <MedicineCard key={m.index} medicine={m} imageSrc={src} />)}

          <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-clinical">
            <h2 className="text-sm font-semibold text-ink-800">
              Interaction check — risk: <span className="uppercase">{risk}</span>
            </h2>
            {(rx.interactions?.interactions ?? []).map((i, k) => (
              <div key={k} className="mt-2 rounded-lg border p-3" style={{ borderColor: i.severity_color }}>
                <p className="font-semibold" style={{ color: i.severity_color }}>
                  {i.severity.toUpperCase()} — {i.drug_a} + {i.drug_b}
                </p>
                {i.effect && <p className="mt-1 text-sm text-ink-700">{i.effect}</p>}
                {i.safer_alternative && <p className="mt-1 text-sm text-care-800">Safer: {i.safer_alternative}</p>}
                {i.reference && <p className="mt-1 text-xs italic text-ink-500">{i.reference}</p>}
              </div>
            ))}
            {(rx.interactions?.skipped ?? []).length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <strong>Not checked ({rx.interactions.skipped.length}):</strong>
                <ul className="mt-1 list-disc pl-4">
                  {rx.interactions.skipped.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>

        <aside>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Original</h2>
          {src && <img src={src} alt="Uploaded prescription" className="w-full rounded-xl border border-ink-200 bg-white p-1 shadow-clinical" />}
          <Link to="/history" className="mt-3 block text-sm text-care-800 underline underline-offset-2">All prescriptions</Link>
        </aside>
      </div>
    </div>
  )
}
