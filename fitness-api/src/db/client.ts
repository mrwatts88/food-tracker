import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { loadConfig } from '../config'
import { schema } from './schema'

export type Database = NodePgDatabase<typeof schema>

type GlobalCache = typeof globalThis & {
  __fitnessPool?: Pool
  __fitnessDb?: Database
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema })
}

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 1,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
  })
}

export function getDatabase(): { pool: Pool; db: Database } {
  const config = loadConfig()
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required for database access')
  }

  const cache = globalThis as GlobalCache

  if (!cache.__fitnessPool) {
    cache.__fitnessPool = createPool(config.databaseUrl)
  }

  if (!cache.__fitnessDb) {
    cache.__fitnessDb = createDatabase(cache.__fitnessPool)
  }

  return {
    pool: cache.__fitnessPool,
    db: cache.__fitnessDb
  }
}
