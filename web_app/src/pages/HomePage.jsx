import { Link } from 'react-router-dom'
import {
  ScanLine, ShieldPlus, ChevronRight, Quote, Library, BadgeCheck,
  EyeOff, Stethoscope, ArrowRight, CircleDot,
} from 'lucide-react'

/**
 * The claims on this page are the ones the pipeline can actually defend.
 * Numbers come from ml_pipeline (239,541 indexed Indian brands, NLEM 2022 as
 * the verification gate, 180 cited interaction rules). Nothing aspirational.
 */

const features = [
  {
    icon: Quote,
    title: 'Reads it verbatim',
    desc: 'If the page says “Dijoxin”, the record says “Dijoxin”. A likely correction is offered beside it and flagged — never applied silently behind the clinician.',
  },
  {
    icon: Library,
    title: '239,541 Indian brands',
    desc: 'Every reading is matched against the Indian brand register, on both the full name and the strength-stripped base name, so “Dolo 650” and “ZOFER” both land.',
  },
  {
    icon: BadgeCheck,
    title: 'NLEM 2022 verification',
    desc: 'Each ingredient is checked against the national essential-medicines list. A combination is often part-verified, and the page says exactly which component is not.',
  },
  {
    icon: ShieldPlus,
    title: 'Cited interaction rules',
    desc: '180 pairwise rules across 212 drugs, each carrying its source. Where the data disagreed with itself, the more severe assessment wins.',
  },
  {
    icon: EyeOff,
    title: 'Abstains out loud',
    desc: 'A line it cannot read is reported as unreadable, and named in the “not checked” list. Coverage is deliberately incomplete rather than quietly guessed.',
  },
  {
    icon: Stethoscope,
    title: 'A clinician signs off',
    desc: 'Every extraction lands on a review screen beside the original image. Corrections are recorded as an audit trail, with the model’s original output kept alongside.',
  },
]

const stats = [
  { value: '239,541', label: 'Brands indexed' },
  { value: '180', label: 'Cited DDI rules' },
  { value: '241', label: 'NLEM molecules' },
  { value: '100%', label: 'Pages reviewed' },
]

const steps = [
  { n: '01', title: 'Capture', desc: 'Photograph or upload the prescription. The page is normalised and downscaled before it is ever sent.' },
  { n: '02', title: 'Read & match', desc: 'The page is transcribed as written, then matched against the Indian brand register and resolved to a composition.' },
  { n: '03', title: 'Verify & check', desc: 'Ingredients are verified against NLEM 2022, screened for interactions, and put in front of a clinician to sign off.' },
]

