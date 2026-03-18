export type Mode = 'calorie' | 'weight' | 'stats'

export type DisplayMode = 'consumed' | 'remaining' | 'goal'

export interface CalorieEntry {
  id: number
  amount: number
  createdAt: string // YYYY-MM-DD HH:MM:SS
}

export interface WeightEntry {
  amount: number
  createdAt: string // YYYY-MM-DD
}

export interface TDEEResponse {
  amount: number
  lossIn2Weeks: number
  eatenPerDay: number
}

export interface QuickAddFood {
  id: number
  name: string
  unit: string
  amount: number
  calories: number
  fatGrams: number
  carbsGrams: number
  proteinGrams: number
  sugarGrams: number
  createdAt: string
}
