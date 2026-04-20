import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type OpenAI from 'openai'

import { createApp } from './app'
import type { AppConfig } from './config'
import { readMigrationFiles } from './db/run-migrations'
import {
  caffeineEntries,
  calorieEntries,
  nutritionGoals,
  proteinEntries,
  schema,
  sugarEntries,
  weightEntries
} from './db/schema'
import type { AlertEmail, AlertNotifier } from './lib/alerts'
import { createVoiceParser, type VoiceParser } from './lib/voice'

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
  openAiApiKey: 'test-openai-key',
  openAiTranscribeModel: 'gpt-4o-mini-transcribe',
  openAiParseModel: 'gpt-5.4-mini',
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

function createTestApp(
  options: {
    now?: Date
    config?: Partial<AppConfig>
    notifier?: AlertNotifier | null
    voiceParser?: VoiceParser | null
  } = {}
) {
  return createApp({
    db,
    now: () => options.now ?? now,
    config: {
      ...defaultConfig,
      ...options.config
    },
    notifier: options.notifier,
    voiceParser: options.voiceParser
  })
}

function createNotifierSpy(options: { fail?: boolean } = {}) {
  const sent: AlertEmail[] = []

  return {
    sent,
    notifier: {
      async send(message) {
        sent.push(message)

        if (options.fail) {
          throw new Error('SMTP unavailable')
        }
      }
    } satisfies AlertNotifier
  }
}

function createAudioFormData(contents = 'audio-bytes') {
  const formData = new FormData()
  formData.set('audio', new File([contents], 'voice.webm', { type: 'audio/webm' }))
  return formData
}

function createOpenAiVoiceParserMock(options: {
  transcript: string
  parsed:
    | {
        items: Array<{
          kind: 'explicit_metric' | 'food_item'
          rawText: string
          name?: string
          quantityText?: string | null
          estimated: Array<{
            metric: 'calorie' | 'protein' | 'sugar' | 'caffeine'
            amount: number
          }>
        }>
        warnings?: string[]
      }
    | null
}) {
  const openai = {
    audio: {
      transcriptions: {
        create: vi.fn(async () => options.transcript)
      }
    },
    responses: {
      parse: vi.fn(async () => ({
        output_parsed:
          options.parsed === null
            ? null
            : {
                items: options.parsed.items,
                warnings: options.parsed.warnings ?? []
              }
      }))
    }
  } as unknown as Pick<OpenAI, 'audio' | 'responses'>

  const parser = createVoiceParser(defaultConfig, { openai })

  if (parser === null) {
    throw new Error('Expected voice parser to be created in tests')
  }

  return {
    parser,
    openai
  }
}

