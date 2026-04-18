import axios from 'axios'
import type {
  CalorieEntry,
  GoalConfigResponse,
  NutritionEntry,
  NutritionMetric,
  TDEEResponse,
  UnlockStatus,
  WeightEntry
} from '@/types'

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

const nutritionEndpoints: Record<NutritionMetric, string> = {
  protein: '/protein',
  sugar: '/sugar',
  caffeine: '/caffeine'
}

export const nutritionApi = {
  getEntries: (metric: NutritionMetric) => api.get<NutritionEntry[]>(nutritionEndpoints[metric]),
  getGoals: () => api.get<GoalConfigResponse>('/nutrition/goals'),
  addEntry: (metric: NutritionMetric, amount: number) =>
    api.post<NutritionEntry>(nutritionEndpoints[metric], { amount }),
  deleteEntry: (metric: NutritionMetric, id: number) =>
    api.delete(`${nutritionEndpoints[metric]}/${id}`)
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
