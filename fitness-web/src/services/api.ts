import axios from 'axios'
import type { CalorieEntry, ProteinEntry, TDEEResponse, UnlockStatus, WeightEntry } from '@/types'

const apiBaseUrl = import.meta.env.DEV
  ? import.meta.env.VITE_API_BASE_URL || '/api'
  : '/api'

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Calorie API
export const calorieApi = {
  getEntries: () => api.get<CalorieEntry[]>('/calories'),
  getUnlockStatus: () => api.get<UnlockStatus>('/calories/unlock-status'),
  addEntry: (amount: number) => api.post<CalorieEntry>('/calories', { amount }),
  deleteEntry: (id: number) => api.delete(`/calories/${id}`)
}

// Protein API
export const proteinApi = {
  getEntries: () => api.get<ProteinEntry[]>('/protein'),
  addEntry: (amount: number) => api.post<ProteinEntry>('/protein', { amount }),
  deleteEntry: (id: number) => api.delete(`/protein/${id}`)
}

// Weight API
export const weightApi = {
  getEntries: () => api.get<WeightEntry[]>('/weight'),
  addEntry: (amount: number) => api.post<WeightEntry>('/weight', { amount }),
  deleteEntry: (date: string) => api.delete(`/weight/${date}`)
}

// TDEE API
export const tdeeApi = {
  getTDEE: () => api.get<TDEEResponse>('/tdee')
}
