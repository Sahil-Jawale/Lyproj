import { AlertTriangle, CheckCircle2, HelpCircle, EyeOff, SearchX, ShieldCheck, ShieldAlert, Shield } from 'lucide-react'

/**
 * One medicine, showing BOTH facts the reviewer needs (ARCHITECTURE_V2 §5/S1):
 *
 *   outcome      — how sure we are about what was WRITTEN
 *   verification — how sure we are about what DRUG that is
 *
 * These are orthogonal: a perfectly legible brand can still be unverified.
 *
 * The reading is ALWAYS shown. Verification changes the strength of the
 * warning, never whether the result is visible — a blocked screen helps nobody
 * and the doctor is the safety net.
 */

const OUTCOME = {
  confirmed: { label: 'Confirmed', cls: 'border-care-300 bg-care-50', pill: 'bg-care-100 text-care-800', Icon: CheckCircle2 },
  probable:  { label: 'Probable',  cls: 'border-amber-300 bg-amber-50',     pill: 'bg-amber-100 text-amber-800',     Icon: AlertTriangle },
  ambiguous: { label: 'Ambiguous', cls: 'border-orange-300 bg-orange-50',   pill: 'bg-orange-100 text-orange-800',   Icon: HelpCircle },
  // Read clearly, just absent from our database. NOT the same as unreadable —
  // telling a doctor "could not read" about text we read perfectly is false,
  // and it makes a working system look broken.
  unmatched: { label: 'Not in database', cls: 'border-violet-300 bg-violet-50', pill: 'bg-violet-100 text-violet-800', Icon: SearchX },
  illegible: { label: 'Could not read', cls: 'border-ink-300 bg-ink-50', pill: 'bg-ink-200 text-ink-700',    Icon: EyeOff },
}

const VERIFY = {
  verified:   { label: 'NLEM verified',  pill: 'bg-care-100 text-care-800',       Icon: ShieldCheck },
  partial:    { label: 'Partly verified', pill: 'bg-indigo-100 text-indigo-800', Icon: Shield },
  unverified: { label: 'Not on NLEM',    pill: 'bg-vital-100 text-vital-800',     Icon: ShieldAlert },
  unknown:    { label: 'Unknown drug',   pill: 'bg-ink-200 text-ink-700',   Icon: ShieldAlert },
}

export default function MedicineCard({ medicine, imageSrc, onPickCandidate, onCorrect }) {
  const o = OUTCOME[medicine.outcome] ?? OUTCOME.illegible
  const v = VERIFY[medicine.verification] ?? VERIFY.unknown
  const { Icon } = o
  const VIcon = v.Icon

  return (
    <div className={`rounded-xl border p-4 shadow-clinical ${o.cls}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-5 w-5 shrink-0" aria-hidden />
        <span className="font-display text-xl font-semibold text-ink-900">
          {medicine.brand
            ?? (medicine.outcome === 'unmatched' && medicine.raw_reading)
            ?? <em className="font-normal text-ink-500">not identified</em>}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.pill}`}>{o.label}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${v.pill}`}>
          <VIcon className="h-3 w-3" aria-hidden />{v.label}
        </span>
        {medicine.match_score != null && (
          <span className="ml-auto text-xs text-ink-500">match {Math.round(medicine.match_score)}</span>
        )}
      </div>

      {medicine.generic && (
        <p className="mt-1 text-sm text-ink-700">{medicine.generic}</p>
      )}

      {/* What the model actually saw. Never dropped — losing it makes every
          later disagreement impossible to adjudicate. */}
      <p className="mt-2 font-mono text-xs text-ink-500">
        read as: “{medicine.raw_reading}”
        {medicine.matched_via && ` · matched via alternative “${medicine.matched_via}”`}
      </p>

      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-700">
        {medicine.dosage && <div><dt className="inline text-ink-500">Dose </dt><dd className="inline font-medium">{medicine.dosage}</dd></div>}
        {medicine.frequency && <div><dt className="inline text-ink-500">Freq </dt><dd className="inline font-medium">{medicine.frequency}</dd></div>}
        {medicine.duration && <div><dt className="inline text-ink-500">Duration </dt><dd className="inline font-medium">{medicine.duration}</dd></div>}
      </dl>

      {/* Unverified components are NAMED, never silently dropped — the reviewer
          must see exactly what was excluded from the safety check. */}
      {medicine.unverified_ingredients?.length > 0 && (
        <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-vital-800">
          <strong>Not checked for interactions:</strong>{' '}
          {medicine.unverified_ingredients.join(', ')} — not on the NLEM 2022
          essential-medicines list.
        </p>
      )}

      {/* AMBIGUOUS renders as pick-one-of-N, never a free-text box: a click
          gets made, typing does not. */}
      {medicine.outcome === 'ambiguous' && medicine.candidates?.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium text-ink-800">Which one is it?</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {medicine.candidates.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onPickCandidate?.(medicine.index, c)}
                className="rounded-lg border border-orange-400 bg-white px-3 py-1.5 text-sm font-medium text-orange-900 hover:bg-orange-100"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {medicine.outcome === 'unmatched' && (
        <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-violet-900">
          <strong>Read clearly, but not found in our medicine database.</strong> The
          name above is what is written on the page. It may be a brand we do not
          carry, an older preparation, or a compounded formulation — verify against
          the original before dispensing.
          {medicine.candidates?.length > 0 && (
            <> Nearest entries: {medicine.candidates.slice(0, 3).join(', ')}.</>
          )}
        </p>
      )}

      {medicine.outcome === 'illegible' && (
        <p className="mt-2 text-sm text-ink-600">
          This line could not be read reliably. Please enter it from the original.
          {medicine.candidates?.length > 0 && (
            <> Closest guesses: {medicine.candidates.join(', ')}.</>
          )}
        </p>
      )}

      {medicine.needs_hard_confirmation && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-vital-900">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Requires prescriber confirmation before dispensing.
        </p>
      )}

      {/* Reviewing against the pixels is a glance; reviewing against memory is
          a rubber-stamp. */}
      {imageSrc && medicine.bbox && (
        <CropPreview src={imageSrc} bbox={medicine.bbox} />
      )}

      {onCorrect && (
        <button
          type="button"
          onClick={() => onCorrect(medicine)}
          className="mt-3 text-sm font-medium text-care-800 underline underline-offset-2 hover:text-care-900"
        >
          Correct this
        </button>
      )}
    </div>
  )
}

/** Shows just the region of the page this line came from, using the S1 bbox. */
function CropPreview({ src, bbox }) {
  const [x0, y0, x1, y1] = bbox
  const w = Math.max(x1 - x0, 0.01)
  const h = Math.max(y1 - y0, 0.01)
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-ink-300 bg-white" style={{ height: 88 }}>
      <div
        className="h-full w-full bg-no-repeat"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: `${100 / w}% ${100 / h}%`,
          backgroundPosition: `${(x0 / (1 - w || 1)) * 100}% ${(y0 / (1 - h || 1)) * 100}%`,
        }}
        role="img"
        aria-label="Region of the prescription this line was read from"
      />
    </div>
  )
}
