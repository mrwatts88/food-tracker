import { loadConfig } from './config'
import { createPool, createDatabase } from './db/client'
import { runMigrations } from './db/run-migrations'
import { calorieEntries, weightEntries } from './db/schema'

async function main() {
  const config = loadConfig()
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to seed the database')
  }

  const pool = createPool(config.databaseUrl)
  const db = createDatabase(pool)
  const now = new Date()

  try {
    await runMigrations(pool)

    for (let index = 0; index <= 27; index += 1) {
      const date = new Date(now)
      date.setUTCDate(date.getUTCDate() - index)

      await db
        .insert(weightEntries)
        .values({
          amount: 202.9,
          createdAt: date.toISOString().slice(0, 10)
        })
        .onConflictDoUpdate({
          target: weightEntries.createdAt,
          set: { amount: 202.9 }
        })
    }

    for (let index = 1; index <= 28; index += 1) {
      const date = new Date(now)
      date.setUTCDate(date.getUTCDate() - index)

      await db.insert(calorieEntries).values({
        amount: 2500,
        createdAt: date
      })
    }
  } finally {
    await pool.end()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
