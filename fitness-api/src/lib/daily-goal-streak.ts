import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { DateTime } from 'luxon'

import type { Database } from '../db/client'
import {
  caffeineEntries,
  calorieEntries,
  carbsEntries,
  dailyGoalDays,
  dailyGoalStreakState,
  proteinEntries,
  stepsEntries,
  sugarEntries
} from '../db/schema'
import { getGoalConfig, resolveCalorieGoal } from './goals'
import { getCurrentDateTime, getTodayBounds } from './time'
import { calculateTdeeStats } from './tdee'

export type DailyGoalMetric = 'calorie' | 'protein' | 'sugar' | 'caffeine' | 'carbs' | 'steps'

export type StreakGoalMetric = 'calorie' | 'protein' | 'sugar' | 'carbs'
// Goals that used to decide the streak. They only appear on past days they broke.
export type RetiredStreakGoalMetric = 'caffeine' | 'steps'

export type StreakMetricStatus = {
  metric: StreakGoalMetric | RetiredStreakGoalMetric
  total: number
  goal: number
  // 'max' goals must stay at or under the goal, 'min' goals must reach it.
  kind: 'max' | 'min'
  met: boolean
  // False for retired goals that no longer count toward the streak.
  counted: boolean
}

export type StreakDaySummary = {
  localDate: string
  successful: boolean
  // Past days are judged once they end; today is a live preview.
  evaluated: boolean
  // No entries were logged at all that day, which also breaks the streak.
  missing: boolean
  metrics: StreakMetricStatus[]
}

export type DailyGoalStreakStatus = {
  currentStreak: number
  lastBreakDate: string | null
  today: StreakDaySummary
  recentDays: StreakDaySummary[]
}

const RECENT_DAYS = 7

type DailyGoals = {
  calorieGoal: number
  proteinGoal: number
  sugarGoal: number
  caffeineGoal: number
  carbsGoal: number
  stepsGoal: number
}

type DailyTotals = {
  calorieTotal: number
  proteinTotal: number
  sugarTotal: number
  caffeineTotal: number
  carbsTotal: number
  stepsTotal: number
}

const STREAK_STATE_ID = 1

export async function recordDailyGoalEntry(options: {
  db: Database
  metric: DailyGoalMetric
  amount: number
  createdAt: Date
  timezone: string
  fallbackGoal: number
}) {
  const { db, metric, amount, createdAt, timezone, fallbackGoal } = options
  await syncDailyGoalStreak(db, createdAt, timezone)

  const goals = await getDailyGoals(db, createdAt, timezone, fallbackGoal)
  const localDate = getTodayBounds(createdAt, timezone).localDate
  const existing = await getDailyGoalDay(db, localDate)

  if (existing?.evaluatedAt) {
    return
  }

  const totals = existing
    ? {
        calorieTotal: existing.calorieTotal,
        proteinTotal: existing.proteinTotal,
        sugarTotal: existing.sugarTotal,
        caffeineTotal: existing.caffeineTotal,
        carbsTotal: existing.carbsTotal,
        stepsTotal: existing.stepsTotal
      }
    : {
        calorieTotal: 0,
        proteinTotal: 0,
        sugarTotal: 0,
        caffeineTotal: 0,
        carbsTotal: 0,
        stepsTotal: 0
      }

  totals[`${metric}Total`] += amount

  await upsertDailyGoalDay(db, localDate, totals, goals)
}

export async function refreshUnevaluatedDailyGoalDay(options: {
  db: Database
  createdAt: Date
  timezone: string
  fallbackGoal: number
}) {
  const { db, createdAt, timezone, fallbackGoal } = options
  const localDate = getTodayBounds(createdAt, timezone).localDate
  const existing = await getDailyGoalDay(db, localDate)

  if (existing?.evaluatedAt) {
    return
  }

  const bounds = getTodayBounds(createdAt, timezone)
  const [totals, goals] = await Promise.all([
    getTotalsForBounds(db, bounds.startUtc, bounds.endUtc),
    existing
      ? Promise.resolve({
          calorieGoal: existing.calorieGoal,
          proteinGoal: existing.proteinGoal,
          sugarGoal: existing.sugarGoal,
          caffeineGoal: existing.caffeineGoal,
          carbsGoal: existing.carbsGoal,
          stepsGoal: existing.stepsGoal
        })
      : getDailyGoals(db, createdAt, timezone, fallbackGoal)
  ])

  await upsertDailyGoalDay(db, localDate, totals, goals)
}

