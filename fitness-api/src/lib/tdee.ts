import { and, gte, lte } from 'drizzle-orm'

import type { Database } from '../db/client'
import { calorieEntries, weightEntries } from '../db/schema'
import { getDateRange, getDateRangeStrings } from './time'

export type TdeeStats = {
  amount: number
  lossIn2Weeks: number
  eatenPerDay: number
}

export async function calculateTdeeStats(db: Database, now: Date, timezone: string): Promise<TdeeStats> {
  const calorieRange = getDateRange(now, timezone, 28, 1)
  const recentWeightRange = getDateRangeStrings(now, timezone, 13, 0)
  const previousWeightRange = getDateRangeStrings(now, timezone, 27, 14)

  const calories = await db
    .select({
      amount: calorieEntries.amount
    })
    .from(calorieEntries)
    .where(
      and(
        gte(calorieEntries.createdAt, calorieRange.startUtc),
        lte(calorieEntries.createdAt, calorieRange.endUtc)
      )
    )

  const recentWeights = await db
    .select({
      amount: weightEntries.amount
    })
    .from(weightEntries)
    .where(
      and(
        gte(weightEntries.createdAt, recentWeightRange.startDate),
        lte(weightEntries.createdAt, recentWeightRange.endDate)
      )
    )

  const previousWeights = await db
    .select({
      amount: weightEntries.amount
    })
    .from(weightEntries)
    .where(
      and(
        gte(weightEntries.createdAt, previousWeightRange.startDate),
        lte(weightEntries.createdAt, previousWeightRange.endDate)
      )
    )

  const totalCalories = calories.reduce((sum, entry) => sum + entry.amount, 0)
  const eatenPerDay = totalCalories / 28

  if (recentWeights.length === 0 || previousWeights.length === 0) {
    return {
      amount: 0,
      lossIn2Weeks: 0,
      eatenPerDay
    }
  }

  const recentAverage = average(recentWeights.map(entry => entry.amount))
  const previousAverage = average(previousWeights.map(entry => entry.amount))
  const lossIn2Weeks = previousAverage - recentAverage
  const foodCaloriesBurned = totalCalories / 2
  const fatCaloriesBurned = lossIn2Weeks * 3500
  const tdee = Math.round((foodCaloriesBurned + fatCaloriesBurned) / 14)

  return {
    amount: Number.isFinite(tdee) ? tdee : 0,
    lossIn2Weeks: Number.isFinite(lossIn2Weeks) ? lossIn2Weeks : 0,
    eatenPerDay: Number.isFinite(eatenPerDay) ? eatenPerDay : 0
  }
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