export default function HomePage() {
  return (
    <div>
      {/* ---------------- hero ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <span className="eyebrow animate-fade-in">
              <CircleDot size={12} className="animate-vitals" />
              Clinical decision support
            </span>

            <h1 className="mt-6 animate-slide-up font-display text-5xl font-normal leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
              Handwriting into a
              <span className="relative mx-2 whitespace-nowrap text-care-700">
                clinical record
                <Underline />
              </span>
              you can audit.
            </h1>

            <p className="mt-6 max-w-xl animate-slide-up text-lg leading-relaxed text-ink-600" style={{ animationDelay: '.08s' }}>
              PrescriptAI transcribes a prescription exactly as it was written, resolves each
              brand to its composition against the Indian register, and screens the result for
              known interactions — then hands the whole thing to a clinician to confirm.
            </p>

            <div className="mt-9 flex animate-slide-up flex-col gap-3 sm:flex-row" style={{ animationDelay: '.16s' }}>
              <Link to="/upload" className="btn-primary text-base">
                <ScanLine size={19} /> Scan a prescription <ChevronRight size={17} />
              </Link>
              <Link to="/interactions" className="btn-secondary text-base">
                <ShieldPlus size={19} /> Check interactions
              </Link>
            </div>

            <p className="mt-6 text-xs text-ink-500">
              Decision support, not a dispensing authority. Nothing here is a substitute for the prescriber.
            </p>
          </div>

          <SamplePad />
        </div>

        {/* stat strip */}
        <div className="mt-20 grid animate-slide-up grid-cols-2 gap-4 lg:grid-cols-4" style={{ animationDelay: '.24s' }}>
          {stats.map(({ value, label }) => (
            <div key={label} className="stat-card text-center">
              <div className="data text-3xl font-bold text-ink-900">{value}</div>
              <div className="rule-label mt-1.5">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- features ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <SectionHead
          kicker="What it actually does"
          title="Built to be checked, not trusted"
          blurb="Two facts are reported separately on every line: how sure we are what was written, and how sure we are what drug that is. They are not the same question, and collapsing them is how a confident misreading reaches a patient."
        />

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }, i) => (
            <article
              key={title}
              className="card-link animate-slide-up"
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              <span className="grid h-11 w-11 place-items-center rounded-lg border border-care-200 bg-care-50 text-care-700">
                <Icon size={20} />
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold text-ink-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <SectionHead kicker="The path a page takes" title="Three stages, one sign-off" />

        <div className="relative grid gap-6 md:grid-cols-3">
          {/* the dotted spine between the stages, drawn only on wide screens */}
          <div className="absolute left-0 right-0 top-9 hidden border-t-2 border-dashed border-care-200 md:block" />
          {steps.map(({ n, title, desc }, i) => (
            <div key={n} className="relative animate-slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="mb-5 flex items-center gap-3">
                <span className="data grid h-[4.5rem] w-[4.5rem] place-items-center rounded-2xl border border-ink-200 bg-white text-xl font-bold text-care-700 shadow-clinical">
                  {n}
                </span>
                {i < steps.length - 1 && (
                  <ArrowRight size={18} className="hidden text-care-300 md:block" />
                )}
              </div>
              <h3 className="font-display text-xl font-semibold text-ink-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- cta ---------------- */}
      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="pad overflow-hidden px-8 py-14 text-center sm:px-12">
          <h2 className="font-display text-3xl font-normal text-ink-900 sm:text-4xl">
            Start with one page.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-ink-600">
            Upload a prescription and you land on the review screen, with the original image
            beside every line it read.
          </p>
          <Link to="/upload" className="btn-primary mt-8 text-base">
            <ScanLine size={19} /> Scan a prescription <ChevronRight size={17} />
          </Link>
        </div>
      </section>
    </div>
  )
}

function SectionHead({ kicker, title, blurb }) {
  return (
    <div className="mb-12 max-w-2xl">
      <span className="rule-label text-care-700">{kicker}</span>
      <h2 className="mt-3 font-display text-3xl font-normal text-ink-900 sm:text-4xl">{title}</h2>
      {blurb && <p className="mt-4 leading-relaxed text-ink-600">{blurb}</p>}
    </div>
  )
}

/** Hand-drawn underline, so the emphasis is ink rather than a gradient. */
function Underline() {
  return (
    <svg
      className="absolute -bottom-2 left-0 h-3 w-full text-care-300"
      viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"
    >
      <path
        d="M2 8 C 40 2, 70 11, 110 6 S 175 3, 198 7"
        fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * A worked example rendered as the thing itself — a page from a prescription
 * pad — rather than as a floating dashboard screenshot. The values are the ones
 * the pipeline produced on VLM_CHECK/2.jpg.
 */
function SamplePad() {
  const rows = [
    { brand: 'Oflazest OZ', comp: 'Ofloxacin + Ornidazole',  freq: '1 — 1',  state: 'confirmed', verify: 'not on NLEM' },
    { brand: 'Azenac MR',   comp: 'Aceclofenac + Paracetamol', freq: '1 — 1', state: 'confirmed', verify: 'part-verified' },
    { brand: 'Andial',      comp: 'Loperamide',              freq: '2 — 1',  state: 'probable',  verify: 'NLEM verified' },
    { brand: '—',           comp: 'could not be read',       freq: '—',      state: 'illegible', verify: 'unknown' },
  ]
  const tone = {
    confirmed: 'bg-care-50 text-care-800 border-care-200',
    probable:  'bg-amber-50 text-amber-900 border-amber-200',
    illegible: 'bg-ink-100 text-ink-600 border-ink-200',
  }

  return (
    <div className="relative animate-slide-up" style={{ animationDelay: '.1s' }}>
      {/* the sheet behind, to make it read as a pad rather than a card */}
      <div className="absolute inset-x-4 -bottom-3 h-full rounded-xl border border-ink-200 bg-white/60" />

      <div className="pad relative p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-dashed border-ink-200 pb-4">
          <div>
            <p className="rule-label">Extraction · VLM_CHECK/2.jpg</p>
            <p className="mt-1 font-display text-xl font-semibold text-ink-900">Ms. Prathna</p>
            <p className="text-xs text-ink-500">Dr. R. Keshwani · 15-03-17</p>
          </div>
          <span className="font-display text-4xl leading-none text-care-700">℞</span>
        </div>

        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.brand + r.comp} className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-care-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-ink-900">{r.brand}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone[r.state]}`}>
                    {r.state}
                  </span>
                  <span className="data ml-auto text-xs text-ink-500">{r.freq}</span>
                </div>
                <p className="text-sm text-ink-600">{r.comp}</p>
                <p className="text-[11px] uppercase tracking-wider text-ink-400">{r.verify}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center gap-2 rounded-lg border border-care-200 bg-care-50 px-3 py-2.5 text-sm text-care-900">
          <ShieldPlus size={16} className="shrink-0" />
          <span>Interaction risk: <strong>none</strong> — 3 of 4 lines eligible for screening.</span>
        </div>
      </div>
    </div>
  )
}