export async function getDailyGoalStreakStatus(options: {
  db: Database
  now: Date
  timezone: string
  fallbackGoal: number
}): Promise<DailyGoalStreakStatus> {
  const { db, now, timezone, fallbackGoal } = options
  const currentStreak = await syncDailyGoalStreak(db, now, timezone)
  const state = await getStreakState(db)
  const bounds = getTodayBounds(now, timezone)
  // Today is judged against the goals as they stand now. The day row only pins
  // goals once the day has been evaluated.
  const [totals, goals] = await Promise.all([
    getTotalsForBounds(db, bounds.startUtc, bounds.endUtc),
    getDailyGoals(db, now, timezone, fallbackGoal)
  ])
  const todayMetrics = buildMetricStatuses(totals, goals)

  const current = getCurrentDateTime(now, timezone)
  const recentDates = Array.from(
    { length: RECENT_DAYS },
    (_, index) => current.minus({ days: index + 1 }).toISODate() ?? ''
  )
  const rows = await db.select().from(dailyGoalDays).where(inArray(dailyGoalDays.localDate, recentDates))
  const rowByDate = new Map(rows.map(row => [row.localDate, row]))

  return {
    currentStreak,
    lastBreakDate: state?.lastBreakDate ?? null,
    today: {
      localDate: bounds.localDate,
      successful: todayMetrics.every(metric => metric.met),
      evaluated: false,
      missing: false,
      metrics: todayMetrics
    },
    recentDays: recentDates.map(localDate => {
      const day = rowByDate.get(localDate)

      if (!day) {
        return { localDate, successful: false, evaluated: true, missing: true, metrics: [] }
      }

      const successful = day.successful ?? isSuccessfulDay(day)
      const metrics = buildMetricStatuses(day, day)

      // A day that was judged under the old rules can be unsuccessful even
      // though every current goal was met. Surface the retired goal that broke it.
      if (!successful && metrics.every(metric => metric.met)) {
        metrics.push(...buildRetiredMetricStatuses(day).filter(metric => !metric.met))
      }

      return {
        localDate,
        successful,
        evaluated: day.evaluatedAt !== null,
        missing: false,
        metrics
      }
    })
  }
}

function buildRetiredMetricStatuses(day: DailyTotals & DailyGoals): StreakMetricStatus[] {
  return [
    {
      metric: 'caffeine',
      total: day.caffeineTotal,
      goal: day.caffeineGoal,
      kind: 'max',
      met: day.caffeineTotal <= day.caffeineGoal,
      counted: false
    },
    {
      metric: 'steps',
      total: day.stepsTotal,
      goal: day.stepsGoal,
      kind: 'min',
      met: day.stepsTotal >= day.stepsGoal,
      counted: false
    }
  ]
}

function buildMetricStatuses(totals: DailyTotals, goals: DailyGoals): StreakMetricStatus[] {
  return [
    {
      metric: 'calorie',
      total: totals.calorieTotal,
      goal: goals.calorieGoal,
      kind: 'max',
      met: totals.calorieTotal <= goals.calorieGoal,
      counted: true
    },
    {
      metric: 'protein',
      total: totals.proteinTotal,
      goal: goals.proteinGoal,
      kind: 'min',
      met: totals.proteinTotal >= goals.proteinGoal,
      counted: true
    },
    {
      metric: 'sugar',
      total: totals.sugarTotal,
      goal: goals.sugarGoal,
      kind: 'max',
      met: totals.sugarTotal <= goals.sugarGoal,
      counted: true
    },
    {
      metric: 'carbs',
      total: totals.carbsTotal,
      goal: goals.carbsGoal,
      kind: 'max',
      met: totals.carbsTotal <= goals.carbsGoal,
      counted: true
    }
  ]
}

export async function syncDailyGoalStreak(db: Database, now: Date, timezone: string) {
  const current = getCurrentDateTime(now, timezone)
  const yesterday = current.minus({ days: 1 }).toISODate() ?? ''
  let state = await getStreakState(db)

  if (!state) {
    await db.insert(dailyGoalStreakState).values({
      id: STREAK_STATE_ID,
      currentStreak: 0,
      lastEvaluatedDate: yesterday,
      lastBreakDate: null
    })
    return 0
  }

  if (!state.lastEvaluatedDate) {
    state = await updateStreakState(db, {
      currentStreak: 0,
      lastEvaluatedDate: yesterday,
      lastBreakDate: null
    })
    return state.currentStreak
  }

  for (const localDate of getDatesBetweenExclusive(state.lastEvaluatedDate, yesterday)) {
    const day = await getDailyGoalDay(db, localDate)
    const successful = day ? isSuccessfulDay(day) : false
    const currentStreak = successful ? state.currentStreak + 1 : 0
    const lastBreakDate = successful ? state.lastBreakDate : localDate

    if (day && day.successful === null) {
      await db
        .update(dailyGoalDays)
        .set({
          successful,
          evaluatedAt: now
        })
        .where(eq(dailyGoalDays.localDate, localDate))
    }

    state = await updateStreakState(db, {
      currentStreak,
      lastEvaluatedDate: localDate,
      lastBreakDate
    })
  }

  return state.currentStreak
}

