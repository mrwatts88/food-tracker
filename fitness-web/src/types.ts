export type Mode = 'calorie' | 'stats'
export type TrackMode = 'calorie' | 'nutrition' | 'weight'
export type NutritionMetric = 'protein' | 'sugar' | 'caffeine'

export interface CalorieEntry {
  id: number
  amount: number
  createdAt: string // YYYY-MM-DD HH:MM:SS
}

export interface WeightEntry {
  amount: number
  createdAt: string // YYYY-MM-DD
}

export interface NutritionEntry {
  id: number
  amount: number
  createdAt: string // YYYY-MM-DD HH:MM:SS
}

export interface TDEEResponse {
  amount: number
  lossIn2Weeks: number
  eatenPerDay: number
  goalWeight: number
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
  noBorrowUnlockStreak: number
  timezone: string
  serverNow: string
}
