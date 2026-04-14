import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import { createApp } from './app'
import type { AppConfig } from './config'
import { readMigrationFiles } from './db/run-migrations'
import { calorieEntries, proteinEntries, schema, weightEntries } from './db/schema'

const now = new Date('2026-03-17T17:00:00.000Z')
const timezone = 'America/Chicago'
const defaultUnlockSchedule = '09:00=0.25,12:00=0.25,17:00=0.25,21:00=0.25'

const client = new PGlite()
const db = drizzle(client, { schema })
const defaultConfig: AppConfig = {
  appTimezone: timezone,
  calorieUnlockSchedule: defaultUnlockSchedule,
  calorieUnlockFallbackGoal: 2000,
  goalWeight: 189,
  port: 3000
}
const app = createTestApp()

beforeAll(async () => {
  const migrations = await readMigrationFiles()

  for (const migration of migrations) {
    await client.exec(migration.sql)
  }
})

afterAll(async () => {
  await client.close()
})

function createTestApp(options: { now?: Date; config?: Partial<AppConfig> } = {}) {
  return createApp({
    db,
    now: () => options.now ?? now,
    config: {
      ...defaultConfig,
      ...options.config
    }
  })
}

async function clearTrackingData() {
  await db.delete(calorieEntries)
  await db.delete(proteinEntries)
  await db.delete(weightEntries)
}

async function seedTdeeFixture() {
  await clearTrackingData()

  for (let index = 1; index <= 28; index += 1) {
    const createdAt = new Date(now)
    createdAt.setUTCDate(createdAt.getUTCDate() - index)

    await db.insert(calorieEntries).values({
      amount: 2500,
      createdAt
    })
  }

  for (let index = 0; index <= 13; index += 1) {
    await db.insert(weightEntries).values({
      createdAt: `2026-03-${String(17 - index).padStart(2, '0')}`,
      amount: 198
    })
  }

  const previousWindowDates = [
    '2026-03-03',
    '2026-03-02',
    '2026-03-01',
    '2026-02-28',
    '2026-02-27',
    '2026-02-26',
    '2026-02-25',
    '2026-02-24',
    '2026-02-23',
    '2026-02-22',
    '2026-02-21',
    '2026-02-20',
    '2026-02-19',
    '2026-02-18'
  ]

  for (const createdAt of previousWindowDates) {
    await db.insert(weightEntries).values({
      createdAt,
      amount: 200
    })
  }
}

