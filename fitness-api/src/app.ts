import { desc, eq, gte } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'

import { loadConfig, type AppConfig } from './config'
import { getDatabase, type Database } from './db/client'
import { calorieEntries, proteinEntries, weightEntries } from './db/schema'
import { calculateUnlockStatus } from './lib/calorie-unlock'
import { formatDate, formatTimestamp, getTodayBounds } from './lib/time'
import { calculateTdeeStats } from './lib/tdee'

type AppDependencies = {
  db?: Database
  now?: () => Date
  config?: AppConfig
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

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono().basePath('/api')
  const config = dependencies.config ?? loadConfig()

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

  app.get('/calories', async c => {
    const runtime = getRuntime(dependencies)
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
    const runtime = getRuntime(dependencies)

    const unlockStatus = await calculateUnlockStatus({
      db: runtime.db,
      now: runtime.now(),
      timezone: runtime.config.appTimezone,
      schedule: runtime.config.calorieUnlockSchedule,
      fallbackGoal: runtime.config.calorieUnlockFallbackGoal
    })

    return c.json(unlockStatus)
  })

  app.post('/calories', async c => {
    const runtime = getRuntime(dependencies)
    const input = calorieEntrySchema.parse(await c.req.json())

    const [entry] = await runtime.db
      .insert(calorieEntries)
      .values({
        amount: input.amount,
        createdAt: runtime.now()
      })
      .returning()

    const createdEntry = assertFound(entry, 'Failed to create calorie entry')

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
    const runtime = getRuntime(dependencies)
    const id = parsePositiveInteger(c.req.param('id'), 'id')

    await runtime.db.delete(calorieEntries).where(eq(calorieEntries.id, id))

    return c.body(null, 200)
  })

  app.get('/protein', async c => {
    const runtime = getRuntime(dependencies)
    const today = getTodayBounds(runtime.now(), runtime.config.appTimezone)

    const entries = await runtime.db
      .select()
      .from(proteinEntries)
      .where(gte(proteinEntries.createdAt, today.startUtc))
      .orderBy(desc(proteinEntries.createdAt))

    return c.json(
      entries.map(entry => ({
        id: entry.id,
        amount: entry.amount,
        createdAt: formatTimestamp(entry.createdAt, runtime.config.appTimezone)
      }))
    )
  })

  app.post('/protein', async c => {
    const runtime = getRuntime(dependencies)
    const input = calorieEntrySchema.parse(await c.req.json())

    const [entry] = await runtime.db
      .insert(proteinEntries)
      .values({
        amount: input.amount,
        createdAt: runtime.now()
      })
      .returning()

    const createdEntry = assertFound(entry, 'Failed to create protein entry')

    return c.json(
      {
        id: createdEntry.id,
        amount: createdEntry.amount,
        createdAt: formatTimestamp(createdEntry.createdAt, runtime.config.appTimezone)
      },
      201
    )
  })

  app.delete('/protein/:id', async c => {
    const runtime = getRuntime(dependencies)
    const id = parsePositiveInteger(c.req.param('id'), 'id')

    await runtime.db.delete(proteinEntries).where(eq(proteinEntries.id, id))

    return c.body(null, 200)
  })

  app.get('/weight', async c => {
    const runtime = getRuntime(dependencies)
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
    const runtime = getRuntime(dependencies)
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
    const runtime = getRuntime(dependencies)
    const date = weightDateSchema.parse(c.req.param('date'))

    await runtime.db.delete(weightEntries).where(eq(weightEntries.createdAt, date))

    return c.body(null, 200)
  })

  app.get('/tdee', async c => {
    const runtime = getRuntime(dependencies)
    const stats = await calculateTdeeStats(runtime.db, runtime.now(), runtime.config.appTimezone)

    return c.json({
      ...stats,
      goalWeight: runtime.config.goalWeight
    })
  })

  return app
}

export const app = createApp()

function parsePositiveInteger(value: string, field: string) {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, `${field} must be a positive integer`)
  }

  return parsed
}

function getRuntime(dependencies: AppDependencies) {
  return {
    db: dependencies.db ?? getDatabase().db,
    now: dependencies.now ?? (() => new Date()),
    config: dependencies.config ?? loadConfig()
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
