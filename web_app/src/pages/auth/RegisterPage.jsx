import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  Stethoscope, User, Store, Mail, Phone, AtSign, UserPlus, Loader2, ArrowRight,
  BadgeCheck, LifeBuoy, Lock,
} from 'lucide-react'
import {
  AuthShell, AsideList, TextField, PasswordField, PasswordMeter, Segmented, Alert, RecoveryCodes,
} from '../../components/auth/AuthUI'
import { register, ROLE_HOME } from '../../services/auth'
import { apiError } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'

/** The stakeholders from Workflow.md §2, and what each one is asked for. */
const ROLES = [
  {
    value: 'doctor', label: 'Doctor', icon: Stethoscope,
    desc: 'Upload, review and sign off prescriptions.',
    fields: [
      { key: 'speciality', label: 'Speciality', placeholder: 'General Physician', required: true },
      { key: 'clinic_address', label: 'Clinic address', placeholder: '12 MG Road, Pune 411001', required: true },
      { key: 'registration_no', label: 'Medical registration number', placeholder: 'State council / NMC no.',
        hint: 'Pharmacies check this before dispensing.' },
    ],
  },
  {
    value: 'patient', label: 'Patient', icon: User,
    desc: 'See your prescriptions and share them with a pharmacy.',
    fields: [],
  },
  {
    value: 'chemist', label: 'Pharmacy', icon: Store,
    desc: 'Open shared prescriptions and verify what is dispensed.',
    fields: [
      { key: 'pharmacy_name', label: 'Pharmacy name', placeholder: 'Shah Medicals', required: true },
      { key: 'pharmacy_address', label: 'Pharmacy address', placeholder: 'FC Road, Pune 411004', required: true },
      { key: 'drug_licence_no', label: 'Drug licence number', placeholder: 'Form 20 / 21 licence no.' },
    ],
  },
]

const METHODS = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'username', label: 'Username', icon: AtSign },
]

const METHOD_FIELD = {
  email: { label: 'Email address', type: 'email', placeholder: 'you@clinic.in', autoComplete: 'email',
           hint: 'We will send a code to confirm it.' },
  phone: { label: 'Mobile number', type: 'tel', placeholder: '+91 98765 43210', autoComplete: 'tel',
           hint: 'We will text a code to confirm it. A 10-digit number is taken as Indian (+91).' },
  username: { label: 'Username', type: 'text', placeholder: 'asha.rao', autoComplete: 'username',
              hint: 'No email or phone means recovery codes are your only way back in — you will get them next.' },
}

const ASIDE = [
  { icon: Lock, title: 'Passwords are never stored', desc: 'Only a salted, memory-hard hash is kept. Nobody at PrescriptAI can read yours.' },
  { icon: BadgeCheck, title: 'Verified contact details', desc: 'An email or phone you have confirmed is how you get back in if you forget your password.' },
  { icon: LifeBuoy, title: 'Recovery codes', desc: 'One-time backup codes for when you have lost your phone or your inbox.' },
]