describe('fitness api', () => {
  it('returns health status', async () => {
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'healthy' })
  })

  it('creates, lists, and deletes calorie entries for the current local day', async () => {
    await db.insert(calorieEntries).values({
      amount: 100,
      createdAt: new Date('2026-03-17T04:59:59.000Z')
    })

    const createResponse = await app.request('/api/calories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 350 })
    })

    expect(createResponse.status).toBe(201)

    const listResponse = await app.request('/api/calories')
    const entries = (await listResponse.json()) as Array<{
      id: number
      amount: number
      createdAt: string
    }>

    expect(listResponse.status).toBe(200)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      amount: 350,
      createdAt: '2026-03-17 12:00:00'
    })

    const deleteResponse = await app.request(`/api/calories/${entries[0].id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(200)
  })

  it('treats deleting a missing calorie entry as a success', async () => {
    const response = await app.request('/api/calories/999999', {
      method: 'DELETE'
    })

    expect(response.status).toBe(200)
  })

  it('returns unlock status before the first unlock window', async () => {
    await clearTrackingData()

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T13:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      dailyTargetCalories: number
      consumedCalories: number
      unlockedCalories: number
      availableCalories: number
      overdrawCalories: number
      nextUnlockAt: string | null
      nextScheduledUnlockCalories: number
      nextEffectiveUnlockCalories: number
      noBorrowUnlockStreak: number
      allCaloriesUnlockedToday: boolean
      timezone: string
      serverNow: string
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      dailyTargetCalories: 2000,
      consumedCalories: 0,
      unlockedCalories: 0,
      availableCalories: 0,
      overdrawCalories: 0,
      nextUnlockAt: '2026-03-17T09:00:00.000-05:00',
      nextScheduledUnlockCalories: 500,
      nextEffectiveUnlockCalories: 500,
      noBorrowUnlockStreak: 0,
      allCaloriesUnlockedToday: false,
      timezone,
      serverNow: '2026-03-17T08:30:00.000-05:00'
    })
  })

  it('returns unlock status between unlock windows', async () => {
    await clearTrackingData()
    await db.insert(calorieEntries).values({
      amount: 300,
      createdAt: new Date('2026-03-17T15:15:00.000Z')
    })

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T17:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      dailyTargetCalories: number
      consumedCalories: number
      unlockedCalories: number
      availableCalories: number
      overdrawCalories: number
      nextUnlockAt: string | null
      nextScheduledUnlockCalories: number
      nextEffectiveUnlockCalories: number
      noBorrowUnlockStreak: number
      allCaloriesUnlockedToday: boolean
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      dailyTargetCalories: 2000,
      consumedCalories: 300,
      unlockedCalories: 1000,
      availableCalories: 700,
      overdrawCalories: 0,
      nextUnlockAt: '2026-03-17T17:00:00.000-05:00',
      nextScheduledUnlockCalories: 500,
      nextEffectiveUnlockCalories: 500,
      noBorrowUnlockStreak: 1,
      allCaloriesUnlockedToday: false
    })
  })

  it('returns unlock status after the final unlock window', async () => {
    await clearTrackingData()
    await db.insert(calorieEntries).values({
      amount: 1900,
      createdAt: new Date('2026-03-17T23:00:00.000Z')
    })

    const unlockApp = createTestApp({
      now: new Date('2026-03-18T02:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      unlockedCalories: number
      availableCalories: number
      overdrawCalories: number
      nextUnlockAt: string | null
      nextScheduledUnlockCalories: number
      nextEffectiveUnlockCalories: number
      noBorrowUnlockStreak: number
      allCaloriesUnlockedToday: boolean
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      unlockedCalories: 2000,
      availableCalories: 100,
      overdrawCalories: 0,
      nextUnlockAt: null,
      nextScheduledUnlockCalories: 0,
      nextEffectiveUnlockCalories: 0,
      noBorrowUnlockStreak: 0,
      allCaloriesUnlockedToday: true
    })
  })

  it('uses the derived calorie goal when TDEE is available', async () => {
    await seedTdeeFixture()

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T17:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      dailyTargetCalories: number
      unlockedCalories: number
      nextScheduledUnlockCalories: number
      nextEffectiveUnlockCalories: number
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      dailyTargetCalories: 2750,
      unlockedCalories: 1374,
      nextScheduledUnlockCalories: 687,
      nextEffectiveUnlockCalories: 687
    })
  })

  it('reduces the next unlock when calories are overdrawn', async () => {
    await clearTrackingData()
    await db.insert(calorieEntries).values({
      amount: 1100,
      createdAt: new Date('2026-03-17T15:00:00.000Z')
    })

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T17:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      availableCalories: number
      overdrawCalories: number
      nextScheduledUnlockCalories: number
      nextEffectiveUnlockCalories: number
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      availableCalories: 0,
      overdrawCalories: 100,
      nextScheduledUnlockCalories: 500,
      nextEffectiveUnlockCalories: 400
    })
  })

  it('zeros out the next unlock when debt exceeds the next scheduled chunk', async () => {
    await clearTrackingData()
    await db.insert(calorieEntries).values({
      amount: 1600,
      createdAt: new Date('2026-03-17T15:00:00.000Z')
    })

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T17:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      overdrawCalories: number
      nextScheduledUnlockCalories: number
      nextEffectiveUnlockCalories: number
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      overdrawCalories: 600,
      nextScheduledUnlockCalories: 500,
      nextEffectiveUnlockCalories: 0
    })
  })

  it('rounds unlock chunks deterministically and preserves the full daily target', async () => {
    await clearTrackingData()

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T22:30:00.000Z'),
      config: {
        calorieUnlockFallbackGoal: 1001
      }
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      dailyTargetCalories: number
      unlockedCalories: number
      nextScheduledUnlockCalories: number
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      dailyTargetCalories: 1001,
      unlockedCalories: 750,
      nextScheduledUnlockCalories: 251
    })
  })

  it('accepts calorie posts while overdrawn and reports the resulting debt', async () => {
    await clearTrackingData()

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T15:30:00.000Z')
    })

    const createResponse = await unlockApp.request('/api/calories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 800 })
    })

    expect(createResponse.status).toBe(201)

    const statusResponse = await unlockApp.request('/api/calories/unlock-status')
    const body = (await statusResponse.json()) as {
      consumedCalories: number
      unlockedCalories: number
      availableCalories: number
      overdrawCalories: number
      nextScheduledUnlockCalories: number
      nextEffectiveUnlockCalories: number
    }

    expect(statusResponse.status).toBe(200)
    expect(body).toMatchObject({
      consumedCalories: 800,
      unlockedCalories: 500,
      availableCalories: 0,
      overdrawCalories: 300,
      nextScheduledUnlockCalories: 500,
      nextEffectiveUnlockCalories: 200
    })
  })

  it('counts a no-borrow streak across multiple completed unlocks and days', async () => {
    await clearTrackingData()

    await db.insert(calorieEntries).values([
      {
        amount: 400,
        createdAt: new Date('2026-03-16T14:30:00.000Z')
      },
      {
        amount: 400,
        createdAt: new Date('2026-03-16T17:30:00.000Z')
      },
      {
        amount: 400,
        createdAt: new Date('2026-03-16T22:30:00.000Z')
      },
      {
        amount: 400,
        createdAt: new Date('2026-03-17T02:30:00.000Z')
      },
      {
        amount: 400,
        createdAt: new Date('2026-03-17T14:30:00.000Z')
      }
    ])

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T18:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      noBorrowUnlockStreak: number
    }

    expect(response.status).toBe(200)
    expect(body.noBorrowUnlockStreak).toBe(5)
  })

  it('resets the no-borrow streak when the most recent completed slot borrowed', async () => {
    await clearTrackingData()
    await db.insert(calorieEntries).values({
      amount: 600,
      createdAt: new Date('2026-03-17T14:30:00.000Z')
    })

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T18:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      noBorrowUnlockStreak: number
    }

    expect(response.status).toBe(200)
    expect(body.noBorrowUnlockStreak).toBe(0)
  })

  it('excludes the current active slot from the no-borrow streak', async () => {
    await clearTrackingData()
    await db.insert(calorieEntries).values([
      {
        amount: 400,
        createdAt: new Date('2026-03-17T14:30:00.000Z')
      },
      {
        amount: 700,
        createdAt: new Date('2026-03-17T17:30:00.000Z')
      }
    ])

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T18:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      availableCalories: number
      overdrawCalories: number
      noBorrowUnlockStreak: number
    }

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      availableCalories: 0,
      overdrawCalories: 100,
      noBorrowUnlockStreak: 1
    })
  })

  it('continues the no-borrow streak across the day boundary before the first unlock', async () => {
    await clearTrackingData()
    await db.insert(calorieEntries).values([
      {
        amount: 400,
        createdAt: new Date('2026-03-16T14:30:00.000Z')
      },
      {
        amount: 400,
        createdAt: new Date('2026-03-16T17:30:00.000Z')
      },
      {
        amount: 400,
        createdAt: new Date('2026-03-16T22:30:00.000Z')
      },
      {
        amount: 400,
        createdAt: new Date('2026-03-17T02:30:00.000Z')
      }
    ])

    const unlockApp = createTestApp({
      now: new Date('2026-03-17T13:30:00.000Z')
    })

    const response = await unlockApp.request('/api/calories/unlock-status')
    const body = (await response.json()) as {
      noBorrowUnlockStreak: number
    }

    expect(response.status).toBe(200)
    expect(body.noBorrowUnlockStreak).toBe(4)
  })

  it('upserts and deletes weight entries by local date', async () => {
    const firstResponse = await app.request('/api/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 185.5 })
    })

    expect(firstResponse.status).toBe(201)

    const secondResponse = await app.request('/api/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 184.9 })
    })

    expect(secondResponse.status).toBe(201)

    const listResponse = await app.request('/api/weight')
    const entries = (await listResponse.json()) as Array<{
      amount: number
      createdAt: string
    }>

    expect(entries[0]).toEqual({
      amount: 184.9,
      createdAt: '2026-03-17'
    })

    const deleteResponse = await app.request('/api/weight/2026-03-17', {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(200)
  })

  it('treats deleting a missing weight entry as a success', async () => {
    const response = await app.request('/api/weight/2026-03-17', {
      method: 'DELETE'
    })

    expect(response.status).toBe(200)
  })

  it('creates, lists, and deletes protein entries for the current local day', async () => {
    await db.insert(proteinEntries).values({
      amount: 25,
      createdAt: new Date('2026-03-17T04:59:59.000Z')
    })

    const createResponse = await app.request('/api/protein', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 40 })
    })

    expect(createResponse.status).toBe(201)

    const listResponse = await app.request('/api/protein')
    const entries = (await listResponse.json()) as Array<{
      id: number
      amount: number
      createdAt: string
    }>

    expect(listResponse.status).toBe(200)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      amount: 40,
      createdAt: '2026-03-17 12:00:00'
    })

    const deleteResponse = await app.request(`/api/protein/${entries[0].id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(200)
  })

  it('treats deleting a missing protein entry as a success', async () => {
    const response = await app.request('/api/protein/999999', {
      method: 'DELETE'
    })

    expect(response.status).toBe(200)
  })

  it('calculates TDEE from the rolling calorie and weight windows', async () => {
    await seedTdeeFixture()

    const response = await app.request('/api/tdee')
    const body = (await response.json()) as {
      amount: number
      lossIn2Weeks: number
      eatenPerDay: number
      goalWeight: number
    }

    expect(response.status).toBe(200)
    expect(body).toEqual({
      amount: 3000,
      lossIn2Weeks: 2,
      eatenPerDay: 2500,
      goalWeight: 189
    })
  })

  it('returns zeros for TDEE when weight history is missing', async () => {
    await db.delete(calorieEntries)
    await db.delete(proteinEntries)
    await db.delete(weightEntries)

    const response = await app.request('/api/tdee')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      amount: 0,
      lossIn2Weeks: 0,
      eatenPerDay: 0,
      goalWeight: 189
    })
  })
})
