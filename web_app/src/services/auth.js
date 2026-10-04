import api from './api'

/**
 * Auth endpoints (backend/auth/routes.py). The session lives in an HttpOnly
 * cookie set by the API — nothing here stores a token, and nothing can.
 */

const post = async (url, body) => (await api.post(url, body)).data

export const register = (payload) => post('/api/auth/register', payload)
export const login = (identifier, password) => post('/api/auth/login', { identifier, password })
export const loginMfa = (challenge, { code, recoveryCode }) =>
  post('/api/auth/login/mfa', { challenge, code: code || null, recovery_code: recoveryCode || null })
export const logout = () => post('/api/auth/logout')

export const getMe = async () => (await api.get('/api/auth/me')).data
export const updateMe = async (payload) => (await api.patch('/api/auth/me', payload)).data
export const setContact = async (channel, value, password) =>
  (await api.put('/api/auth/me/contact', { channel, value, password })).data

export const sendVerification = (channel) => post('/api/auth/verify/send', { channel })
export const confirmVerification = (channel, code) => post('/api/auth/verify/confirm', { channel, code })

export const forgotPassword = (identifier, channel) =>
  post('/api/auth/password/forgot', { identifier, channel: channel || null })
export const resetPassword = ({ identifier, code, recoveryCode, newPassword }) =>
  post('/api/auth/password/reset', {
    identifier, new_password: newPassword, code: code || null, recovery_code: recoveryCode || null,
  })
export const changePassword = (currentPassword, newPassword) =>
  post('/api/auth/password/change', { current_password: currentPassword, new_password: newPassword })

export const mfaSetup = () => post('/api/auth/mfa/setup')
export const mfaEnable = (code) => post('/api/auth/mfa/enable', { code })
export const mfaDisable = (password, { code, recoveryCode }) =>
  post('/api/auth/mfa/disable', { password, code: code || null, recovery_code: recoveryCode || null })
export const regenerateRecoveryCodes = (password) => post('/api/auth/recovery-codes', { password })

export const getSessions = async () => (await api.get('/api/auth/sessions')).data
export const revokeSession = async (id) => (await api.delete(`/api/auth/sessions/${id}`)).data
export const revokeOtherSessions = () => post('/api/auth/sessions/revoke-others')

/** Where each stakeholder lands after signing in (Workflow.md §2). */
export const ROLE_HOME = { doctor: '/upload', patient: '/patient', chemist: '/pharmacy' }

export const ROLE_LABEL = { doctor: 'Doctor', patient: 'Patient', chemist: 'Pharmacy' }
