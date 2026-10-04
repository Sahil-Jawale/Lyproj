import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import {
  UserRound, Mail, Phone, AtSign, KeyRound, ShieldCheck, ShieldOff, MonitorSmartphone, LogOut,
  Loader2, BadgeCheck, CircleAlert, Pencil, Save, RefreshCw,
} from 'lucide-react'
import {
  TextField, PasswordField, PasswordMeter, CodeField, Alert, RecoveryCodes, Segmented,
} from '../../components/auth/AuthUI'
import {
  changePassword, getSessions, mfaDisable, mfaEnable, mfaSetup, regenerateRecoveryCodes,
  revokeOtherSessions, revokeSession, sendVerification, setContact, updateMe, ROLE_LABEL,
} from '../../services/auth'
import { apiError } from '../../services/api'
import { useAuthStore } from '../../store/useAuthStore'

const PROFILE_LABELS = {
  speciality: 'Speciality', clinic_address: 'Clinic address', registration_no: 'Registration no.',
  pharmacy_name: 'Pharmacy name', pharmacy_address: 'Pharmacy address', drug_licence_no: 'Drug licence no.',
}
const PROFILE_KEYS = {
  doctor: ['speciality', 'clinic_address', 'registration_no'],
  chemist: ['pharmacy_name', 'pharmacy_address', 'drug_licence_no'],
  patient: [],
}

