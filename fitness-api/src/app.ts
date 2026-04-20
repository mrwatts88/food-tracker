import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'

import { loadConfig, type AppConfig } from './config'
import { getDatabase, type Database } from './db/client'
import {
  caffeineEntries,
  calorieEntries,
  nutritionGoals,
  proteinEntries,
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
import { getGoalConfig } from './lib/goals'
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

const weightDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
type NutritionRoutePath = 'protein' | 'sugar' | 'caffeine'
type NutritionAlertMetric = 'sugar' | 'caffeine'
type NutritionEntryTable = typeof proteinEntries | typeof sugarEntries | typeof caffeineEntries
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
    const goalConfig = await getGoalConfig(runtime.db)

    const unlockStatus = await calculateUnlockStatus({
      db: runtime.db,
      now: runtime.now(),
      timezone: runtime.config.appTimezone,
      schedule: runtime.config.calorieUnlockSchedule,
      fallbackGoal: runtime.config.calorieUnlockFallbackGoal,
      calorieDeficit: goalConfig.calorieDeficit
    })

    return c.json(unlockStatus)
  })

  app.post('/calories', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    const input = calorieEntrySchema.parse(await c.req.json())
    const createdAt = runtime.now()
    const activeNotifier = runtime.notifier
    const beforeStatus =
      activeNotifier === null
        ? null
        : await calculateUnlockStatus({
            db: runtime.db,
            now: createdAt,
            timezone: runtime.config.appTimezone,
            schedule: runtime.config.calorieUnlockSchedule,
            fallbackGoal: runtime.config.calorieUnlockFallbackGoal,
            calorieDeficit: (await getGoalConfig(runtime.db)).calorieDeficit
          })

    const [entry] = await runtime.db
      .insert(calorieEntries)
      .values({
        amount: input.amount,
        createdAt
      })
      .returning()

    const createdEntry = assertFound(entry, 'Failed to create calorie entry')

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

    await runtime.db.delete(calorieEntries).where(eq(calorieEntries.id, id))

    return c.body(null, 200)
  })

  registerNutritionEntryRoutes(app, dependencies, config, notifier, 'protein', proteinEntries)
  registerNutritionEntryRoutes(app, dependencies, config, notifier, 'sugar', sugarEntries)
  registerNutritionEntryRoutes(app, dependencies, config, notifier, 'caffeine', caffeineEntries)

  app.get('/nutrition/goals', async c => {
    const runtime = getRuntime(dependencies, config, notifier)
    return c.json(await getGoalConfig(runtime.db))
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

    const [entry] = await runtime.db
      .insert(table)
      .values({
        amount: input.amount,
        createdAt
      })
      .returning()

    const createdEntry = assertFound(entry, `Failed to create ${path} entry`)

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

    await runtime.db.delete(table).where(eq(table.id, id))

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
  if (path === 'protein') {
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
