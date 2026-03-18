import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import { createApp } from './app'
import { readMigrationFiles } from './db/run-migrations'
import { calorieEntries, quickAddFoods, schema, weightEntries } from './db/schema'

const now = new Date('2026-03-17T17:00:00.000Z')
const timezone = 'America/Chicago'

const client = new PGlite()
const db = drizzle(client, { schema })
const app = createApp({
  db,
  now: () => now,
  config: {
    appTimezone: timezone,
    port: 3000
  }
})

beforeAll(async () => {
  const migrations = await readMigrationFiles()

  for (const migration of migrations) {
    await client.exec(migration.sql)
  }
})

afterAll(async () => {
  await client.close()
})

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

  it('creates, updates, consumes, and deletes quick add foods', async () => {
    const createResponse = await app.request('/api/quickadd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Greek Yogurt',
        unit: 'cup',
        amount: 1,
        calories: 120,
        fatGrams: 0,
        carbsGrams: 8,
        proteinGrams: 20,
        sugarGrams: 6
      })
    })

    expect(createResponse.status).toBe(201)

    const createdFood = (await createResponse.json()) as {
      id: number
      name: string
      createdAt: string
    }
    expect(createdFood).toMatchObject({
      name: 'Greek Yogurt',
      createdAt: '2026-03-17 12:00:00'
    })

    const updateResponse = await app.request(`/api/quickadd/${createdFood.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Greek Yogurt',
        unit: 'cup',
        amount: 1,
        calories: 140,
        fatGrams: 1,
        carbsGrams: 9,
        proteinGrams: 21,
        sugarGrams: 7
      })
    })

    expect(updateResponse.status).toBe(200)

    const consumeResponse = await app.request(`/api/quickadd/${createdFood.id}/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ multiplier: 2 })
    })

    expect(consumeResponse.status).toBe(201)
    await expect(consumeResponse.json()).resolves.toMatchObject({
      amount: 280
    })

    const listResponse = await app.request('/api/quickadd')
    const foods = (await listResponse.json()) as Array<{ id: number }>
    expect(foods).toHaveLength(1)

    const deleteResponse = await app.request(`/api/quickadd/${createdFood.id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(200)
  })

  it('calculates TDEE from the rolling calorie and weight windows', async () => {
    await db.delete(calorieEntries)
    await db.delete(weightEntries)
    await db.delete(quickAddFoods)

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

    const response = await app.request('/api/tdee')
    const body = (await response.json()) as {
      amount: number
      lossIn2Weeks: number
      eatenPerDay: number
    }

    expect(response.status).toBe(200)
    expect(body).toEqual({
      amount: 3000,
      lossIn2Weeks: 2,
      eatenPerDay: 2500
    })
  })

  it('returns zeros for TDEE when weight history is missing', async () => {
    await db.delete(calorieEntries)
    await db.delete(weightEntries)

    const response = await app.request('/api/tdee')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      amount: 0,
      lossIn2Weeks: 0,
      eatenPerDay: 0
    })
  })
})