async function clearTrackingData() {
  await db.delete(calorieEntries)
  await db.delete(proteinEntries)
  await db.delete(sugarEntries)
  await db.delete(caffeineEntries)
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

  it('parses explicit metric speech without inferring calories', async () => {
    const { parser, openai } = createOpenAiVoiceParserMock({
      transcript: 'add 4 grams protein, 20 grams sugar, and 100 mg caffeine',
      parsed: {
        items: [
          {
            kind: 'explicit_metric',
            rawText: '4 grams protein',
            estimated: [{ metric: 'protein', amount: 4 }]
          },
          {
            kind: 'explicit_metric',
            rawText: '20 grams sugar',
            estimated: [{ metric: 'sugar', amount: 20 }]
          },
          {
            kind: 'explicit_metric',
            rawText: '100 mg caffeine',
            estimated: [{ metric: 'caffeine', amount: 100 }]
          }
        ]
      }
    })
    const voiceApp = createTestApp({ voiceParser: parser })

    const response = await voiceApp.request('/api/voice/parse', {
      method: 'POST',
      body: createAudioFormData()
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      transcript: 'add 4 grams protein, 20 grams sugar, and 100 mg caffeine',
      items: [
        {
          kind: 'explicit_metric',
          rawText: '4 grams protein',
          quantityText: null,
          estimated: [{ metric: 'protein', amount: 4 }]
        },
        {
          kind: 'explicit_metric',
          rawText: '20 grams sugar',
          quantityText: null,
          estimated: [{ metric: 'sugar', amount: 20 }]
        },
        {
          kind: 'explicit_metric',
          rawText: '100 mg caffeine',
          quantityText: null,
          estimated: [{ metric: 'caffeine', amount: 100 }]
        }
      ],
      totals: {
        calorie: 0,
        protein: 4,
        sugar: 20,
        caffeine: 100
      },
      warnings: []
    })
    expect(openai.audio.transcriptions.create).toHaveBeenCalledWith({
      file: expect.any(File),
      model: 'gpt-4o-mini-transcribe',
      response_format: 'text'
    })
    expect(openai.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4-mini'
      })
    )
  })

  it('parses explicit calories alongside other direct metrics', async () => {
    const { parser } = createOpenAiVoiceParserMock({
      transcript: 'add 300 calories and 10 grams protein',
      parsed: {
        items: [
          {
            kind: 'explicit_metric',
            rawText: '300 calories',
            estimated: [{ metric: 'calorie', amount: 300 }]
          },
          {
            kind: 'explicit_metric',
            rawText: '10 grams protein',
            estimated: [{ metric: 'protein', amount: 10 }]
          }
        ]
      }
    })
    const voiceApp = createTestApp({ voiceParser: parser })

    const response = await voiceApp.request('/api/voice/parse', {
      method: 'POST',
      body: createAudioFormData()
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      totals: {
        calorie: 300,
        protein: 10,
        sugar: 0,
        caffeine: 0
      }
    })
  })

  it('does not infer calories from macro-only speech', async () => {
    const { parser } = createOpenAiVoiceParserMock({
      transcript: 'add 10 grams protein',
      parsed: {
        items: [
          {
            kind: 'explicit_metric',
            rawText: '10 grams protein',
            estimated: [
              { metric: 'protein', amount: 10 },
              { metric: 'calorie', amount: 0 }
            ]
          }
        ]
      }
    })
    const voiceApp = createTestApp({ voiceParser: parser })

    const response = await voiceApp.request('/api/voice/parse', {
      method: 'POST',
      body: createAudioFormData()
    })
    const body = (await response.json()) as {
      totals: Record<'calorie' | 'protein' | 'sugar' | 'caffeine', number>
      items: Array<{
        estimated: Array<{ metric: string; amount: number }>
      }>
    }

    expect(response.status).toBe(200)
    expect(body.totals).toEqual({
      calorie: 0,
      protein: 10,
      sugar: 0,
      caffeine: 0
    })
    expect(body.items[0]?.estimated).toEqual([{ metric: 'protein', amount: 10 }])
  })

  it('returns estimated totals for food item speech', async () => {
    const { parser } = createOpenAiVoiceParserMock({
      transcript: 'add one banana',
      parsed: {
        items: [
          {
            kind: 'food_item',
            rawText: 'one banana',
            name: 'banana',
            quantityText: 'one',
            estimated: [
              { metric: 'calorie', amount: 105 },
              { metric: 'protein', amount: 1 },
              { metric: 'sugar', amount: 14 }
            ]
          }
        ]
      }
    })
    const voiceApp = createTestApp({ voiceParser: parser })

    const response = await voiceApp.request('/api/voice/parse', {
      method: 'POST',
      body: createAudioFormData()
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      transcript: 'add one banana',
      totals: {
        calorie: 105,
        protein: 1,
        sugar: 14,
        caffeine: 0
      },
      items: [
        {
          kind: 'food_item',
          name: 'banana',
          quantityText: 'one'
        }
      ]
    })
  })

  it('combines food-derived estimates with explicit metrics', async () => {
    const { parser } = createOpenAiVoiceParserMock({
      transcript: 'add a protein bar and 100 mg caffeine',
      parsed: {
        items: [
          {
            kind: 'food_item',
            rawText: 'a protein bar',
            name: 'protein bar',
            quantityText: 'a',
            estimated: [
              { metric: 'calorie', amount: 200 },
              { metric: 'protein', amount: 20 },
              { metric: 'sugar', amount: 8 }
            ]
          },
          {
            kind: 'explicit_metric',
            rawText: '100 mg caffeine',
            estimated: [{ metric: 'caffeine', amount: 100 }]
          }
        ]
      }
    })
    const voiceApp = createTestApp({ voiceParser: parser })

    const response = await voiceApp.request('/api/voice/parse', {
      method: 'POST',
      body: createAudioFormData()
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      totals: {
        calorie: 200,
        protein: 20,
        sugar: 8,
        caffeine: 100
      }
    })
  })

  it('returns warnings for empty or unsupported transcripts', async () => {
    const emptyMock = createOpenAiVoiceParserMock({
      transcript: '   ',
      parsed: {
        items: [],
        warnings: []
      }
    })
    const emptyApp = createTestApp({ voiceParser: emptyMock.parser })

    const emptyResponse = await emptyApp.request('/api/voice/parse', {
      method: 'POST',
      body: createAudioFormData()
    })

    expect(emptyResponse.status).toBe(200)
    await expect(emptyResponse.json()).resolves.toEqual({
      transcript: '',
      items: [],
      totals: {
        calorie: 0,
        protein: 0,
        sugar: 0,
        caffeine: 0
      },
      warnings: ['No speech was detected.']
    })
    expect(emptyMock.openai.responses.parse).not.toHaveBeenCalled()

    const unsupportedMock = createOpenAiVoiceParserMock({
      transcript: 'log my vibes',
      parsed: {
        items: [],
        warnings: ['No nutrition entries were detected from the request.']
      }
    })
    const unsupportedApp = createTestApp({ voiceParser: unsupportedMock.parser })

    const unsupportedResponse = await unsupportedApp.request('/api/voice/parse', {
      method: 'POST',
      body: createAudioFormData()
    })

    expect(unsupportedResponse.status).toBe(200)
    await expect(unsupportedResponse.json()).resolves.toMatchObject({
      transcript: 'log my vibes',
      items: [],
      totals: {
        calorie: 0,
        protein: 0,
        sugar: 0,
        caffeine: 0
      },
      warnings: ['No nutrition entries were detected from the request.']
    })
  })

  it('rejects malformed voice parse uploads', async () => {
    const response = await app.request('/api/voice/parse', {
      method: 'POST',
      body: 'not multipart'
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid multipart form data'
    })
  })

  it('returns the default nutrition goals', async () => {
    const response = await app.request('/api/nutrition/goals')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      protein: 100,
      sugar: 80,
      caffeine: 280,
      calorieDeficit: 250
    })
  })

  it('returns updated nutrition goals from the config table', async () => {
    await db
      .insert(nutritionGoals)
      .values({ metric: 'protein', amount: 120 })
      .onConflictDoUpdate({
        target: nutritionGoals.metric,
        set: { amount: 120 }
      })

    const response = await app.request('/api/nutrition/goals')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      protein: 120,
      sugar: 80,
      caffeine: 280,
      calorieDeficit: 250
    })

    await db
      .insert(nutritionGoals)
      .values({ metric: 'protein', amount: 100 })
      .onConflictDoUpdate({
        target: nutritionGoals.metric,
        set: { amount: 100 }
      })
  })

  it('falls back to default goals when the nutrition goals table has not been migrated yet', async () => {
    const legacyClient = new PGlite()
    const legacyDb = drizzle(legacyClient, { schema })

    try {
      const migrations = await readMigrationFiles()

      for (const migration of migrations.filter(migration => migration.id !== '0004_nutrition_goals')) {
        await legacyClient.exec(migration.sql)
      }

      const legacyApp = createApp({
        db: legacyDb,
        now: () => now,
        config: defaultConfig
      })

      const goalsResponse = await legacyApp.request('/api/nutrition/goals')
      expect(goalsResponse.status).toBe(200)
      await expect(goalsResponse.json()).resolves.toEqual({
        protein: 100,
        sugar: 80,
        caffeine: 280,
        calorieDeficit: 250
      })

      const unlockResponse = await legacyApp.request('/api/calories/unlock-status')
      const unlockBody = (await unlockResponse.json()) as {
        dailyTargetCalories: number
      }

      expect(unlockResponse.status).toBe(200)
      expect(unlockBody).toMatchObject({
        dailyTargetCalories: 2000
      })
    } finally {
      await legacyClient.close()
    }
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

  it('uses the configured calorie deficit when deriving the calorie goal', async () => {
    await seedTdeeFixture()
    await db
      .insert(nutritionGoals)
      .values({ metric: 'calorie_deficit', amount: 300 })
      .onConflictDoUpdate({
        target: nutritionGoals.metric,
        set: { amount: 300 }
      })

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
      dailyTargetCalories: 2700,
      unlockedCalories: 1350,
      nextScheduledUnlockCalories: 675,
      nextEffectiveUnlockCalories: 675
    })

    await db
      .insert(nutritionGoals)
      .values({ metric: 'calorie_deficit', amount: 250 })
      .onConflictDoUpdate({
        target: nutritionGoals.metric,
        set: { amount: 250 }
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

  it('sends a calorie borrow alert when a post first overdraws from the next unlock', async () => {
    await clearTrackingData()
    const notifierSpy = createNotifierSpy()
    const alertApp = createTestApp({
      now: new Date('2026-03-17T15:30:00.000Z'),
      notifier: notifierSpy.notifier
    })

    const response = await alertApp.request('/api/calories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 800 })
    })

    expect(response.status).toBe(201)
    expect(notifierSpy.sent).toHaveLength(1)
    expect(notifierSpy.sent[0]).toMatchObject({
      subject: 'Calorie alert'
    })
    expect(notifierSpy.sent[0]?.text).toContain('Overdrawn: 300 calories')
    expect(notifierSpy.sent[0]?.text).toContain('Next effective unlock: 200 calories')
  })

  it('sends a calorie daily-limit alert when a post first exceeds the full-day target', async () => {
    await clearTrackingData()
    await db.insert(calorieEntries).values({
      amount: 1900,
      createdAt: new Date('2026-03-17T18:00:00.000Z')
    })

    const notifierSpy = createNotifierSpy()
    const alertApp = createTestApp({
      now: new Date('2026-03-18T03:30:00.000Z'),
      notifier: notifierSpy.notifier
    })

    const response = await alertApp.request('/api/calories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 200 })
    })

    expect(response.status).toBe(201)
    expect(notifierSpy.sent).toHaveLength(1)
    expect(notifierSpy.sent[0]).toMatchObject({
      subject: 'Calorie alert'
    })
    expect(notifierSpy.sent[0]?.text).toContain('Over daily target by: 100 calories')
  })

  it('sends one combined calorie alert when a single post triggers borrow and daily-limit crossings', async () => {
    await clearTrackingData()
    await db.insert(calorieEntries).values({
      amount: 500,
      createdAt: new Date('2026-03-17T14:15:00.000Z')
    })

    const notifierSpy = createNotifierSpy()
    const alertApp = createTestApp({
      now: new Date('2026-03-17T15:30:00.000Z'),
      notifier: notifierSpy.notifier
    })

    const response = await alertApp.request('/api/calories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1600 })
    })

    expect(response.status).toBe(201)
    expect(notifierSpy.sent).toHaveLength(1)
    expect(notifierSpy.sent[0]?.text).toContain('Overdrawn: 1600 calories')
    expect(notifierSpy.sent[0]?.text).toContain('Over daily target by: 100 calories')
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

  it('creates, lists, and deletes sugar entries for the current local day', async () => {
    await db.insert(sugarEntries).values({
      amount: 12,
      createdAt: new Date('2026-03-17T04:59:59.000Z')
    })

    const createResponse = await app.request('/api/sugar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 18 })
    })

    expect(createResponse.status).toBe(201)

    const listResponse = await app.request('/api/sugar')
    const entries = (await listResponse.json()) as Array<{
      id: number
      amount: number
      createdAt: string
    }>

    expect(listResponse.status).toBe(200)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      amount: 18,
      createdAt: '2026-03-17 12:00:00'
    })

    const deleteResponse = await app.request(`/api/sugar/${entries[0].id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(200)
  })

  it('treats deleting a missing sugar entry as a success', async () => {
    const response = await app.request('/api/sugar/999999', {
      method: 'DELETE'
    })

    expect(response.status).toBe(200)
  })

  it('sends a sugar alert only when an entry crosses the daily limit', async () => {
    await clearTrackingData()
    await db.insert(sugarEntries).values({
      amount: 70,
      createdAt: new Date('2026-03-17T14:00:00.000Z')
    })

    const notifierSpy = createNotifierSpy()
    const alertApp = createTestApp({
      notifier: notifierSpy.notifier
    })

    const underLimitResponse = await alertApp.request('/api/sugar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 5 })
    })

    expect(underLimitResponse.status).toBe(201)
    expect(notifierSpy.sent).toHaveLength(0)

    const crossingResponse = await alertApp.request('/api/sugar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 10 })
    })

    expect(crossingResponse.status).toBe(201)
    expect(notifierSpy.sent).toHaveLength(1)
    expect(notifierSpy.sent[0]).toMatchObject({
      subject: 'Sugar limit exceeded'
    })
    expect(notifierSpy.sent[0]?.text).toContain('Daily total: 85 g')
  })

  it('creates, lists, and deletes caffeine entries for the current local day', async () => {
    await db.insert(caffeineEntries).values({
      amount: 80,
      createdAt: new Date('2026-03-17T04:59:59.000Z')
    })

    const createResponse = await app.request('/api/caffeine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 120 })
    })

    expect(createResponse.status).toBe(201)

    const listResponse = await app.request('/api/caffeine')
    const entries = (await listResponse.json()) as Array<{
      id: number
      amount: number
      createdAt: string
    }>

    expect(listResponse.status).toBe(200)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      amount: 120,
      createdAt: '2026-03-17 12:00:00'
    })

    const deleteResponse = await app.request(`/api/caffeine/${entries[0].id}`, {
      method: 'DELETE'
    })

    expect(deleteResponse.status).toBe(200)
  })

  it('treats deleting a missing caffeine entry as a success', async () => {
    const response = await app.request('/api/caffeine/999999', {
      method: 'DELETE'
    })

    expect(response.status).toBe(200)
  })

  it('sends a caffeine alert only on the first over-limit post for the day', async () => {
    await clearTrackingData()
    await db.insert(caffeineEntries).values({
      amount: 260,
      createdAt: new Date('2026-03-17T14:00:00.000Z')
    })

    const notifierSpy = createNotifierSpy()
    const alertApp = createTestApp({
      notifier: notifierSpy.notifier
    })

    const crossingResponse = await alertApp.request('/api/caffeine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 30 })
    })

    expect(crossingResponse.status).toBe(201)
    expect(notifierSpy.sent).toHaveLength(1)
    expect(notifierSpy.sent[0]).toMatchObject({
      subject: 'Caffeine limit exceeded'
    })
    expect(notifierSpy.sent[0]?.text).toContain('Daily total: 290 mg')

    const alreadyOverResponse = await alertApp.request('/api/caffeine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 20 })
    })

    expect(alreadyOverResponse.status).toBe(201)
    expect(notifierSpy.sent).toHaveLength(1)
  })

  it('does not send alerts for delete routes', async () => {
    await clearTrackingData()
    const notifierSpy = createNotifierSpy()
    const alertApp = createTestApp({
      notifier: notifierSpy.notifier
    })

    const [calorieEntry] = await db
      .insert(calorieEntries)
      .values({
        amount: 600,
        createdAt: now
      })
      .returning()
    const [sugarEntry] = await db
      .insert(sugarEntries)
      .values({
        amount: 90,
        createdAt: now
      })
      .returning()

    expect(calorieEntry).toBeDefined()
    expect(sugarEntry).toBeDefined()

    const calorieDeleteResponse = await alertApp.request(`/api/calories/${calorieEntry?.id}`, {
      method: 'DELETE'
    })
    const sugarDeleteResponse = await alertApp.request(`/api/sugar/${sugarEntry?.id}`, {
      method: 'DELETE'
    })

    expect(calorieDeleteResponse.status).toBe(200)
    expect(sugarDeleteResponse.status).toBe(200)
    expect(notifierSpy.sent).toHaveLength(0)
  })

  it('keeps writes successful when alert sending fails', async () => {
    await clearTrackingData()
    await db.insert(sugarEntries).values({
      amount: 75,
      createdAt: new Date('2026-03-17T14:00:00.000Z')
    })

    const notifierSpy = createNotifierSpy({ fail: true })
    const alertApp = createTestApp({
      notifier: notifierSpy.notifier
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const response = await alertApp.request('/api/sugar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 10 })
      })

      expect(response.status).toBe(201)
      expect(notifierSpy.sent).toHaveLength(1)

      const listResponse = await alertApp.request('/api/sugar')
      const entries = (await listResponse.json()) as Array<{ amount: number }>

      expect(entries.some(entry => entry.amount === 10)).toBe(true)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('skips alerts entirely when no notifier is configured', async () => {
    await clearTrackingData()
    await db.insert(sugarEntries).values({
      amount: 75,
      createdAt: new Date('2026-03-17T14:00:00.000Z')
    })

    const alertApp = createTestApp()
    const response = await alertApp.request('/api/sugar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 10 })
    })

    expect(response.status).toBe(201)
  })

  it('calculates TDEE from the rolling calorie and weight windows', async () => {
    await seedTdeeFixture()

    const response = await app.request('/api/tdee')
    const body = (await response.json()) as {
      amount: number
      lossIn2Weeks: number
      eatenPerDay: number
      goalWeight: number
      calorieDeficit: number
    }

    expect(response.status).toBe(200)
    expect(body).toEqual({
      amount: 3000,
      lossIn2Weeks: 2,
      eatenPerDay: 2500,
      goalWeight: 189,
      calorieDeficit: 250
    })
  })

  it('returns zeros for TDEE when weight history is missing', async () => {
    await db.delete(calorieEntries)
    await db.delete(proteinEntries)
    await db.delete(sugarEntries)
    await db.delete(caffeineEntries)
    await db.delete(weightEntries)

    const response = await app.request('/api/tdee')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      amount: 0,
      lossIn2Weeks: 0,
      eatenPerDay: 0,
      goalWeight: 189,
      calorieDeficit: 250
    })
  })
})
