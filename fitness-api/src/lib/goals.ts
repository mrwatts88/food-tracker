import type { Database } from '../db/client'
import { nutritionGoals } from '../db/schema'

export type GoalConfig = {
  protein: number
  sugar: number
  caffeine: number
  steps: number
  calorieDeficit: number
}

export const DEFAULT_GOAL_CONFIG: GoalConfig = {
  protein: 100,
  sugar: 80,
  caffeine: 280,
  steps: 7000,
  calorieDeficit: 250
}

export async function getGoalConfig(db: Database): Promise<GoalConfig> {
  try {
    const rows = await db.select().from(nutritionGoals)

    return {
      protein: rows.find(goal => goal.metric === 'protein')?.amount ?? DEFAULT_GOAL_CONFIG.protein,
      sugar: rows.find(goal => goal.metric === 'sugar')?.amount ?? DEFAULT_GOAL_CONFIG.sugar,
      caffeine: rows.find(goal => goal.metric === 'caffeine')?.amount ?? DEFAULT_GOAL_CONFIG.caffeine,
      steps: rows.find(goal => goal.metric === 'steps')?.amount ?? DEFAULT_GOAL_CONFIG.steps,
      calorieDeficit:
        rows.find(goal => goal.metric === 'calorie_deficit')?.amount ?? DEFAULT_GOAL_CONFIG.calorieDeficit
    }
  } catch (error) {
    if (isMissingNutritionGoalsTableError(error)) {
      return DEFAULT_GOAL_CONFIG
    }

    throw error
  }
}

function isMissingNutritionGoalsTableError(error: unknown) {
  return hasMissingNutritionGoalsSignal(error) || hasMissingNutritionGoalsSignal(getErrorCause(error))
}

function hasMissingNutritionGoalsSignal(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const code = 'code' in error ? error.code : undefined

  return code === '42P01' || error.message.includes('relation "nutrition_goals" does not exist')
}

function getErrorCause(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined
  }

  return 'cause' in error ? error.cause : undefined
}
