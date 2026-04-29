import { and, desc, eq, gte, lte, max } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'

import { loadConfig, type AppConfig } from './config'
import { getDatabase, type Database } from './db/client'
import {
  caffeineEntries,
  calorieEntries,
  entryDividers,
  nutritionGoals,
  proteinEntries,
  stepsEntries,
  sugarEntries,
  weightEntries
} from './db/schema'
import {
  buildCalorieAlertEmail,
  buildNutritionLimitAlertEmail,
  createAlertNotifier,
  type AlertEmail,
  type AlertNotifier
} from './lib/alerts'
import { calculateUnlockStatus } from './lib/calorie-unlock'
import {
  recordDailyGoalEntry,
  refreshUnevaluatedDailyGoalDay,
  syncDailyGoalStreak
} from './lib/daily-goal-streak'
import { DEFAULT_GOAL_CONFIG, getGoalConfig } from './lib/goals'
import { formatDate, formatTimestamp, getTodayBounds } from './lib/time'
import { calculateTdeeStats } from './lib/tdee'
import { createVoiceParser, type VoiceParser } from './lib/voice'

type AppDependencies = {
  db?: Database
  now?: () => Date
  config?: AppConfig
  notifier?: AlertNotifier | null
  voiceParser?: VoiceParser | null
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

const calorieEntrySchema = z.object({
  amount: z.number().int().positive()
})

const weightEntrySchema = z.object({
  amount: z.number().positive()
})

const configMetricSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9_]+$/)
const configValueSchema = z.object({
  amount: z.number().int()
})
const weightDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
type NutritionRoutePath = 'protein' | 'sugar' | 'caffeine' | 'steps'
type NutritionAlertMetric = 'sugar' | 'caffeine'
type NutritionEntryTable = typeof proteinEntries | typeof sugarEntries | typeof caffeineEntries | typeof stepsEntries
type AmountEntryTable = typeof calorieEntries | NutritionEntryTable

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono().basePath('/api')
  const config = dependencies.config ?? loadConfig()
  const notifier = dependencies.notifier !== undefined ? dependencies.notifier : createAlertNotifier(config)
  const voiceParser =
    dependencies.voiceParser !== undefined ? dependencies.voiceParser : createVoiceParser(config)

  if (config.corsOrigin) {
    app.use(
      '*',
      cors({
        origin: config.corsOrigin,
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
      })
    )
  }

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return jsonError(error.message, error.status)
    }

    if (error instanceof z.ZodError) {
      return jsonError('Invalid request', 400)
    }

    if (error instanceof SyntaxError) {
      return jsonError('Invalid JSON body', 400)
    }

    console.error(error)
    return jsonError('Internal server error', 500)
  })

  app.notFound(c => c.json({ error: 'Not found' }, 404))

  app.get('/health', c => c.json({ status: 'healthy' }))

  app.post('/voice/parse', async c => {
    if (voiceParser === null) {
      return jsonError('Voice parsing is not configured', 503)
    }

    const contentType = c.req.header('content-type') ?? ''

    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return jsonError('Invalid multipart form data', 400)
    }

    let formData: FormData

    try {
      formData = await c.req.formData()
    } catch {
      return jsonError('Invalid multipart form data', 400)
    }

    const file = formData.get('audio')

    if (!(file instanceof File) || file.size === 0) {
      return jsonError('audio file is required', 400)
    }

    const parsed = await voiceParser.parseAudio(file)
    return c.json(parsed)
  })

  app.get('/entry-dividers', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const today = getTodayBounds(runtime.now(), runtime.config.appTimezone)

    const dividers = await runtime.db
      .select()
      .from(entryDividers)
      .where(gte(entryDividers.createdAt, today.startUtc))
      .orderBy(desc(entryDividers.createdAt), desc(entryDividers.id))

    return c.json(
      dividers.map(divider => ({
        id: divider.id,
        createdAt: formatTimestamp(divider.createdAt, runtime.config.appTimezone)
      }))
    )
  })

  app.post('/entry-dividers', async c => {
    const runtime = getRuntime(dependencies, config, notifier)

    const [divider] = await runtime.db
      .insert(entryDividers)
      .values({
        createdAt: runtime.now()
      })
      .returning()

    const createdDivider = assertFound(divider, 'Failed to create entry divider')

    return c.json(
      {
        id: createdDivider.id,
        createdAt: formatTimestamp(createdDivider.createdAt, runtime.config.appTimezone)
      },
      201
    )
  })

  app.get('/calories', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const today = getTodayBounds(runtime.now(), runtime.config.appTimezone)

    const entries = await runtime.db
      .select()
      .from(calorieEntries)
      .where(gte(calorieEntries.createdAt, today.startUtc))
      .orderBy(desc(calorieEntries.createdAt))

    return c.json(
      entries.map(entry => ({
        id: entry.id,
        amount: entry.amount,
        createdAt: formatTimestamp(entry.createdAt, runtime.config.appTimezone)
      }))
    )
  })

  app.get('/calories/unlock-status', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const [goalConfig, dailyGoalStreak] = await Promise.all([
      getGoalConfig(runtime.db),
      syncDailyGoalStreak(runtime.db, runtime.now(), runtime.config.appTimezone)
    ])

    const unlockStatus = await calculateUnlockStatus({
      db: runtime.db,
      now: runtime.now(),
      timezone: runtime.config.appTimezone,
      schedule: runtime.config.calorieUnlockSchedule,
      fallbackGoal: runtime.config.calorieUnlockFallbackGoal,
      calorieDeficit: goalConfig.calorieDeficit,
      dailyGoalStreak
    })

    return c.json(unlockStatus)
  })

  app.post('/calories', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const input = calorieEntrySchema.parse(await c.req.json())
    const createdAt = runtime.now()
    const activeNotifier = runtime.notifier
    const goalConfig = await getGoalConfig(runtime.db)
    const dailyGoalStreak = await syncDailyGoalStreak(runtime.db, createdAt, runtime.config.appTimezone)
    const beforeStatus =
      activeNotifier === null
        ? null
        : await calculateUnlockStatus({
            db: runtime.db,
            now: createdAt,
            timezone: runtime.config.appTimezone,
            schedule: runtime.config.calorieUnlockSchedule,
            fallbackGoal: runtime.config.calorieUnlockFallbackGoal,
            calorieDeficit: goalConfig.calorieDeficit,
            dailyGoalStreak
          })

    await insertAutoDividerIfNeeded(runtime.db, createdAt, runtime.config.appTimezone)

    const [entry] = await runtime.db
      .insert(calorieEntries)
      .values({
        amount: input.amount,
        createdAt
      })
      .returning()

    const createdEntry = assertFound(entry, 'Failed to create calorie entry')
    await recordDailyGoalEntry({
      db: runtime.db,
      metric: 'calorie',
      amount: input.amount,
      createdAt,
      timezone: runtime.config.appTimezone,
      fallbackGoal: runtime.config.calorieUnlockFallbackGoal
    })

    if (beforeStatus !== null && activeNotifier !== null) {
      const afterStatus = getUnlockStatusAfterEntry(beforeStatus, input.amount)
      const borrowCrossed = beforeStatus.overdrawCalories === 0 && afterStatus.overdrawCalories > 0
      const dailyLimitCrossed =
        beforeStatus.consumedCalories <= beforeStatus.dailyTargetCalories &&
        afterStatus.consumedCalories > afterStatus.dailyTargetCalories

      if (borrowCrossed || dailyLimitCrossed) {
        await sendAlertSafely(
          activeNotifier,
          buildCalorieAlertEmail({
            entryAmount: input.amount,
            status: afterStatus,
            borrowCrossed,
            dailyLimitCrossed,
            occurredAt: createdAt,
            timezone: runtime.config.appTimezone
          })
        )
      }
    }

    return c.json(
      {
        id: createdEntry.id,
        amount: createdEntry.amount,
        createdAt: formatTimestamp(createdEntry.createdAt, runtime.config.appTimezone)
      },
      201
    )
  })

  app.delete('/calories/:id', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const id = parsePositiveInteger(c.req.param('id'), 'id')
    const [entry] = await runtime.db
      .select({ createdAt: calorieEntries.createdAt })
      .from(calorieEntries)
      .where(eq(calorieEntries.id, id))
      .limit(1)

    await runtime.db.delete(calorieEntries).where(eq(calorieEntries.id, id))

    if (entry) {
      await refreshUnevaluatedDailyGoalDay({
        db: runtime.db,
        createdAt: entry.createdAt,
        timezone: runtime.config.appTimezone,
        fallbackGoal: runtime.config.calorieUnlockFallbackGoal
      })
    }

    return c.body(null, 200)
  })

  registerNutritionEntryRoutes(app, dependencies, config, notifier, 'protein', proteinEntries)
  registerNutritionEntryRoutes(app, dependencies, config, notifier, 'sugar', sugarEntries)
  registerNutritionEntryRoutes(app, dependencies, config, notifier, 'caffeine', caffeineEntries)
  registerNutritionEntryRoutes(app, dependencies, config, notifier, 'steps', stepsEntries)

  app.get('/nutrition/goals', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    return c.json(await getGoalConfig(runtime.db))
  })

  app.get('/config', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    return c.json(await getConfigRows(runtime.db))
  })

  app.put('/config/:metric', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const metric = configMetricSchema.parse(c.req.param('metric'))
    const input = configValueSchema.parse(await c.req.json())

    const [row] = await runtime.db
      .insert(nutritionGoals)
      .values({
        metric,
        amount: input.amount
      })
      .onConflictDoUpdate({
        target: nutritionGoals.metric,
        set: { amount: input.amount }
      })
      .returning()

    return c.json(assertFound(row, 'Failed to update config value'))
  })

  app.get('/weight', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const entries = await runtime.db
      .select()
      .from(weightEntries)
      .orderBy(desc(weightEntries.createdAt))

    return c.json(
      entries.map(entry => ({
        amount: entry.amount,
        createdAt: formatDate(entry.createdAt, runtime.config.appTimezone)
      }))
    )
  })

  app.post('/weight', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const input = weightEntrySchema.parse(await c.req.json())
    const today = getTodayBounds(runtime.now(), runtime.config.appTimezone)

    const [entry] = await runtime.db
      .insert(weightEntries)
      .values({
        amount: input.amount,
        createdAt: today.localDate
      })
      .onConflictDoUpdate({
        target: weightEntries.createdAt,
        set: { amount: input.amount }
      })
      .returning()

    const createdEntry = assertFound(entry, 'Failed to create weight entry')

    return c.json(
      {
        amount: createdEntry.amount,
        createdAt: formatDate(createdEntry.createdAt, runtime.config.appTimezone)
      },
      201
    )
  })

  app.delete('/weight/:date', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const date = weightDateSchema.parse(c.req.param('date'))

    await runtime.db.delete(weightEntries).where(eq(weightEntries.createdAt, date))

    return c.body(null, 200)
  })

  app.get('/tdee', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const [stats, goalConfig] = await Promise.all([
      calculateTdeeStats(runtime.db, runtime.now(), runtime.config.appTimezone),
      getGoalConfig(runtime.db)
    ])

    return c.json({
      ...stats,
      goalWeight: runtime.config.goalWeight,
      calorieDeficit: goalConfig.calorieDeficit
    })
  })

  return app
}

