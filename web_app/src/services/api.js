import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE, timeout: 30000 })

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

export const checkInteractions = async (medicines) => {
  const { data } = await api.post('/api/interactions/check', { medicines })
  return data
}

export const getStats = async () => {
  const { data } = await api.get('/api/stats')
  return data
}

export const getMedicines = async () => {
  const { data } = await api.get('/api/medicines')
  return data
}

export const getMedicineInteractions = async (name) => {
  const { data } = await api.get(`/api/medicines/${name}/interactions`)
  return data
}

export default api
