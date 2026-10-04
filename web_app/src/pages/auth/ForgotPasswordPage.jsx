import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Send, Loader2, KeyRound, ArrowLeft, Mail, LifeBuoy, ShieldCheck } from 'lucide-react'
import {
  AuthShell, AsideList, TextField, PasswordField, PasswordMeter, CodeField, Segmented, Alert,
} from '../../components/auth/AuthUI'
import { forgotPassword, resetPassword } from '../../services/auth'
import { apiError } from '../../services/api'

const ASIDE = [
  { icon: Mail, title: 'Code to your email or phone', desc: 'If the account has one, a 6-digit code goes there. It expires in 10 minutes.' },
  { icon: LifeBuoy, title: 'Or a recovery code', desc: 'Signed up with a username only, or lost your phone? A recovery code works instead.' },
  { icon: ShieldCheck, title: 'Everywhere else is signed out', desc: 'Resetting ends every existing session. Two-step verification stays on.' },
]

/**
 * Account recovery. Step 1 never says whether an account exists — the API
 * answers identically either way — so this page cannot be used to probe for
 * registered emails or phone numbers.
 */
export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { state } = useLocation()

  const [step, setStep] = useState('request') // request | reset
  const [identifier, setIdentifier] = useState(state?.identifier || '')
  const [via, setVia] = useState('code')       // code | recovery
  const [code, setCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const request = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await forgotPassword(identifier)
      setNotice(res.message)
      setStep('reset')
    } catch (err) {
      setError(apiError(err))
    } finally { setBusy(false) }
  }

  const reset = async (e) => {
    e.preventDefault()
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true); setError(null)
    try {
      await resetPassword({ identifier, newPassword: password, ...(via === 'code' ? { code } : { recoveryCode }) })
      navigate('/login', { replace: true, state: { reset: true } })
    } catch (err) {
      setError(apiError(err))
    } finally { setBusy(false) }
  }

  return (
    <AuthShell
      kicker="Account recovery"
      title={step === 'request' ? 'Reset your password' : 'Choose a new password'}
      blurb={step === 'request'
        ? 'Enter the email, phone or username you sign in with.'
        : `Resetting the password for ${identifier}.`}
      aside={<AsideList items={ASIDE} />}
    >
      {step === 'request' ? (
        <form onSubmit={request} className="space-y-5" noValidate>
          {error && <Alert>{error}</Alert>}
          <TextField label="Email, phone or username" value={identifier} autoFocus
                     onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" />
          <button type="submit" disabled={busy || !identifier} className="btn-primary w-full">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Send reset code
          </button>
          <button type="button" onClick={() => { setStep('reset'); setVia('recovery'); setNotice(null) }}
                  disabled={!identifier}
                  className="w-full text-center text-sm font-medium text-care-700 hover:text-care-800 disabled:text-ink-400">
            I have a recovery code instead
          </button>
          <p className="border-t border-ink-200 pt-5 text-center text-sm">
            <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-ink-600 hover:text-ink-900">
              <ArrowLeft size={15} /> Back to sign in
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-5" noValidate>
          {notice && !error && <Alert kind="info">{notice}</Alert>}
          {error && <Alert>{error}</Alert>}
          <Segmented label="Verify with" value={via} onChange={(v) => { setVia(v); setError(null) }}
                     options={[{ value: 'code', label: 'Reset code', icon: Mail },
                               { value: 'recovery', label: 'Recovery code', icon: KeyRound }]} />
          {via === 'code'
            ? <CodeField label="Reset code" value={code} onChange={setCode} />
            : <TextField label="Recovery code" value={recoveryCode} autoFocus placeholder="xxxxx-xxxxx"
                         className="input-field data tracking-wider" onChange={(e) => setRecoveryCode(e.target.value)} />}
          <PasswordField label="New password" value={password} onChange={(e) => setPassword(e.target.value)}
                         autoComplete="new-password" />
          <PasswordMeter password={password} />
          <PasswordField label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                         autoComplete="new-password" error={confirm && confirm !== password ? 'Does not match.' : null} />
          <button type="submit"
                  disabled={busy || !password || password !== confirm || (via === 'code' ? code.length !== 6 : !recoveryCode)}
                  className="btn-primary w-full">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />} Reset password
          </button>
          <div className="flex justify-between border-t border-ink-200 pt-4 text-sm">
            <button type="button" onClick={() => { setStep('request'); setError(null) }} className="btn-ghost -ml-3">
              <ArrowLeft size={15} /> Start over
            </button>
            {via === 'code' && (
              <button type="button" onClick={request} disabled={busy}
                      className="font-medium text-care-700 hover:text-care-800">Send a new code</button>
            )}
          </div>
        </form>
      )}
    </AuthShell>
  )
}