export const app = createApp()

function registerNutritionEntryRoutes(
  app: Hono,
  dependencies: AppDependencies,
  config: AppConfig,
  notifier: AlertNotifier | null,
  path: NutritionRoutePath,
  table: NutritionEntryTable
) {
  app.get(`/${path}`, async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const today = getTodayBounds(runtime.now(), runtime.config.appTimezone)

    const entries = await runtime.db
      .select()
      .from(table)
      .where(gte(table.createdAt, today.startUtc))
      .orderBy(desc(table.createdAt))

    return c.json(
      entries.map(entry => ({
        id: entry.id,
        amount: entry.amount,
        createdAt: formatTimestamp(entry.createdAt, runtime.config.appTimezone)
      }))
    )
  })

  app.post(`/${path}`, async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const input = calorieEntrySchema.parse(await c.req.json())
    const createdAt = runtime.now()
    const activeNotifier = runtime.notifier
    const alertMetric = getNutritionAlertMetric(path)
    let beforeTotal = 0
    let limit = 0

    if (activeNotifier !== null && alertMetric !== null) {
      const [dailyTotal, goalConfig] = await Promise.all([
        getDailyEntryTotal(runtime.db, table, createdAt, runtime.config.appTimezone),
        getGoalConfig(runtime.db)
      ])

      beforeTotal = dailyTotal
      limit = goalConfig[alertMetric]
    }

    await insertAutoDividerIfNeeded(runtime.db, createdAt, runtime.config.appTimezone)

    const [entry] = await runtime.db
      .insert(table)
      .values({
        amount: input.amount,
        createdAt
      })
      .returning()

    const createdEntry = assertFound(entry, `Failed to create ${path} entry`)
    await recordDailyGoalEntry({
      db: runtime.db,
      metric: path,
      amount: input.amount,
      createdAt,
      timezone: runtime.config.appTimezone,
      fallbackGoal: runtime.config.calorieUnlockFallbackGoal
    })

    if (activeNotifier !== null && alertMetric !== null) {
      const afterTotal = beforeTotal + input.amount

      if (beforeTotal <= limit && afterTotal > limit) {
        await sendAlertSafely(
          activeNotifier,
          buildNutritionLimitAlertEmail({
            label: alertMetric === 'sugar' ? 'Sugar' : 'Caffeine',
            unit: alertMetric === 'sugar' ? 'g' : 'mg',
            entryAmount: input.amount,
            dailyTotal: afterTotal,
            limit,
            occurredAt: createdAt,
            timezone: runtime.config.appTimezone
          })
        )
      }
    }

    return c.json(
      {
        id: createdEntry.id,
        amount: createdEntry.amount,
        createdAt: formatTimestamp(createdEntry.createdAt, runtime.config.appTimezone)
      },
      201
    )
  })

  app.delete(`/${path}/:id`, async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const id = parsePositiveInteger(c.req.param('id'), 'id')
    const [entry] = await runtime.db
      .select({ createdAt: table.createdAt })
      .from(table)
      .where(eq(table.id, id))
      .limit(1)

    await runtime.db.delete(table).where(eq(table.id, id))

    if (entry) {
      await refreshUnevaluatedDailyGoalDay({
        db: runtime.db,
        createdAt: entry.createdAt,
        timezone: runtime.config.appTimezone,
        fallbackGoal: runtime.config.calorieUnlockFallbackGoal
      })
    }

    return c.body(null, 200)
  })
}

