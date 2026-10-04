import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { MailCheck, Loader2, RotateCw, Terminal } from 'lucide-react'
import { AuthShell, CodeField, Alert } from '../../components/auth/AuthUI'
import { confirmVerification, sendVerification, ROLE_HOME } from '../../services/auth'
import { apiError } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'

/** Confirm an email or phone with the 6-digit code sent to it. */
export default function VerifyPage() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { user, setUser } = useAuthStore()

  const channel = state?.channel
    || (user?.email && !user.email_verified ? 'email' : user?.phone && !user.phone_verified ? 'phone' : null)

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(state?.sentTo ? `Code sent to ${state.sentTo}.` : null)
  const [cooldown, setCooldown] = useState(state?.sentTo ? 60 : 0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const home = ROLE_HOME[user?.role] || '/'
  if (!channel || (channel === 'email' ? user?.email_verified : user?.phone_verified)) {
    return <Navigate to={state?.welcome ? home : '/account'} replace />
  }
  const what = channel === 'email' ? 'email address' : 'phone number'
  const destination = channel === 'email' ? user.email : user.phone

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      setUser(await confirmVerification(channel, code))
      navigate(state?.welcome ? home : '/account', { replace: true, state: { verified: channel } })
    } catch (err) {
      setError(apiError(err)); setCode('')
    } finally { setBusy(false) }
  }

  const resend = async () => {
    setError(null)
    try {
      const res = await sendVerification(channel)
      setNotice(`New code sent to ${res.sent_to}.`)
      setCooldown(60)
    } catch (err) {
      setError(apiError(err))
      const wait = Number(err?.response?.headers?.['retry-after'])
      if (wait) setCooldown(wait)
    }
  }

  return (
    <AuthShell
      kicker={state?.welcome ? 'Account created · one more step' : 'Verify'}
      title={`Confirm your ${what}`}
      blurb={`Enter the 6-digit code we sent to ${destination}. It expires in 10 minutes.`}
      aside={
        <Alert kind="info" title="Running locally?">
          <span className="inline-flex items-center gap-1.5"><Terminal size={14} /> Without SMTP or an SMS provider configured,</span>{' '}
          codes are printed in the backend terminal instead of being sent.
        </Alert>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        {notice && !error && <Alert kind="success">{notice}</Alert>}
        {error && <Alert>{error}</Alert>}
        <CodeField label="Verification code" value={code} onChange={setCode} />
        <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <MailCheck size={18} />} Verify {what}
        </button>
        <div className="flex items-center justify-between border-t border-ink-200 pt-4 text-sm">
          <button type="button" onClick={resend} disabled={cooldown > 0}
                  className="inline-flex items-center gap-1.5 font-medium text-care-700 hover:text-care-800 disabled:text-ink-400">
            <RotateCw size={15} /> {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
          <button type="button" onClick={() => navigate(state?.welcome ? home : '/account', { replace: true })}
                  className="btn-ghost -mr-3">
            Do this later
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
