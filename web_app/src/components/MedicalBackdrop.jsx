/**
 * The animated ground the whole app sits on.
 *
 * Everything here is decorative and inert: `pointer-events-none`, `aria-hidden`,
 * and every animation is switched off wholesale under `prefers-reduced-motion`
 * (see index.css). Nothing on this layer carries information — if it fails to
 * render, the product is unchanged.
 *
 * The vocabulary is deliberately clinical rather than "AI": graph paper, an ECG
 * trace drawing itself across the page, and a few drifting pharmacy glyphs. No
 * purple, no glassmorphism, no glow.
 */

/** Builds one PQRST-shaped ECG polyline across `width` units. */
function ecgPath(width, cycles, mid, amp) {
  const step = width / cycles
  let d = `M 0 ${mid}`
  for (let i = 0; i < cycles; i++) {
    const x = i * step
    const u = (f) => (x + step * f).toFixed(1)
    d +=
      ` L ${u(0.30)} ${mid}` +                       // isoelectric baseline
      ` Q ${u(0.35)} ${mid - amp * 0.22} ${u(0.40)} ${mid}` + // P wave
      ` L ${u(0.46)} ${mid}` +
      ` L ${u(0.49)} ${mid + amp * 0.28}` +          // Q
      ` L ${u(0.53)} ${mid - amp}` +                 // R spike
      ` L ${u(0.57)} ${mid + amp * 0.42}` +          // S
      ` L ${u(0.61)} ${mid}` +
      ` Q ${u(0.70)} ${mid - amp * 0.34} ${u(0.79)} ${mid}` + // T wave
      ` L ${u(1.0)} ${mid}`
  }
  return d
}

const TRACE_A = ecgPath(1600, 5, 60, 44)
const TRACE_B = ecgPath(1600, 3, 60, 30)

export default function MedicalBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* 1 — graph paper, drifting slowly enough that you notice it only if you look */}
      <div className="absolute inset-0 bg-graph animate-drift opacity-70" />
      <div className="absolute inset-0 bg-graph-lg" />

      {/* 2 — soft clinical washes. Flat colour, no gradient text anywhere. */}
      <div className="absolute -left-40 top-[-10%] h-[36rem] w-[36rem] rounded-full bg-care-200/25 blur-[120px]" />
      <div className="absolute -right-52 top-1/3 h-[34rem] w-[34rem] rounded-full bg-care-100/40 blur-[130px]" />
      <div className="absolute bottom-[-12rem] left-1/3 h-[28rem] w-[28rem] rounded-full bg-vital-100/25 blur-[130px]" />

      {/* 3 — ECG traces. Each one draws itself across the page and restarts. */}
      <svg
        className="absolute inset-x-0 top-[16vh] h-32 w-full mask-fade-x"
        viewBox="0 0 1600 120" preserveAspectRatio="none"
      >
        <path
          d={TRACE_A} pathLength="2400" strokeDasharray="2400"
          className="animate-ecg" fill="none"
          stroke="rgb(31 131 117)" strokeOpacity="0.34"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>

      <svg
        className="absolute inset-x-0 bottom-[14vh] h-24 w-full mask-fade-x"
        viewBox="0 0 1600 120" preserveAspectRatio="none"
      >
        <path
          d={TRACE_B} pathLength="2400" strokeDasharray="2400"
          className="animate-ecg-slow" fill="none"
          stroke="rgb(196 53 58)" strokeOpacity="0.16"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>

      {/* 4 — pharmacy glyphs, drifting. Line art only, barely there. */}
      <Glyph className="left-[6%] top-[30%] animate-float-slow"><Capsule /></Glyph>
      <Glyph className="right-[9%] top-[22%] animate-float-slower"><Cross /></Glyph>
      <Glyph className="left-[18%] bottom-[16%] animate-float-slower"><Mortar /></Glyph>
      <Glyph className="right-[16%] bottom-[26%] animate-float-slow"><Cross /></Glyph>
      <Glyph className="left-[46%] top-[8%] animate-float-slower"><Capsule /></Glyph>
    </div>
  )
}

function Glyph({ className = '', children }) {
  return (
    <div className={`absolute hidden text-care-600/[0.13] lg:block ${className}`}>
      {children}
    </div>
  )
}

function Capsule() {
  return (
    <svg width="86" height="86" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-38 12 12)" />
      <path d="M8.6 15.4 15.4 8.6" />
    </svg>
  )
}

function Cross() {
  return (
    <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" strokeLinejoin="round" />
    </svg>
  )
}

function Mortar() {
  return (
    <svg width="78" height="78" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M4 10h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8Z" strokeLinejoin="round" />
      <path d="M12 18v3M8 21h8M14 10 20 3" strokeLinecap="round" />
    </svg>
  )
}