function parsePositiveInteger(value: string, field: string) {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, `${field} must be a positive integer`)
  }

  return parsed
}

function getRuntime(dependencies: AppDependencies, config: AppConfig, notifier: AlertNotifier | null) {
  return {
    db: dependencies.db ?? getDatabase().db,
    now: dependencies.now ?? (() => new Date()),
    config,
    notifier
  }
}

function assertFound<T>(value: T | undefined, message: string) {
  if (!value) {
    throw new Error(message)
  }

  return value
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

function getNutritionAlertMetric(path: NutritionRoutePath): NutritionAlertMetric | null {
  if (path === 'protein' || path === 'steps') {
    return null
  }

  return path
}

async function getDailyEntryTotal(db: Database, table: AmountEntryTable, now: Date, timezone: string) {
  const today = getTodayBounds(now, timezone)
  const entries = await db
    .select({ amount: table.amount })
    .from(table)
    .where(and(gte(table.createdAt, today.startUtc), lte(table.createdAt, today.endUtc)))

  return entries.reduce((sum, entry) => sum + entry.amount, 0)
}

async function insertAutoDividerIfNeeded(db: Database, createdAt: Date, timezone: string) {
  const latestActivityAt = await getLatestTrackedActivityAt(db, createdAt, timezone)

  if (latestActivityAt === null) {
    return
  }

  const gapInMilliseconds = createdAt.getTime() - latestActivityAt.getTime()

  if (gapInMilliseconds <= 10 * 60 * 1000) {
    return
  }

  await db.insert(entryDividers).values({
    createdAt
  })
}

async function getConfigRows(db: Database) {
  const rows = await db.select().from(nutritionGoals)
  const rowByMetric = new Map(rows.map(row => [row.metric, row.amount]))
  const defaultRows = [
    ['protein', DEFAULT_GOAL_CONFIG.protein],
    ['sugar', DEFAULT_GOAL_CONFIG.sugar],
    ['caffeine', DEFAULT_GOAL_CONFIG.caffeine],
    ['steps', DEFAULT_GOAL_CONFIG.steps],
    ['calorie_deficit', DEFAULT_GOAL_CONFIG.calorieDeficit]
  ] as const

  for (const [metric, amount] of defaultRows) {
    if (!rowByMetric.has(metric)) {
      rows.push({ metric, amount })
    }
  }

  return rows.sort((left, right) => left.metric.localeCompare(right.metric))
}

async function getLatestTrackedActivityAt(db: Database, now: Date, timezone: string) {
  const today = getTodayBounds(now, timezone)

  const [
    calorieResult,
    proteinResult,
    sugarResult,
    caffeineResult,
    stepsResult,
    dividerResult
  ] = await Promise.all([
    db
      .select({ createdAt: max(calorieEntries.createdAt) })
      .from(calorieEntries)
      .where(and(gte(calorieEntries.createdAt, today.startUtc), lte(calorieEntries.createdAt, now))),
    db
      .select({ createdAt: max(proteinEntries.createdAt) })
      .from(proteinEntries)
      .where(and(gte(proteinEntries.createdAt, today.startUtc), lte(proteinEntries.createdAt, now))),
    db
      .select({ createdAt: max(sugarEntries.createdAt) })
      .from(sugarEntries)
      .where(and(gte(sugarEntries.createdAt, today.startUtc), lte(sugarEntries.createdAt, now))),
    db
      .select({ createdAt: max(caffeineEntries.createdAt) })
      .from(caffeineEntries)
      .where(and(gte(caffeineEntries.createdAt, today.startUtc), lte(caffeineEntries.createdAt, now))),
    db
      .select({ createdAt: max(stepsEntries.createdAt) })
      .from(stepsEntries)
      .where(and(gte(stepsEntries.createdAt, today.startUtc), lte(stepsEntries.createdAt, now))),
    db
      .select({ createdAt: max(entryDividers.createdAt) })
      .from(entryDividers)
      .where(and(gte(entryDividers.createdAt, today.startUtc), lte(entryDividers.createdAt, now)))
  ])

  const latestActivity = [
    calorieResult[0]?.createdAt,
    proteinResult[0]?.createdAt,
    sugarResult[0]?.createdAt,
    caffeineResult[0]?.createdAt,
    stepsResult[0]?.createdAt,
    dividerResult[0]?.createdAt
  ].reduce<Date | null>((latest, current) => {
    if (current === null || current === undefined) {
      return latest
    }

    if (latest === null || current.getTime() > latest.getTime()) {
      return current
    }

    return latest
  }, null)

  return latestActivity
}

function getUnlockStatusAfterEntry(beforeStatus: Awaited<ReturnType<typeof calculateUnlockStatus>>, entryAmount: number) {
  const consumedCalories = beforeStatus.consumedCalories + entryAmount
  const overdrawCalories = Math.max(0, consumedCalories - beforeStatus.unlockedCalories)

  return {
    ...beforeStatus,
    consumedCalories,
    availableCalories: Math.max(0, beforeStatus.unlockedCalories - consumedCalories),
    overdrawCalories,
    nextEffectiveUnlockCalories: beforeStatus.allCaloriesUnlockedToday
      ? 0
      : Math.max(0, beforeStatus.nextScheduledUnlockCalories - overdrawCalories)
  }
}

async function sendAlertSafely(notifier: AlertNotifier, message: AlertEmail) {
  try {
    await notifier.send(message)
  } catch (error) {
    console.error('Failed to send alert email', error)
  }
}
