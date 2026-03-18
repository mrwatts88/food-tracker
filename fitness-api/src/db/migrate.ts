import { createPool } from './client'
import { runMigrations } from './run-migrations'
import { loadConfig } from '../config'

async function main() {
  const config = loadConfig()
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations')
  }

  const pool = createPool(config.databaseUrl)

  try {
    await runMigrations(pool)
  } finally {
    await pool.end()
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
