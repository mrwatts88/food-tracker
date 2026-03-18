import axios from 'axios'
import type {
  CalorieEntry,
  QuickAddFood,
  TDEEResponse,
  WeightEntry
} from '@/types'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Calorie API
export const calorieApi = {
  getEntries: () => api.get<CalorieEntry[]>('/calories'),
  addEntry: (amount: number) => api.post<CalorieEntry>('/calories', { amount }),
  deleteEntry: (id: number) => api.delete(`/calories/${id}`)
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

// Quick Add API
export const quickAddApi = {
  getFoods: () => api.get<QuickAddFood[]>('/quickadd'),
  createFood: (food: Omit<QuickAddFood, 'id' | 'createdAt'>) => api.post('/quickadd', food),
  updateFood: (id: number, food: Omit<QuickAddFood, 'id' | 'createdAt'>) => api.put(`/quickadd/${id}`, food),
  deleteFood: (id: number) => api.delete(`/quickadd/${id}`),
  consumeFood: (id: number, multiplier: number) => api.post(`/quickadd/${id}/consume`, { multiplier })
}
