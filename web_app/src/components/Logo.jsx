/**
 * The mark: ℞ — the prescription symbol, which is what this product reads.
 * A live "vitals" dot sits on the corner: the only piece of motion in the
 * chrome, and it stops under prefers-reduced-motion like everything else.
 */
export default function Logo({ size = 'md' }) {
  const box = size === 'lg' ? 'h-12 w-12 text-2xl' : 'h-10 w-10 text-xl'
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`${box} grid place-items-center rounded-xl bg-care-700 font-display
                    font-semibold leading-none text-white shadow-clinical`}
      >
        ℞
      </span>
      <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full rounded-full bg-vital-400/70 animate-ring" />
        <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white bg-vital-500 animate-vitals" />
      </span>
    </span>
  )
}
