import { and, gte, lte } from 'drizzle-orm'

import type { Database } from '../db/client'
import { calorieEntries, weightEntries } from '../db/schema'
import { formatDate, getDateRange, getDateRangeStrings, getTodayBounds } from './time'
import { defaultWeightTrendOptions, estimateWeightTrend, type DailyAmount } from './weight-trend'

// The filter converges within a few weeks, so older history adds nothing.
const HISTORY_DAYS = 120
const TREND_SERIES_DAYS = 28

export type LegacyTdeeStats = {
  amount: number
  lossIn2Weeks: number
  eatenPerDay: number
}

export type TdeeStats = LegacyTdeeStats & {
  amountMargin: number
  scaleWeight: number | null
  trendWeight: number | null
  trendWeightMargin: number | null
  trend: { date: string; weight: number }[]
  legacy: LegacyTdeeStats
}

export async function calculateTdeeStats(db: Database, now: Date, timezone: string): Promise<TdeeStats> {
  const today = getTodayBounds(now, timezone).localDate
  const calorieRange = getDateRange(now, timezone, HISTORY_DAYS, 0)
  const weightRange = getDateRangeStrings(now, timezone, HISTORY_DAYS, 0)

  const [calorieRows, weights] = await Promise.all([
    db
      .select({ amount: calorieEntries.amount, createdAt: calorieEntries.createdAt })
      .from(calorieEntries)
      .where(
        and(
          gte(calorieEntries.createdAt, calorieRange.startUtc),
          lte(calorieEntries.createdAt, calorieRange.endUtc)
        )
      ),
    db
      .select({ date: weightEntries.createdAt, amount: weightEntries.amount })
      .from(weightEntries)
      .where(and(gte(weightEntries.createdAt, weightRange.startDate), lte(weightEntries.createdAt, weightRange.endDate)))
  ])

  const calories = sumByDate(calorieRows.map(row => ({ date: formatDate(row.createdAt, timezone), amount: row.amount })))
  const legacy = calculateLegacyTdeeStats(calories, weights, now, timezone)
  const eatenPerDay = averageLoggedIntake(calories, now, timezone)
  const points = estimateWeightTrend(weights, calories, today)
  const latest = points[points.length - 1]
  const hasLoggedCalories = calories.some(entry => entry.amount >= defaultWeightTrendOptions.minLoggedCalories)

  if (!latest || !hasLoggedCalories) {
    return {
      amount: 0,
      amountMargin: 0,
      lossIn2Weeks: 0,
      eatenPerDay,
      scaleWeight: latestWeight(weights),
      trendWeight: latest ? round(latest.weight, 1) : null,
      trendWeightMargin: latest ? round(latest.weightMargin, 1) : null,
      trend: [],
      legacy
    }
  }

  const twoWeeksAgo = points[points.length - 15]

  return {
    amount: Math.round(latest.tdee),
    amountMargin: Math.round(latest.tdeeMargin),
    lossIn2Weeks: twoWeeksAgo ? round(twoWeeksAgo.weight - latest.weight, 2) : 0,
    eatenPerDay,
    scaleWeight: latestWeight(weights),
    trendWeight: round(latest.weight, 1),
    trendWeightMargin: round(latest.weightMargin, 1),
    trend: points.slice(-TREND_SERIES_DAYS).map(point => ({ date: point.date, weight: round(point.weight, 2) })),
    legacy
  }
}

// The original calculation: compares the average weight of the last 14 days
// with the 14 before, and counts every day of the last 28 as logged.
export function calculateLegacyTdeeStats(
  calories: DailyAmount[],
  weights: DailyAmount[],
  now: Date,
  timezone: string
): LegacyTdeeStats {
  const calorieDates = getDateRangeStrings(now, timezone, 28, 1)
  const recentDates = getDateRangeStrings(now, timezone, 13, 0)
  const previousDates = getDateRangeStrings(now, timezone, 27, 14)

  const totalCalories = calories
    .filter(entry => entry.date >= calorieDates.startDate && entry.date <= calorieDates.endDate)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const recentWeights = weights.filter(
    entry => entry.date >= recentDates.startDate && entry.date <= recentDates.endDate
  )
  const previousWeights = weights.filter(
    entry => entry.date >= previousDates.startDate && entry.date <= previousDates.endDate
  )
  const eatenPerDay = totalCalories / 28

  if (recentWeights.length === 0 || previousWeights.length === 0) {
    return { amount: 0, lossIn2Weeks: 0, eatenPerDay }
  }

  const lossIn2Weeks = average(previousWeights.map(entry => entry.amount)) - average(recentWeights.map(entry => entry.amount))
  const tdee = Math.round((totalCalories / 2 + lossIn2Weeks * 3500) / 14)

  return {
    amount: Number.isFinite(tdee) ? tdee : 0,
    lossIn2Weeks: Number.isFinite(lossIn2Weeks) ? lossIn2Weeks : 0,
    eatenPerDay: Number.isFinite(eatenPerDay) ? eatenPerDay : 0
  }
}

// Average over the last 28 fully logged days, skipping days with no or partial logs.
function averageLoggedIntake(calories: DailyAmount[], now: Date, timezone: string) {
  const range = getDateRangeStrings(now, timezone, 28, 1)
  const logged = calories.filter(
    entry =>
      entry.date >= range.startDate &&
      entry.date <= range.endDate &&
      entry.amount >= defaultWeightTrendOptions.minLoggedCalories
  )

  return logged.length === 0 ? 0 : average(logged.map(entry => entry.amount))
}

function sumByDate(entries: DailyAmount[]): DailyAmount[] {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.amount)
  }
  return [...totals].map(([date, amount]) => ({ date, amount }))
}

function latestWeight(weights: DailyAmount[]) {
  const latest = weights.reduce<DailyAmount | null>(
    (current, entry) => (current === null || entry.date > current.date ? entry : current),
    null
  )
  return latest?.amount ?? null
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
