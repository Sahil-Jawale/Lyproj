import { useId, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, Eye, EyeOff, Copy, Download, Check } from 'lucide-react'

/**
 * Building blocks for the sign-in, registration and account screens. They are
 * the existing design system (card / input-field / btn-primary / rule-label)
 * arranged for forms — no new visual language.
 */

/** Two-column frame: context on the left, the form on a prescription-pad card. */
export function AuthShell({ kicker, title, blurb, aside, children, wide = false }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className={`grid items-start gap-10 ${wide ? 'lg:grid-cols-[.8fr_1.2fr]' : 'lg:grid-cols-[1fr_440px]'}`}>
        <header className="animate-fade-in lg:pt-6">
          <span className="rule-label text-care-700">{kicker}</span>
          <h1 className="mt-2 font-display text-4xl font-normal leading-tight text-ink-900 sm:text-5xl">{title}</h1>
          {blurb && <p className="mt-3 max-w-md text-ink-600">{blurb}</p>}
          {aside && <div className="mt-8 hidden lg:block">{aside}</div>}
        </header>
        <div className="pad animate-slide-up p-6 sm:p-8">{children}</div>
      </div>
    </div>
  )
}

/** A short list of reassurances beside a form. */
export function AsideList({ items }) {
  return (
    <ul className="space-y-4">
      {items.map(({ icon: Icon, title, desc }) => (
        <li key={title} className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-care-200 bg-care-50 text-care-700">
            <Icon size={17} />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-ink-900">{title}</p>
            <p className="text-sm leading-relaxed text-ink-600">{desc}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Field({ label, hint, error, children, optional = false }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="rule-label mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        {optional && <span className="normal-case tracking-normal text-ink-400">optional</span>}
      </label>
      {children(id)}
      {error
        ? <p className="mt-1.5 text-xs text-vital-700">{error}</p>
        : hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

export function TextField({ label, hint, error, optional, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {(id) => <input id={id} className="input-field" {...props} />}
    </Field>
  )
}

export function PasswordField({ label = 'Password', hint, error, ...props }) {
  const [show, setShow] = useState(false)
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => (
        <div className="relative">
          <input id={id} type={show ? 'text' : 'password'} className="input-field pr-12" {...props} />
          <button
            type="button" onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-400 hover:text-care-700"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      )}
    </Field>
  )
}

/**
 * Length matters most; variety helps. Mirrors the server's rule (10+ chars,
 * not a common password) without pretending to be a precise entropy estimate.
 */
export function PasswordMeter({ password }) {
  if (!password) return null
  let score = 0
  if (password.length >= 10) score++
  if (password.length >= 14) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++
  if (password.length < 10) score = 0
  const labels = ['Too short — at least 10 characters', 'Acceptable', 'Good', 'Strong', 'Very strong']
  const colors = ['bg-vital-500', 'bg-amber-500', 'bg-care-400', 'bg-care-600', 'bg-care-700']
  return (
    <div className="-mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < Math.max(score, 1) ? colors[score] : 'bg-ink-200'}`} />
        ))}
      </div>
      <p className={`mt-1 text-xs ${score === 0 ? 'text-vital-700' : 'text-ink-500'}`}>{labels[score]}</p>
    </div>
  )
}

/** One code box: digits only, mono, autofill-friendly for SMS/email codes. */
export function CodeField({ label = 'Code', hint, value, onChange, autoFocus = true, length = 6 }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id} value={value} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
          inputMode="numeric" autoComplete="one-time-code" placeholder={'•'.repeat(length)}
          className="input-field data text-center text-2xl tracking-[0.5em]"
        />
      )}
    </Field>
  )
}

export function Alert({ kind = 'error', title, children }) {
  const styles = {
    error:   ['border-vital-200 bg-vital-50 text-vital-800', AlertCircle],
    success: ['border-care-200 bg-care-50 text-care-800', CheckCircle2],
    info:    ['border-ink-200 bg-ink-50 text-ink-700', Info],
    warn:    ['border-amber-200 bg-amber-50 text-amber-900', AlertCircle],
  }
  const [cls, Icon] = styles[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'}
         className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  )
}

/** Segmented control in the navbar's active-pill style. */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-lg border border-ink-200 bg-ink-50 p-1"
         style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(({ value: v, label: l, icon: Icon }) => (
        <button
          key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
            value === v ? 'bg-white text-care-800 shadow-clinical ring-1 ring-inset ring-care-200'
                        : 'text-ink-600 hover:text-ink-900'}`}
        >
          {Icon && <Icon size={15} />}{l}
        </button>
      ))}
    </div>
  )
}

/**
 * Recovery codes are shown exactly once. Copy and download are the two ways
 * people actually keep them; both are offered.
 */
export function RecoveryCodes({ codes }) {
  const [copied, setCopied] = useState(false)
  const text = `PrescriptAI recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked */ }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'prescriptai-recovery-codes.txt' })
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="text-sm font-semibold text-amber-900">Save these recovery codes now</p>
      <p className="mt-0.5 text-xs text-amber-900/80">
        They are shown once. Each one works a single time — to sign in without your
        authenticator, or to reset a forgotten password.
      </p>
      <ol className="data mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-ink-900">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ol>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={copy} className="btn-ghost border border-ink-200 bg-white">
          {copied ? <Check size={15} className="text-care-700" /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={download} className="btn-ghost border border-ink-200 bg-white">
          <Download size={15} /> Download .txt
        </button>
      </div>
    </div>
  )
}
