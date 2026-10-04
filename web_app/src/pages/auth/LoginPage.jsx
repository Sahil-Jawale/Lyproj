import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { LogIn, Loader2, KeyRound, Smartphone, Cookie, ShieldCheck, ArrowLeft } from 'lucide-react'
import { AuthShell, AsideList, TextField, PasswordField, CodeField, Alert } from '../../components/auth/AuthUI'
import { login, loginMfa, ROLE_HOME } from '../../services/auth'
import { apiError } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'

const ASIDE = [
  { icon: KeyRound, title: 'One account, three roles', desc: 'Doctors, patients and pharmacies sign in here. Each sees only what their role needs.' },
  { icon: Cookie, title: 'Sessions you control', desc: 'Sign-in lives in a secure cookie this page cannot read. End any session from Account settings.' },
  { icon: ShieldCheck, title: 'Two-step verification', desc: 'Turn on an authenticator app so a stolen password alone is not enough.' },
]

export default function LoginPage() {
  const location = useLocation()
  const { status, user, setUser, expired } = useAuthStore()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Signing in only updates the store; the redirect below does the navigation,
  // back to the page that asked for a login or to the role's home.
  const done = (u) => setUser(u)

  if (status === 'authed' && user) {
    return <Navigate to={location.state?.from || ROLE_HOME[user.role] || '/'} replace />
  }

  const submitPassword = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await login(identifier, password)
      if (res.status === 'mfa_required') { setChallenge(res.challenge); setPassword('') }
      else done(res.user)
    } catch (err) {
      setError(apiError(err))
    } finally { setBusy(false) }
  }

  const submitCode = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await loginMfa(challenge, useRecovery ? { recoveryCode } : { code })
      done(res.user)
    } catch (err) {
      const msg = apiError(err)
      // The challenge is dead (expired or too many tries): back to the password.
      if (/password again/i.test(msg)) { setChallenge(null); setCode(''); setRecoveryCode('') }
      setError(msg)
    } finally { setBusy(false) }
  }

  return (
    <AuthShell
      kicker="Sign in"
      title={challenge ? 'Two-step verification' : 'Welcome back'}
      blurb={challenge
        ? 'Your password was right. Now confirm it is you with your authenticator app.'
        : 'Sign in with your email, phone number or username.'}
      aside={<AsideList items={ASIDE} />}
    >
      {!challenge ? (
        <form onSubmit={submitPassword} className="space-y-5" noValidate>
          {expired && !error && <Alert kind="info" title="Your session ended">Sign in again to continue.</Alert>}
          {location.state?.reset && !error && (
            <Alert kind="success" title="Password reset">Sign in with your new password. Other sessions were signed out.</Alert>
          )}
          {error && <Alert>{error}</Alert>}
          <TextField
            label="Email, phone or username" value={identifier} autoFocus required
            onChange={(e) => setIdentifier(e.target.value)} autoComplete="username"
            placeholder="you@clinic.in · +91 98765 43210 · username"
          />
          <PasswordField
            value={password} required onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <div className="-mt-2 text-right">
            <Link to="/forgot-password" state={{ identifier }} className="text-sm font-medium text-care-700 hover:text-care-800">
              Forgot password?
            </Link>
          </div>
          <button type="submit" disabled={busy || !identifier || !password} className="btn-primary w-full">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Sign in
          </button>
          <p className="border-t border-ink-200 pt-5 text-center text-sm text-ink-600">
            New to PrescriptAI?{' '}
            <Link to="/register" className="font-semibold text-care-700 hover:text-care-800">Create an account</Link>
          </p>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-5" noValidate>
          {error && <Alert>{error}</Alert>}
          {!useRecovery ? (
            <CodeField
              label="Authenticator code" value={code} onChange={setCode}
              hint="The 6-digit code in your authenticator app for PrescriptAI."
            />
          ) : (
            <TextField
              label="Recovery code" value={recoveryCode} autoFocus className="input-field data tracking-wider"
              onChange={(e) => setRecoveryCode(e.target.value)} placeholder="xxxxx-xxxxx"
              hint="Each recovery code works once."
            />
          )}
          <button type="submit" disabled={busy || (useRecovery ? !recoveryCode : code.length !== 6)} className="btn-primary w-full">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />} Verify and sign in
          </button>
          <div className="flex items-center justify-between border-t border-ink-200 pt-4 text-sm">
            <button type="button" onClick={() => { setChallenge(null); setError(null); setCode('') }} className="btn-ghost -ml-3">
              <ArrowLeft size={15} /> Back
            </button>
            <button type="button" onClick={() => { setUseRecovery((v) => !v); setError(null) }}
                    className="inline-flex items-center gap-1.5 font-medium text-care-700 hover:text-care-800">
              {useRecovery ? <><Smartphone size={15} /> Use authenticator</> : <><KeyRound size={15} /> Use a recovery code</>}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
