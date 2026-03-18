import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'

import { loadConfig, type AppConfig } from './config'
import { getDatabase, type Database } from './db/client'
import { calorieEntries, quickAddFoods, weightEntries } from './db/schema'
import { formatDate, formatTimestamp, getDateRange, getDateRangeStrings, getTodayBounds } from './lib/time'

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

const quickAddFoodSchema = z.object({
  name: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  amount: z.number().positive(),
  calories: z.number().int().nonnegative(),
  fatGrams: z.number().nonnegative(),
  carbsGrams: z.number().nonnegative(),
  proteinGrams: z.number().nonnegative(),
  sugarGrams: z.number().nonnegative()
})

const consumeSchema = z.object({
  multiplier: z.number().int().positive()
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

    const [deleted] = await runtime.db
      .delete(calorieEntries)
      .where(eq(calorieEntries.id, id))
      .returning({ id: calorieEntries.id })

    if (!deleted) {
      throw new ApiError(404, 'Calorie entry not found')
    }

    return c.body(null, 200)
  })

  app.get('/weight', async c => {
    const runtime = getRuntime(dependencies)
    const entries = await runtime.db
      .select()
      .from(weightEntries)
      .orderBy(desc(weightEntries.createdAt))
      .limit(90)

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

    const [deleted] = await runtime.db
      .delete(weightEntries)
      .where(eq(weightEntries.createdAt, date))
      .returning({ createdAt: weightEntries.createdAt })

    if (!deleted) {
      throw new ApiError(404, 'Weight entry not found')
    }

    return c.body(null, 200)
  })

  app.get('/quickadd', async c => {
    const runtime = getRuntime(dependencies)
    const foods = await runtime.db.select().from(quickAddFoods).orderBy(asc(quickAddFoods.name))

    return c.json(
      foods.map(food => ({
        id: food.id,
        name: food.name,
        unit: food.unit,
        amount: food.amount,
        calories: food.calories,
        fatGrams: food.fatGrams,
        carbsGrams: food.carbsGrams,
        proteinGrams: food.proteinGrams,
        sugarGrams: food.sugarGrams,
        createdAt: formatTimestamp(food.createdAt, runtime.config.appTimezone)
      }))
    )
  })

  app.post('/quickadd', async c => {
    const runtime = getRuntime(dependencies)
    const input = quickAddFoodSchema.parse(await c.req.json())

    const [food] = await runtime.db
      .insert(quickAddFoods)
      .values({
        ...input,
        createdAt: runtime.now()
      })
      .returning()

    const createdFood = assertFound(food, 'Failed to create quick add food')

    return c.json(
      {
        id: createdFood.id,
        name: createdFood.name,
        unit: createdFood.unit,
        amount: createdFood.amount,
        calories: createdFood.calories,
        fatGrams: createdFood.fatGrams,
        carbsGrams: createdFood.carbsGrams,
        proteinGrams: createdFood.proteinGrams,
        sugarGrams: createdFood.sugarGrams,
        createdAt: formatTimestamp(createdFood.createdAt, runtime.config.appTimezone)
      },
      201
    )
  })

  app.put('/quickadd/:id', async c => {
    const runtime = getRuntime(dependencies)
    const id = parsePositiveInteger(c.req.param('id'), 'id')
    const input = quickAddFoodSchema.parse(await c.req.json())

    const [food] = await runtime.db
      .update(quickAddFoods)
      .set(input)
      .where(eq(quickAddFoods.id, id))
      .returning()

    if (!food) {
      throw new ApiError(404, 'Quick add food not found')
    }

    return c.json(
      {
        id: food.id,
        name: food.name,
        unit: food.unit,
        amount: food.amount,
        calories: food.calories,
        fatGrams: food.fatGrams,
        carbsGrams: food.carbsGrams,
        proteinGrams: food.proteinGrams,
        sugarGrams: food.sugarGrams,
        createdAt: formatTimestamp(food.createdAt, runtime.config.appTimezone)
      },
      200
    )
  })

  app.delete('/quickadd/:id', async c => {
    const runtime = getRuntime(dependencies)
    const id = parsePositiveInteger(c.req.param('id'), 'id')

    const [deleted] = await runtime.db
      .delete(quickAddFoods)
      .where(eq(quickAddFoods.id, id))
      .returning({ id: quickAddFoods.id })

    if (!deleted) {
      throw new ApiError(404, 'Quick add food not found')
    }

    return c.body(null, 200)
  })

  app.post('/quickadd/:id/consume', async c => {
    const runtime = getRuntime(dependencies)
    const id = parsePositiveInteger(c.req.param('id'), 'id')
    const input = consumeSchema.parse(await c.req.json())

    const [food] = await runtime.db
      .select({ calories: quickAddFoods.calories })
      .from(quickAddFoods)
      .where(eq(quickAddFoods.id, id))
      .limit(1)

    if (!food) {
      throw new ApiError(404, 'Quick add food not found')
    }

    const [entry] = await runtime.db
      .insert(calorieEntries)
      .values({
        amount: food.calories * input.multiplier,
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

  app.get('/tdee', async c => {
    const runtime = getRuntime(dependencies)
    const now = runtime.now()
    const timezone = runtime.config.appTimezone

    const calorieRange = getDateRange(now, timezone, 28, 1)
    const recentWeightRange = getDateRangeStrings(now, timezone, 13, 0)
    const previousWeightRange = getDateRangeStrings(now, timezone, 27, 14)

    const calories = await runtime.db
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

    const recentWeights = await runtime.db
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

    const previousWeights = await runtime.db
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
      return c.json({
        amount: 0,
        lossIn2Weeks: 0,
        eatenPerDay
      })
    }

    const recentAverage = average(recentWeights.map(entry => entry.amount))
    const previousAverage = average(previousWeights.map(entry => entry.amount))
    const lossIn2Weeks = previousAverage - recentAverage
    const foodCaloriesBurned = totalCalories / 2
    const fatCaloriesBurned = lossIn2Weeks * 3500
    const tdee = Math.round((foodCaloriesBurned + fatCaloriesBurned) / 14)

    return c.json({
      amount: Number.isFinite(tdee) ? tdee : 0,
      lossIn2Weeks: Number.isFinite(lossIn2Weeks) ? lossIn2Weeks : 0,
      eatenPerDay: Number.isFinite(eatenPerDay) ? eatenPerDay : 0
    })
  })

  return app
}

export const app = createApp()

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

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
