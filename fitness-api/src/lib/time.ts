import { DateTime } from 'luxon'

export function getCurrentDateTime(now: Date, timezone: string) {
  return DateTime.fromJSDate(now).setZone(timezone)
}

export function getTodayBounds(now: Date, timezone: string) {
  const current = getCurrentDateTime(now, timezone)

  return {
    localDate: current.toISODate() ?? current.toFormat('yyyy-LL-dd'),
    startUtc: current.startOf('day').toUTC().toJSDate(),
    endUtc: current.endOf('day').toUTC().toJSDate()
  }
}

export function getDateRange(
  now: Date,
  timezone: string,
  startOffsetDays: number,
  endOffsetDays: number
) {
  const current = getCurrentDateTime(now, timezone)

  return {
    startUtc: current.minus({ days: startOffsetDays }).startOf('day').toUTC().toJSDate(),
    endUtc: current.minus({ days: endOffsetDays }).endOf('day').toUTC().toJSDate()
  }
}

export function getDateRangeStrings(
  now: Date,
  timezone: string,
  startOffsetDays: number,
  endOffsetDays: number
) {
  const current = getCurrentDateTime(now, timezone)

  return {
    startDate: current.minus({ days: startOffsetDays }).toISODate() ?? '',
    endDate: current.minus({ days: endOffsetDays }).toISODate() ?? ''
  }
}

export function formatTimestamp(value: Date | string, timezone: string) {
  return normalizeDateTime(value).setZone(timezone).toFormat('yyyy-LL-dd HH:mm:ss')
}

export function formatDate(value: Date | string, timezone: string) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  return normalizeDateTime(value).setZone(timezone).toFormat('yyyy-LL-dd')
}

function normalizeDateTime(value: Date | string) {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value)
  }

  return DateTime.fromJSDate(new Date(value))
}
