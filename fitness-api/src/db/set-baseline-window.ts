import { DateTime } from 'luxon'

import { loadConfig } from '../config'
import { createPool } from './client'

type BaselineOptions = {
  days: number
  weight: number
  calories: number
  endDate: string
}

async function main() {
  const config = loadConfig()

  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required to set a baseline window')
  }

  const options = parseArgs(process.argv.slice(2), config.appTimezone)
  const pool = createPool(config.databaseUrl)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    await client.query(
      `
        insert into weight_entries (created_at, amount)
        select d::date, $3::double precision
        from generate_series($1::date, $2::date, interval '1 day') as g(d)
        on conflict (created_at) do update set amount = excluded.amount
      `,
      [options.startDate, options.endDate, options.weight]
    )

    await client.query(
      `
        delete from calorie_entries
        where (created_at at time zone $1)::date between $2::date and $3::date
      `,
      [config.appTimezone, options.startDate, options.endDate]
    )

    await client.query(
      `
        insert into calorie_entries (amount, created_at)
        select
          $1::integer,
          ((d::timestamp + time '12:00') at time zone $2)
        from generate_series($3::date, $4::date, interval '1 day') as g(d)
      `,
      [options.calories, config.appTimezone, options.startDate, options.endDate]
    )

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  console.log(
    [
      `Baseline window updated.`,
      `Dates: ${options.startDate} through ${options.endDate} (${options.days} days)`,
      `Weight: ${options.weight.toFixed(1)} lb`,
      `Calories: ${options.calories} per day`,
      `Timezone: ${config.appTimezone}`
    ].join('\n')
  )
}

function parseArgs(args: string[], timezone: string) {
  const parsedArgs = new Map<string, string>()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? ''

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const value = args[index + 1]

    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`)
    }

    parsedArgs.set(arg, value)
    index += 1
  }

  const days = parsePositiveInteger(parsedArgs.get('--days') ?? '30', 'days')
  const weight = parsePositiveNumber(parsedArgs.get('--weight') ?? '205', 'weight')
  const calories = parsePositiveInteger(parsedArgs.get('--calories') ?? '2500', 'calories')
  const defaultEndDate =
    DateTime.now().setZone(timezone).toISODate() ?? DateTime.now().setZone(timezone).toFormat('yyyy-LL-dd')
  const endDate = parseDate(parsedArgs.get('--end-date') ?? defaultEndDate, 'end-date')
  const startDate = DateTime.fromISO(endDate, { zone: timezone }).minus({ days: days - 1 }).toISODate()

  if (!startDate) {
    throw new Error('Failed to derive start-date')
  }

  return {
    days,
    weight,
    calories,
    startDate,
    endDate
  } satisfies BaselineOptions & { startDate: string }
}

function parsePositiveInteger(value: string, field: string) {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`)
  }

  return parsed
}

function parsePositiveNumber(value: string, field: string) {
  const parsed = Number.parseFloat(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive number`)
  }

  return parsed
}

function parseDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be in YYYY-MM-DD format`)
  }

  return value
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