function Section({ icon: Icon, title, desc, children, action }) {
  return (
    <section className="card animate-slide-up">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-care-200 bg-care-50 text-care-700">
            <Icon size={18} />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2>
            {desc && <p className="mt-0.5 text-sm text-ink-600">{desc}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const Verified = ({ ok }) => ok
  ? <span className="chip border-care-200 bg-care-50 text-care-800"><BadgeCheck size={13} /> Verified</span>
  : <span className="chip border-amber-200 bg-amber-50 text-amber-900"><CircleAlert size={13} /> Not verified</span>

// ─── profile ────────────────────────────────────────────────────────────────

function ProfileSection({ user, setUser }) {
  const keys = PROFILE_KEYS[user.role] || []
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.full_name)
  const [profile, setProfile] = useState(user.profile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { setUser(await updateMe({ full_name: name, profile })); setEditing(false) }
    catch (err) { setError(apiError(err)) }
    finally { setBusy(false) }
  }

  return (
    <Section
      icon={UserRound} title={user.full_name}
      desc={<span className="chip mt-1">{ROLE_LABEL[user.role]} account</span>}
      action={!editing && (
        <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={15} /> Edit</button>
      )}
    >
      {editing ? (
        <form onSubmit={save} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          {keys.map((k) => (
            <TextField key={k} label={PROFILE_LABELS[k]} value={profile[k] || ''}
                       onChange={(e) => setProfile((p) => ({ ...p, [k]: e.target.value }))} />
          ))}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary py-2.5">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
            </button>
            <button type="button" onClick={() => { setEditing(false); setName(user.full_name); setProfile(user.profile) }}
                    className="btn-secondary py-2.5">Cancel</button>
          </div>
        </form>
      ) : keys.length ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {keys.map((k) => (
            <div key={k}>
              <dt className="rule-label">{PROFILE_LABELS[k]}</dt>
              <dd className="mt-0.5 text-ink-900">{user.profile[k] || <span className="text-ink-400">—</span>}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-ink-600">Member since {new Date(user.created_at).toLocaleDateString()}.</p>
      )}
    </Section>
  )
}

// ─── sign-in & contact ──────────────────────────────────────────────────────

function ContactRow({ channel, user, setUser }) {
  const navigate = useNavigate()
  const value = user[channel]
  const verified = user[`${channel}_verified`]
  const Icon = channel === 'email' ? Mail : Phone
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const verify = async () => {
    setError(null)
    try {
      const res = await sendVerification(channel)
      navigate('/verify', { state: { channel, sentTo: res.sent_to } })
    } catch (err) {
      // A code may already be on its way (resend cooldown): go and enter it.
      if (err?.response?.status === 429) navigate('/verify', { state: { channel } })
      else setError(apiError(err))
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const u = await setContact(channel, draft, password)
      setUser(u)
      navigate('/verify', { state: { channel } })
    } catch (err) { setError(apiError(err)) }
    finally { setBusy(false) }
  }

  return (
    <div className="border-t border-ink-100 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon size={17} className="shrink-0 text-ink-500" />
          <div className="min-w-0">
            <p className="rule-label">{channel === 'email' ? 'Email' : 'Phone'}</p>
            <p className={`truncate ${value ? 'text-ink-900' : 'text-ink-400'}`}>{value || 'Not added'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {value && <Verified ok={verified} />}
          {value && !verified && <button onClick={verify} className="btn-ghost text-care-700">Verify</button>}
          {!editing && (
            <button onClick={() => { setEditing(true); setDraft(value || '') }} className="btn-ghost">
              {value ? 'Change' : 'Add'}
            </button>
          )}
        </div>
      </div>
      {error && !editing && <div className="mt-3"><Alert>{error}</Alert></div>}
      {editing && (
        <form onSubmit={save} className="mt-4 space-y-3 rounded-xl border border-ink-200 bg-ink-50/60 p-4">
          {error && <Alert>{error}</Alert>}
          <TextField label={channel === 'email' ? 'New email address' : 'New mobile number'} value={draft}
                     type={channel === 'email' ? 'email' : 'tel'} autoFocus onChange={(e) => setDraft(e.target.value)} />
          <PasswordField label="Current password" value={password} onChange={(e) => setPassword(e.target.value)}
                         autoComplete="current-password"
                         hint="Needed because this becomes a way to recover your account." />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !draft || !password} className="btn-primary py-2.5">
              {busy && <Loader2 size={16} className="animate-spin" />} Save and send code
            </button>
            <button type="button" onClick={() => { setEditing(false); setError(null); setPassword('') }}
                    className="btn-secondary py-2.5">Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

function ContactSection({ user, setUser }) {
  return (
    <Section icon={AtSign} title="Sign-in and recovery"
             desc="Any of these can be used to sign in. A verified email or phone is how you reset a forgotten password.">
      {user.username && (
        <div className="flex items-center gap-3 pb-4">
          <AtSign size={17} className="text-ink-500" />
          <div>
            <p className="rule-label">Username</p>
            <p className="data text-ink-900">{user.username}</p>
          </div>
        </div>
      )}
      <div className={user.username ? 'border-t border-ink-100 pt-4' : ''}>
        <ContactRow channel="email" user={user} setUser={setUser} />
        <ContactRow channel="phone" user={user} setUser={setUser} />
      </div>
    </Section>
  )
}

// ─── password ───────────────────────────────────────────────────────────────

function PasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (next !== confirm) return setError('The two passwords do not match.')
    setBusy(true); setError(null); setDone(null)
    try {
      const res = await changePassword(current, next)
      setDone(res.other_sessions_ended
        ? `Password changed. ${res.other_sessions_ended} other session(s) were signed out.`
        : 'Password changed.')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) { setError(apiError(err)) }
    finally { setBusy(false) }
  }

  return (
    <Section icon={KeyRound} title="Password" desc="Changing it signs out every other device.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {done && <Alert kind="success">{done}</Alert>}
        <PasswordField label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)}
                       autoComplete="current-password" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-4">
            <PasswordField label="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <PasswordMeter password={next} />
          </div>
          <PasswordField label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                         autoComplete="new-password" error={confirm && confirm !== next ? 'Does not match.' : null} />
        </div>
        <button type="submit" disabled={busy || !current || !next || next !== confirm} className="btn-primary py-2.5">
          {busy && <Loader2 size={16} className="animate-spin" />} Change password
        </button>
      </form>
    </Section>
  )
}

// ─── MFA ────────────────────────────────────────────────────────────────────

function MfaSection({ user, refresh }) {
  const [mode, setMode] = useState(null) // setup | disable | regenerate
  const [setup, setSetup] = useState(null)
  const [qr, setQr] = useState(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [via, setVia] = useState('code')
  const [recovery, setRecovery] = useState('')
  const [codes, setCodes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const reset = () => { setMode(null); setSetup(null); setQr(null); setCode(''); setPassword(''); setRecovery(''); setError(null) }

  const start = async () => {
    reset(); setCodes(null); setBusy(true)
    try {
      const s = await mfaSetup()
      setSetup(s)
      setQr(await QRCode.toDataURL(s.otpauth_uri, { margin: 1, width: 196, color: { dark: '#0F443E', light: '#FFFFFF' } }))
      setMode('setup')
    } catch (err) { setError(apiError(err)) }
    finally { setBusy(false) }
  }

  const run = (fn) => async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await fn() } catch (err) { setError(apiError(err)) } finally { setBusy(false) }
  }

  const enable = run(async () => {
    const res = await mfaEnable(code)
    reset(); setCodes(res.recovery_codes); await refresh()
  })
  const disable = run(async () => {
    await mfaDisable(password, via === 'code' ? { code } : { recoveryCode: recovery })
    reset(); setCodes(null); await refresh()
  })
  const regenerate = run(async () => {
    const res = await regenerateRecoveryCodes(password)
    reset(); setCodes(res.recovery_codes); await refresh()
  })

  return (
    <Section
      icon={user.mfa_enabled ? ShieldCheck : ShieldOff} title="Two-step verification"
      desc="After your password, sign-in asks for a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password …)."
      action={<span className={`chip shrink-0 ${user.mfa_enabled ? 'border-care-200 bg-care-50 text-care-800' : ''}`}>
        {user.mfa_enabled ? 'On' : 'Off'}</span>}
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {codes && <RecoveryCodes codes={codes} />}

        {!user.mfa_enabled && mode !== 'setup' && (
          <button onClick={start} disabled={busy} className="btn-primary py-2.5">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Set up authenticator
          </button>
        )}

        {mode === 'setup' && setup && (
          <form onSubmit={enable} className="grid gap-5 rounded-xl border border-ink-200 bg-ink-50/60 p-4 sm:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              {qr && <img src={qr} alt="QR code for your authenticator app" className="rounded-lg border border-ink-200 bg-white p-1" />}
            </div>
            <div className="space-y-4">
              <ol className="list-decimal space-y-1 pl-4 text-sm text-ink-700">
                <li>Scan the QR code with your authenticator app.</li>
                <li>Can't scan? Enter this key manually:
                  <span className="data mt-1 block break-all rounded-md border border-ink-200 bg-white px-2 py-1 text-xs text-ink-900">
                    {setup.secret.match(/.{1,4}/g).join(' ')}
                  </span>
                </li>
                <li>Type the 6-digit code it shows.</li>
              </ol>
              <CodeField label="Code from the app" value={code} onChange={setCode} />
              <div className="flex gap-2">
                <button type="submit" disabled={busy || code.length !== 6} className="btn-primary py-2.5">
                  {busy && <Loader2 size={16} className="animate-spin" />} Turn on
                </button>
                <button type="button" onClick={reset} className="btn-secondary py-2.5">Cancel</button>
              </div>
            </div>
          </form>
        )}

        {user.mfa_enabled && !mode && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600">
              <span className="data font-semibold text-ink-900">{user.recovery_codes_remaining}</span> unused recovery code(s).
            </p>
            <div className="flex gap-2">
              <button onClick={() => { reset(); setMode('regenerate') }} className="btn-ghost border border-ink-200">
                <RefreshCw size={15} /> New recovery codes
              </button>
              <button onClick={() => { reset(); setCodes(null); setMode('disable') }} className="btn-ghost border border-vital-200 text-vital-700 hover:bg-vital-50 hover:text-vital-800">
                Turn off
              </button>
            </div>
          </div>
        )}

        {!user.mfa_enabled && !mode && user.recovery_codes_remaining > 0 && (
          <p className="text-sm text-ink-600">
            <span className="data font-semibold text-ink-900">{user.recovery_codes_remaining}</span> unused recovery code(s) for password reset.{' '}
            <button onClick={() => { reset(); setMode('regenerate') }} className="font-medium text-care-700 hover:text-care-800">Generate new ones</button>
          </p>
        )}

        {mode === 'regenerate' && (
          <form onSubmit={regenerate} className="space-y-3 rounded-xl border border-ink-200 bg-ink-50/60 p-4">
            <p className="text-sm text-ink-700">Your old recovery codes stop working as soon as new ones are made.</p>
            <PasswordField label="Current password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !password} className="btn-primary py-2.5">
                {busy && <Loader2 size={16} className="animate-spin" />} Generate
              </button>
              <button type="button" onClick={reset} className="btn-secondary py-2.5">Cancel</button>
            </div>
          </form>
        )}

        {mode === 'disable' && (
          <form onSubmit={disable} className="space-y-3 rounded-xl border border-vital-200 bg-vital-50/50 p-4">
            <p className="text-sm text-vital-800">Turning this off means your password alone signs you in.</p>
            <PasswordField label="Current password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <Segmented label="Confirm with" value={via} onChange={setVia}
                       options={[{ value: 'code', label: 'Authenticator' }, { value: 'recovery', label: 'Recovery code' }]} />
            {via === 'code'
              ? <CodeField label="Authenticator code" value={code} onChange={setCode} autoFocus={false} />
              : <TextField label="Recovery code" value={recovery} placeholder="xxxxx-xxxxx" className="input-field data"
                           onChange={(e) => setRecovery(e.target.value)} />}
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !password || (via === 'code' ? code.length !== 6 : !recovery)}
                      className="inline-flex items-center gap-2 rounded-lg bg-vital-600 px-4 py-2.5 font-semibold text-white hover:bg-vital-700 disabled:opacity-40">
                {busy && <Loader2 size={16} className="animate-spin" />} Turn off
              </button>
              <button type="button" onClick={reset} className="btn-secondary py-2.5">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </Section>
  )
}

// ─── sessions ───────────────────────────────────────────────────────────────

function describeAgent(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : ua ? 'Browser' : 'Unknown device'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

function SessionsSection({ onSignedOut }) {
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { setSessions(await getSessions()) } catch (err) { setError(apiError(err)) }
  }
  useEffect(() => {
    let alive = true
    getSessions()
      .then((rows) => { if (alive) setSessions(rows) })
      .catch((err) => { if (alive) setError(apiError(err)) })
    return () => { alive = false }
  }, [])

  const revoke = async (s) => {
    setBusy(true)
    try { await revokeSession(s.id); if (s.current) onSignedOut(); else await load() }
    catch (err) { setError(apiError(err)) } finally { setBusy(false) }
  }
  const revokeOthers = async () => {
    setBusy(true)
    try { await revokeOtherSessions(); await load() } catch (err) { setError(apiError(err)) } finally { setBusy(false) }
  }

  const others = sessions?.filter((s) => !s.current).length || 0

  return (
    <Section icon={MonitorSmartphone} title="Where you're signed in"
             desc="Sessions end after an hour without activity, and 12 hours after sign-in at most."
             action={others > 0 && (
               <button onClick={revokeOthers} disabled={busy} className="btn-ghost shrink-0 border border-ink-200">
                 Sign out other sessions
               </button>
             )}>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {!sessions ? <Loader2 size={18} className="animate-spin text-care-700" /> : (
        <ul className="divide-y divide-ink-100">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="font-medium text-ink-900">
                  {describeAgent(s.user_agent)}
                  {s.current && <span className="chip ml-2 border-care-200 bg-care-50 text-care-800">This device</span>}
                </p>
                <p className="data text-xs text-ink-500">
                  {s.ip} · signed in {new Date(s.created_at).toLocaleString()} · last active {new Date(s.last_seen_at).toLocaleTimeString()}
                </p>
              </div>
              <button onClick={() => revoke(s)} disabled={busy} className="btn-ghost text-vital-700 hover:bg-vital-50">
                <LogOut size={15} /> {s.current ? 'Sign out' : 'End session'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function AccountPage() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { user, setUser, refresh, logout } = useAuthStore()

  const signOut = async () => { await logout(); navigate('/login', { replace: true }) }
  // A session revoked from the list is already gone server-side; just reset the UI.
  const signedOut = () => { useAuthStore.setState({ user: null, status: 'anon' }); navigate('/login', { replace: true }) }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <header className="mb-9 flex flex-wrap items-end justify-between gap-4 animate-fade-in">
        <div>
          <span className="rule-label text-care-700">Account</span>
          <h1 className="mt-2 font-display text-4xl font-normal text-ink-900">Account and security</h1>
          <p className="mt-2 max-w-xl text-ink-600">Your details, how you sign in, and every place you're signed in.</p>
        </div>
        <button onClick={signOut} className="btn-secondary"><LogOut size={17} /> Sign out</button>
      </header>

      <div className="space-y-6">
        {state?.verified && (
          <Alert kind="success">Your {state.verified === 'email' ? 'email address' : 'phone number'} is verified.</Alert>
        )}
        {!user.email_verified && !user.phone_verified && (
          <Alert kind="warn" title="No verified way to recover this account">
            Add and verify an email or phone below{user.recovery_codes_remaining ? ', or keep your recovery codes safe' : ''}.
            {(user.email || user.phone) && <>{' '}<Link to="/verify" className="font-semibold underline">Verify now</Link></>}
          </Alert>
        )}
        <ProfileSection user={user} setUser={setUser} />
        <ContactSection user={user} setUser={setUser} />
        <MfaSection user={user} refresh={refresh} />
        <PasswordSection />
        <SessionsSection onSignedOut={signedOut} />
      </div>
    </div>
  )
}
