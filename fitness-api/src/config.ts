import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1).optional(),
    APP_TIMEZONE: z.string().default('America/Chicago'),
    CALORIE_UNLOCK_SCHEDULE: z
      .string()
      .default('09:00=0.25,12:00=0.25,17:00=0.25,21:00=0.25'),
    CALORIE_UNLOCK_FALLBACK_GOAL: z.coerce.number().int().positive().default(2000),
    GOAL_WEIGHT: z.coerce.number().positive().default(189),
    GMAIL_ALERT_ADDRESS: z.string().email().optional(),
    GMAIL_ALERT_APP_PASSWORD: z.string().min(1).optional(),
    CORS_ORIGIN: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(3000)
  })
  .superRefine((env, ctx) => {
    const hasAlertAddress = Boolean(env.GMAIL_ALERT_ADDRESS)
    const hasAlertPassword = Boolean(env.GMAIL_ALERT_APP_PASSWORD)

    if (hasAlertAddress === hasAlertPassword) {
      return
    }

    ctx.addIssue({
      code: 'custom',
      message: 'GMAIL_ALERT_ADDRESS and GMAIL_ALERT_APP_PASSWORD must both be provided to enable Gmail alerts'
    })
  })

export type AppConfig = {
  databaseUrl?: string
  appTimezone: string
  calorieUnlockSchedule: string
  calorieUnlockFallbackGoal: number
  goalWeight: number
  gmailAlertAddress?: string
  gmailAlertAppPassword?: string
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
    gmailAlertAddress: parsed.GMAIL_ALERT_ADDRESS,
    gmailAlertAppPassword: parsed.GMAIL_ALERT_APP_PASSWORD,
    corsOrigin: parsed.CORS_ORIGIN,
    port: parsed.PORT
  }
}
