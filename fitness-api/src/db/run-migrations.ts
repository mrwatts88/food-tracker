import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

type Queryable = {
  query: (sql: string) => Promise<unknown>
}

const MIGRATIONS_TABLE = '__fitness_migrations'

export async function runMigrations(
  client: Queryable,
  migrationsDir = path.resolve(import.meta.dirname, '../../drizzle')
) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`
  )

  const files = await readMigrationFiles(migrationsDir)

  for (const file of files) {
    const existing = await client.query(
      `SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE id = '${file.id}' LIMIT 1`
    )

    if (hasRows(existing)) {
      continue
    }

    await client.query(file.sql)
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (id) VALUES ('${file.id}')`)
  }
}

export async function readMigrationFiles(
  migrationsDir = path.resolve(import.meta.dirname, '../../drizzle')
) {
  const files = (await readdir(migrationsDir))
    .filter(file => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))

  return Promise.all(
    files.map(async file => ({
      id: file.replace(/\.sql$/, ''),
      sql: await readFile(path.join(migrationsDir, file), 'utf8')
    }))
  )
}

function hasRows(result: unknown) {
  if (!result || typeof result !== 'object') {
    return false
  }

  if ('rowCount' in result && typeof result.rowCount === 'number') {
    return result.rowCount > 0
  }

  return false
}
