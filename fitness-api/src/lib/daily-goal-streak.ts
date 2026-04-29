import { and, eq, gte, lte } from 'drizzle-orm'
import { DateTime } from 'luxon'

import type { Database } from '../db/client'
import {
  caffeineEntries,
  calorieEntries,
  dailyGoalDays,
  dailyGoalStreakState,
  proteinEntries,
  stepsEntries,
  sugarEntries
} from '../db/schema'
import { getGoalConfig } from './goals'
import { getCurrentDateTime, getTodayBounds } from './time'
import { calculateTdeeStats } from './tdee'

export type DailyGoalMetric = 'calorie' | 'protein' | 'sugar' | 'caffeine' | 'steps'

type DailyGoals = {
  calorieGoal: number
  proteinGoal: number
  sugarGoal: number
  caffeineGoal: number
  stepsGoal: number
}

type DailyTotals = {
  calorieTotal: number
  proteinTotal: number
  sugarTotal: number
  caffeineTotal: number
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
        stepsTotal: existing.stepsTotal
      }
    : {
        calorieTotal: 0,
        proteinTotal: 0,
        sugarTotal: 0,
        caffeineTotal: 0,
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
          stepsGoal: existing.stepsGoal
        })
      : getDailyGoals(db, createdAt, timezone, fallbackGoal)
  ])

  await upsertDailyGoalDay(db, localDate, totals, goals)
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
  const derivedCalorieGoal = Number.isFinite(tdeeStats.amount)
    ? Math.round(tdeeStats.amount - goalConfig.calorieDeficit)
    : 0

  return {
    calorieGoal: derivedCalorieGoal > 0 ? derivedCalorieGoal : fallbackGoal,
    proteinGoal: goalConfig.protein,
    sugarGoal: goalConfig.sugar,
    caffeineGoal: goalConfig.caffeine,
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
  const [calories, protein, sugar, caffeine, steps] = await Promise.all([
    getEntryTotal(db, calorieEntries, startUtc, endUtc),
    getEntryTotal(db, proteinEntries, startUtc, endUtc),
    getEntryTotal(db, sugarEntries, startUtc, endUtc),
    getEntryTotal(db, caffeineEntries, startUtc, endUtc),
    getEntryTotal(db, stepsEntries, startUtc, endUtc)
  ])

  return {
    calorieTotal: calories,
    proteinTotal: protein,
    sugarTotal: sugar,
    caffeineTotal: caffeine,
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

function isSuccessfulDay(day: NonNullable<Awaited<ReturnType<typeof getDailyGoalDay>>>) {
  return (
    day.calorieTotal <= day.calorieGoal &&
    day.proteinTotal >= day.proteinGoal &&
    day.sugarTotal <= day.sugarGoal &&
    day.caffeineTotal <= day.caffeineGoal &&
    day.stepsTotal >= day.stepsGoal
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