export default function RegisterPage() {
  const navigate = useNavigate()
  const { status, user, setUser } = useAuthStore()

  const [role, setRole] = useState('doctor')
  const [method, setMethod] = useState('email')
  const [identifier, setIdentifier] = useState('')
  const [fullName, setFullName] = useState('')
  const [profile, setProfile] = useState({})
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // set once the account exists

  // Already signed in and not mid-registration: nothing to do here.
  if (status === 'authed' && user && !result) return <Navigate to={ROLE_HOME[user.role] || '/'} replace />

  const roleDef = ROLES.find((r) => r.value === role)
  const mismatch = confirm && confirm !== password

  const pickRole = (r) => {
    setRole(r)
    // Patients are found by phone number in the workflow, so lead with it.
    if (r === 'patient' && method === 'email' && !identifier) setMethod('phone')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true); setError(null)
    try {
      const res = await register({
        role, full_name: fullName, password, [method]: identifier,
        profile: Object.fromEntries(roleDef.fields.map(({ key }) => [key, profile[key] || ''])),
      })
      setResult(res)
      setUser(res.user)
      if (!res.recovery_codes) {
        navigate('/verify', { replace: true, state: { channel: method, sentTo: res.verification_sent_to?.[0], welcome: true } })
      }
    } catch (err) {
      setError(apiError(err))
    } finally { setBusy(false) }
  }

  if (result?.recovery_codes) {
    return (
      <AuthShell kicker="Account created" title="Keep a way back in"
                 blurb="You signed up with a username only, so there is no email or phone to send a reset code to.">
        <div className="space-y-5">
          <RecoveryCodes codes={result.recovery_codes} />
          <Alert kind="info">
            You can add an email or phone number later in <span className="font-semibold">Account</span>, which gives you
            a second way to recover your account.
          </Alert>
          <button onClick={() => navigate(ROLE_HOME[result.user.role] || '/', { replace: true })} className="btn-primary w-full">
            I have saved them <ArrowRight size={18} />
          </button>
        </div>
      </AuthShell>
    )
  }

  const mf = METHOD_FIELD[method]

  return (
    <AuthShell
      kicker="Create account" title="Join PrescriptAI" wide
      blurb="Choose who you are, then how you want to sign in. You can add more contact details later."
      aside={<AsideList items={ASIDE} />}
    >
      <form onSubmit={submit} className="space-y-6" noValidate>
        {error && <Alert>{error}</Alert>}

        <fieldset>
          <legend className="rule-label mb-2">I am a</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {ROLES.map(({ value, label, icon: Icon, desc }) => {
              const active = role === value
              return (
                <button
                  key={value} type="button" onClick={() => pickRole(value)} aria-pressed={active}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    active ? 'border-care-400 bg-care-50 ring-2 ring-care-500/20' : 'border-ink-200 bg-white hover:border-care-300'}`}
                >
                  <Icon size={20} className={active ? 'text-care-700' : 'text-ink-500'} />
                  <p className="mt-2 font-display text-lg font-semibold text-ink-900">{label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{desc}</p>
                </button>
              )
            })}
          </div>
        </fieldset>

        <TextField label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)}
                   autoComplete="name" placeholder={role === 'doctor' ? 'Dr Asha Rao' : 'Your full name'} required />

        <div className="space-y-3">
          <span className="rule-label block">Sign in with</span>
          <Segmented label="Sign in with" options={METHODS} value={method}
                     onChange={(m) => { setMethod(m); setIdentifier('') }} />
          <TextField label={mf.label} type={mf.type} value={identifier} placeholder={mf.placeholder}
                     autoComplete={mf.autoComplete} hint={mf.hint} required
                     onChange={(e) => setIdentifier(e.target.value)} />
        </div>

        {roleDef.fields.length > 0 && (
          <div className="grid gap-4 border-t border-ink-200 pt-5 sm:grid-cols-2">
            {/* Short fields pair up on one row; addresses take a full row of their own. */}
            {[...roleDef.fields].sort((a, b) => a.key.endsWith('address') - b.key.endsWith('address'))
              .map(({ key, label, placeholder, required, hint }) => (
              <div key={key} className={key.endsWith('address') ? 'sm:col-span-2' : ''}>
                <TextField label={label} placeholder={placeholder} optional={!required} hint={hint}
                           value={profile[key] || ''} required={required}
                           onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 border-t border-ink-200 pt-5 sm:grid-cols-2">
          <div className="space-y-4">
            <PasswordField value={password} onChange={(e) => setPassword(e.target.value)}
                           autoComplete="new-password" hint="At least 10 characters. A short phrase works well." />
            <PasswordMeter password={password} />
          </div>
          <PasswordField label="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                         autoComplete="new-password" error={mismatch ? 'Does not match.' : null} />
        </div>

        <button type="submit" disabled={busy || !fullName || !identifier || !password || mismatch}
                className="btn-primary w-full">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />} Create {roleDef.label.toLowerCase()} account
        </button>
        <p className="text-center text-sm text-ink-600">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-care-700 hover:text-care-800">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  )
}
