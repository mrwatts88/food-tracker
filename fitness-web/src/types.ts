export type Mode = 'calorie' | 'stats'
export type NutritionMetric = 'protein' | 'sugar' | 'caffeine'
export type EntryMetric = 'calorie' | 'weight' | NutritionMetric
export type VoiceMetric = 'calorie' | NutritionMetric
export type VoiceSessionState = 'idle' | 'listening' | 'processing' | 'preview'

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

export interface EntryDivider {
  id: number
  createdAt: string // YYYY-MM-DD HH:MM:SS
}

export type HistoryListItem =
  | {
      type: 'entry'
      id: string
      createdAt: string
      entry: CalorieEntry | NutritionEntry
    }
  | {
      type: 'divider'
      id: string
      createdAt: string
      divider: EntryDivider
    }

export type NutritionGoals = Record<NutritionMetric, number>

export interface GoalConfigResponse extends NutritionGoals {
  calorieDeficit: number
}

export interface TDEEResponse {
  amount: number
  lossIn2Weeks: number
  eatenPerDay: number
  goalWeight: number
  calorieDeficit: number
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

export interface VoiceEstimate {
  metric: VoiceMetric
  amount: number
}

export interface VoiceParseItem {
  kind: 'explicit_metric' | 'food_item'
  rawText: string
  name?: string
  quantityText?: string | null
  estimated: VoiceEstimate[]
}

export interface VoiceParsePreview {
  transcript: string
  items: VoiceParseItem[]
  totals: Record<VoiceMetric, number>
  warnings: string[]
}