async function getDailyGoals(
  db: Database,
  now: Date,
  timezone: string,
  fallbackGoal: number
): Promise<DailyGoals> {
  const [goalConfig, tdeeStats] = await Promise.all([
    getGoalConfig(db),
    calculateTdeeStats(db, now, timezone)
  ])
  return {
    calorieGoal: resolveCalorieGoal(
      goalConfig.calorieTarget,
      tdeeStats.amount,
      goalConfig.calorieDeficit,
      fallbackGoal
    ),
    proteinGoal: goalConfig.protein,
    sugarGoal: goalConfig.sugar,
    caffeineGoal: goalConfig.caffeine,
    carbsGoal: goalConfig.carbs,
    stepsGoal: goalConfig.steps
  }
}

async function getDailyGoalDay(db: Database, localDate: string) {
  const [day] = await db
    .select()
    .from(dailyGoalDays)
    .where(eq(dailyGoalDays.localDate, localDate))
    .limit(1)

  return day
}

async function upsertDailyGoalDay(
  db: Database,
  localDate: string,
  totals: DailyTotals,
  goals: DailyGoals
) {
  await db
    .insert(dailyGoalDays)
    .values({
      localDate,
      ...totals,
      ...goals,
      successful: null,
      evaluatedAt: null
    })
    .onConflictDoUpdate({
      target: dailyGoalDays.localDate,
      set: {
        ...totals,
        ...goals,
        successful: null,
        evaluatedAt: null
      }
    })
}

async function getTotalsForBounds(db: Database, startUtc: Date, endUtc: Date): Promise<DailyTotals> {
  const [calories, protein, sugar, caffeine, carbs, steps] = await Promise.all([
    getEntryTotal(db, calorieEntries, startUtc, endUtc),
    getEntryTotal(db, proteinEntries, startUtc, endUtc),
    getEntryTotal(db, sugarEntries, startUtc, endUtc),
    getEntryTotal(db, caffeineEntries, startUtc, endUtc),
    getEntryTotal(db, carbsEntries, startUtc, endUtc),
    getEntryTotal(db, stepsEntries, startUtc, endUtc)
  ])

  return {
    calorieTotal: calories,
    proteinTotal: protein,
    sugarTotal: sugar,
    caffeineTotal: caffeine,
    carbsTotal: carbs,
    stepsTotal: steps
  }
}

async function getEntryTotal(
  db: Database,
  table:
    | typeof calorieEntries
    | typeof proteinEntries
    | typeof sugarEntries
    | typeof caffeineEntries
    | typeof carbsEntries
    | typeof stepsEntries,
  startUtc: Date,
  endUtc: Date
) {
  const entries = await db
    .select({ amount: table.amount })
    .from(table)
    .where(and(gte(table.createdAt, startUtc), lte(table.createdAt, endUtc)))

  return entries.reduce((sum, entry) => sum + entry.amount, 0)
}

// Caffeine and steps totals are still recorded on the day row for reference,
// but only calories, protein, sugar, and carbs decide whether the day counts.
function isSuccessfulDay(day: NonNullable<Awaited<ReturnType<typeof getDailyGoalDay>>>) {
  return (
    day.calorieTotal <= day.calorieGoal &&
    day.proteinTotal >= day.proteinGoal &&
    day.sugarTotal <= day.sugarGoal &&
    day.carbsTotal <= day.carbsGoal
  )
}

async function getStreakState(db: Database) {
  const [state] = await db
    .select()
    .from(dailyGoalStreakState)
    .where(eq(dailyGoalStreakState.id, STREAK_STATE_ID))
    .limit(1)

  return state
}

async function updateStreakState(
  db: Database,
  values: {
    currentStreak: number
    lastEvaluatedDate: string
    lastBreakDate: string | null
  }
) {
  const [state] = await db
    .insert(dailyGoalStreakState)
    .values({
      id: STREAK_STATE_ID,
      ...values
    })
    .onConflictDoUpdate({
      target: dailyGoalStreakState.id,
      set: values
    })
    .returning()

  if (!state) {
    throw new Error('Failed to update daily goal streak state')
  }

  return state
}

function getDatesBetweenExclusive(startDate: string, endDate: string) {
  const dates: string[] = []
  const end = DateTime.fromISO(endDate)

  for (let date = DateTime.fromISO(startDate).plus({ days: 1 }); date <= end; date = date.plus({ days: 1 })) {
    dates.push(date.toISODate() ?? '')
  }

  return dates
}
