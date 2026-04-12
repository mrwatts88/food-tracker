export type Mode = 'calorie' | 'weight' | 'stats'
export type TrackMode = 'calorie' | 'protein'

export interface CalorieEntry {
  id: number
  amount: number
  createdAt: string // YYYY-MM-DD HH:MM:SS
}

export interface WeightEntry {
  amount: number
  createdAt: string // YYYY-MM-DD
}

export interface ProteinEntry {
  id: number
  amount: number
  createdAt: string // YYYY-MM-DD HH:MM:SS
}

export interface TDEEResponse {
  amount: number
  lossIn2Weeks: number
  eatenPerDay: number
}

export interface UnlockStatus {
  dailyTargetCalories: number
  consumedCalories: number
  unlockedCalories: number
  availableCalories: number
  overdrawCalories: number
  nextUnlockAt: string | null
  nextScheduledUnlockCalories: number
  nextEffectiveUnlockCalories: number
  allCaloriesUnlockedToday: boolean
  timezone: string
  serverNow: string
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
