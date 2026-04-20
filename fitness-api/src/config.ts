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
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_TRANSCRIBE_MODEL: z.string().default('gpt-4o-mini-transcribe'),
    OPENAI_PARSE_MODEL: z.string().default('gpt-5.4-mini'),
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
  openAiApiKey?: string
  openAiTranscribeModel: string
  openAiParseModel: string
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
    openAiApiKey: parsed.OPENAI_API_KEY,
    openAiTranscribeModel: parsed.OPENAI_TRANSCRIBE_MODEL,
    openAiParseModel: parsed.OPENAI_PARSE_MODEL,
    corsOrigin: parsed.CORS_ORIGIN,
    port: parsed.PORT
  }
}
