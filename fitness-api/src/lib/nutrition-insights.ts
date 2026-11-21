import { and, gte, lte } from 'drizzle-orm'

import type { Database } from '../db/client'
import {
  caffeineEntries,
  calorieEntries,
  carbsEntries,
  fiberEntries,
  proteinEntries,
  sodiumEntries,
  sugarEntries
} from '../db/schema'
import type { GoalConfig } from './goals'
import { formatDate, getDateRange } from './time'

export type InsightMetric = 'sodium' | 'carbs' | 'fiber' | 'sugar' | 'protein' | 'caffeine'
export type InsightStatus = 'more' | 'less' | 'on-track' | 'no-goal' | 'no-data'

export type NutritionInsight = {
  metric: InsightMetric
  // A floor is a minimum to reach (protein, fiber); a ceiling is a maximum to stay under.
  kind: 'floor' | 'ceiling'
  goal: number | null
  average: number | null
  // What to eat today so that tomorrow's 7-day average lands on the goal.
  todayTarget: number | null
  // True when the target was clamped and cannot fully close the gap in one day.
  capped: boolean
  status: InsightStatus
}

export type NutritionInsights = {
  windowDays: number
  daysLogged: number
  metrics: NutritionInsight[]
}

export const INSIGHT_WINDOW_DAYS = 7

// Nutrition-label order, matching the home screen.
const insightTables = {
  sodium: sodiumEntries,
  carbs: carbsEntries,
  fiber: fiberEntries,
  sugar: sugarEntries,
  protein: proteinEntries,
  caffeine: caffeineEntries
} as const

const floorMetrics: ReadonlySet<InsightMetric> = new Set(['protein', 'fiber'])

/**
 * Builds one metric's insight from the totals of the prior logged days, most
 * recent first. The target is what today needs so that the 7-day window ending
 * today (the newest six prior days plus today) averages exactly the goal.
 */
export function buildInsight(metric: InsightMetric, goalAmount: number, priorTotals: number[]): NutritionInsight {
  const kind = floorMetrics.has(metric) ? 'floor' : 'ceiling'
  // A goal of 0 in settings means "no goal".
  const goal = goalAmount > 0 ? goalAmount : null
  const average = priorTotals.length > 0 ? sum(priorTotals) / priorTotals.length : null

  if (goal === null) {
    return { metric, kind, goal, average: roundOrNull(average), todayTarget: null, capped: false, status: 'no-goal' }
  }

  if (average === null) {
    return { metric, kind, goal, average: null, todayTarget: goal, capped: false, status: 'no-data' }
  }

  const onTrack = kind === 'floor' ? average >= goal : average <= goal

  if (onTrack) {
    return { metric, kind, goal, average: Math.round(average), todayTarget: goal, capped: false, status: 'on-track' }
  }

  const window = priorTotals.slice(0, INSIGHT_WINDOW_DAYS - 1)
  const exact = goal * (window.length + 1) - sum(window)
  // Never ask for less than nothing or more than double the goal in one day.
  const clamped = kind === 'floor' ? Math.min(exact, goal * 2) : Math.max(exact, 0)

  return {
    metric,
    kind,
    goal,
    average: Math.round(average),
    todayTarget: Math.round(clamped),
    capped: clamped !== exact,
    status: kind === 'floor' ? 'more' : 'less'
  }
}

export async function getNutritionInsights(options: {
  db: Database
  now: Date
  timezone: string
  goals: GoalConfig
}): Promise<NutritionInsights> {
  const { db, now, timezone, goals } = options
  const range = getDateRange(now, timezone, INSIGHT_WINDOW_DAYS, 1)

  // A day counts once anything was logged for calories, the same rule the
  // daily goal streak uses for a missing day.
  const [calorieDays, ...metricTotals] = await Promise.all([
    getDailyTotals(db, calorieEntries, range.startUtc, range.endUtc, timezone),
    ...Object.values(insightTables).map(table => getDailyTotals(db, table, range.startUtc, range.endUtc, timezone))
  ])

  const loggedDays = [...calorieDays.keys()].sort().reverse()
  const metrics = (Object.keys(insightTables) as InsightMetric[]).map((metric, index) => {
    const totals = metricTotals[index]!
    return buildInsight(
      metric,
      goals[metric],
      loggedDays.map(day => totals.get(day) ?? 0)
    )
  })

  return { windowDays: INSIGHT_WINDOW_DAYS, daysLogged: loggedDays.length, metrics }
}

async function getDailyTotals(
  db: Database,
  table: typeof calorieEntries | (typeof insightTables)[InsightMetric],
  startUtc: Date,
  endUtc: Date,
  timezone: string
) {
  const entries = await db
    .select({ amount: table.amount, createdAt: table.createdAt })
    .from(table)
    .where(and(gte(table.createdAt, startUtc), lte(table.createdAt, endUtc)))

  const totals = new Map<string, number>()

  for (const entry of entries) {
    const day = formatDate(entry.createdAt, timezone)
    totals.set(day, (totals.get(day) ?? 0) + entry.amount)
  }

  return totals
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function roundOrNull(value: number | null) {
  return value === null ? null : Math.round(value)
}
