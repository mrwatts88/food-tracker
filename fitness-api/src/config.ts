import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  APP_TIMEZONE: z.string().default('America/Chicago'),
  CALORIE_UNLOCK_SCHEDULE: z
    .string()
    .default('09:00=0.25,12:00=0.25,17:00=0.25,21:00=0.25'),
  CALORIE_UNLOCK_FALLBACK_GOAL: z.coerce.number().int().positive().default(2000),
  GOAL_WEIGHT: z.coerce.number().positive().default(189),
  CORS_ORIGIN: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000)
})

export type AppConfig = {
  databaseUrl?: string
  appTimezone: string
  calorieUnlockSchedule: string
  calorieUnlockFallbackGoal: number
  goalWeight: number
  corsOrigin?: string
  port: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env)

  return {
    databaseUrl: parsed.DATABASE_URL,
    appTimezone: parsed.APP_TIMEZONE,
    calorieUnlockSchedule: parsed.CALORIE_UNLOCK_SCHEDULE,
    calorieUnlockFallbackGoal: parsed.CALORIE_UNLOCK_FALLBACK_GOAL,
    goalWeight: parsed.GOAL_WEIGHT,
    corsOrigin: parsed.CORS_ORIGIN,
    port: parsed.PORT
  }
}
