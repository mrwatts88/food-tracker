import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  APP_TIMEZONE: z.string().default('America/Chicago'),
  CORS_ORIGIN: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000)
})

export type AppConfig = {
  databaseUrl?: string
  appTimezone: string
  corsOrigin?: string
  port: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env)

  return {
    databaseUrl: parsed.DATABASE_URL,
    appTimezone: parsed.APP_TIMEZONE,
    corsOrigin: parsed.CORS_ORIGIN,
    port: parsed.PORT
  }
}
