import { Link } from 'react-router-dom'
import {
  FileText, ShieldPlus, Share2, ScanBarcode, KeyRound, BadgeCheck, ShieldCheck, ChevronRight,
  CheckCircle2, Circle, Clock,
} from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'

/**
 * Landing pages for the two stakeholders whose product surface is not built
 * yet (Workflow.md §9). They say so plainly. Showing sample prescriptions here
 * would be the same fabricated-result mistake the doctor screens were cleaned
 * of — so there are none.
 */
const CONTENT = {
  patient: {
    kicker: 'Patient',
    title: 'Your prescriptions',
    blurb: 'Once a doctor finalises a prescription for your phone number, it appears here.',
    coming: [
      { icon: FileText, title: 'Read and download', desc: 'Your medicines, dosage and duration, with the original handwritten page. (Workflow stage 4)' },
      { icon: ShieldPlus, title: 'Understand interactions', desc: 'Plain-language warnings for medicines that should not be combined, and what was not checked.' },
      { icon: Share2, title: 'Share with a pharmacy', desc: 'Give the chemist a one-time code for 15 minutes of read-only access. (Stage 5)' },
    ],
  },
  chemist: {
    kicker: 'Pharmacy',
    title: 'Dispensing desk',
    blurb: 'Enter the one-time code a patient gives you to open their prescription for 15 minutes.',
    coming: [
      { icon: KeyRound, title: 'Redeem a patient code', desc: 'Read-only access to one prescription, ending automatically. (Workflow stages 5 and 7)' },
      { icon: ScanBarcode, title: 'Verify each pack', desc: 'Scan the pack QR or photograph the label; get match, substitute or mismatch. (Stage 6)' },
      { icon: FileText, title: 'Dispensing record', desc: 'A minimal record of what was dispensed, without the patient’s personal details.' },
    ],
  },
}

export default function RoleHomePage({ role }) {
  const { user } = useAuthStore()
  const c = CONTENT[role]
  const verified = user.email_verified || user.phone_verified

  const checklist = [
    { done: true, label: 'Account created' },
    { done: verified, label: 'Email or phone verified', hint: 'Lets you reset a forgotten password.' },
    { done: user.mfa_enabled, label: 'Two-step verification on', hint: 'A stolen password alone will not get in.' },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <header className="mb-9 animate-fade-in">
        <span className="rule-label text-care-700">{c.kicker}</span>
        <h1 className="mt-2 font-display text-4xl font-normal text-ink-900">{c.title}</h1>
        <p className="mt-2 max-w-xl text-ink-600">
          Signed in as <span className="font-medium text-ink-900">{user.full_name}</span>
          {role === 'chemist' && user.profile.pharmacy_name && <> · {user.profile.pharmacy_name}</>}. {c.blurb}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="pad animate-slide-up p-6">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-600" />
            <span className="rule-label text-amber-800">Coming next</span>
          </div>
          <p className="mt-2 text-sm text-ink-600">
            Your account is ready. These features are designed but not built yet — nothing here is placeholder data.
          </p>
          <ul className="mt-5 space-y-4">
            {c.coming.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-care-200 bg-care-50 text-care-700">
                  <Icon size={18} />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
                  <p className="text-sm leading-relaxed text-ink-600">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-6">
          <section className="card animate-slide-up" style={{ animationDelay: '.08s' }}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-care-700" />
              <h2 className="font-display text-xl font-semibold text-ink-900">Secure your account</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {checklist.map(({ done, label, hint }) => (
                <li key={label} className="flex gap-2.5">
                  {done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-care-600" />
                        : <Circle size={18} className="mt-0.5 shrink-0 text-ink-300" />}
                  <div>
                    <p className={`text-sm font-medium ${done ? 'text-ink-900' : 'text-ink-700'}`}>{label}</p>
                    {!done && hint && <p className="text-xs text-ink-500">{hint}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <Link to="/account" className="btn-secondary mt-5 w-full py-2.5">
              <BadgeCheck size={16} /> Account and security <ChevronRight size={15} />
            </Link>
          </section>

          <Link to="/interactions" className="card-link block">
            <ShieldPlus size={18} className="text-care-600" />
            <p className="mt-3 font-display text-lg font-semibold text-ink-900">Check an interaction</p>
            <p className="mt-1 text-sm text-ink-600">Look up two or more medicines by generic name against 180 cited rules.</p>
          </Link>
        </aside>
      </div>
    </div>
  )
}
