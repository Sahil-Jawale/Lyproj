import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// A real VLM read takes 10-30s on a dense page. The old 30s default was long
// enough to time out on exactly the prescriptions that matter most.
const api = axios.create({ baseURL: API_BASE, timeout: 120000 })

export const uploadPrescription = async (file) => {
  const formData = new FormData()
  formData.append('image', file)
  const { data } = await api.post('/api/prescriptions/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const getPrescriptions = async (limit = 20, offset = 0) => {
  const { data } = await api.get('/api/prescriptions', { params: { limit, offset } })
  return data
}

export const getPrescription = async (id) => {
  const { data } = await api.get(`/api/prescriptions/${id}`)
  return data
}

/**
 * Record one doctor edit.
 * This is the clinical audit trail AND the training corpus (§8.3) — the
 * backend stores the model's original value alongside the correction, so the
 * before/after pair survives even after the UI shows the corrected value.
 */
export const submitCorrection = async (prescriptionId, correction) => {
  const { data } = await api.post(
    `/api/prescriptions/${prescriptionId}/corrections`,
    correction,
  )
  return data
}

/** Confirm a page. An unchanged page is a fully labelled page — the majority class. */
export const markReviewed = async (prescriptionId, reviewedBy = 'doctor') => {
  const { data } = await api.post(
    `/api/prescriptions/${prescriptionId}/review`,
    null,
    { params: { reviewed_by: reviewedBy } },
  )
  return data
}

export const getCorrections = async (limit = 100) => {
  const { data } = await api.get('/api/corrections', { params: { limit } })
  return data
}

/**
 * Ad-hoc interaction lookup by GENERIC name.
 * Bypasses S2/S3 — the caller asserts the names are right. The prescription
 * pipeline does not use this; it backs the manual lookup screen.
 */
export const checkInteractions = async (medicines) => {
  const { data } = await api.post('/api/interactions/check', { medicines })
  return data
}

export const getStats = async () => {
  const { data } = await api.get('/api/stats')
  return data
}

export const getHealth = async () => {
  const { data } = await api.get('/api/health')
  return data
}

export const imageUrl = (path) => (path ? `${API_BASE}${path}` : null)

export default api
