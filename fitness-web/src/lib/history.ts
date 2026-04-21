import type { CalorieEntry, EntryDivider, HistoryListItem, NutritionEntry } from '@/types'

type MetricEntry = CalorieEntry | NutritionEntry

export function buildHistoryListItems(entries: MetricEntry[], dividers: EntryDivider[]): HistoryListItem[] {
  return [
    ...entries.map(entry => ({
      type: 'entry' as const,
      id: `entry-${entry.id}`,
      createdAt: entry.createdAt,
      entry
    })),
    ...dividers.map(divider => ({
      type: 'divider' as const,
      id: `divider-${divider.id}`,
      createdAt: divider.createdAt,
      divider
    }))
  ].sort((left, right) => {
    const timeDifference = toTimestamp(right.createdAt) - toTimestamp(left.createdAt)

    if (timeDifference !== 0) {
      return timeDifference
    }

    if (left.type === right.type) {
      return getNumericId(right.id) - getNumericId(left.id)
    }

    return left.type === 'entry' ? -1 : 1
  })
}

export function formatHistoryTime(datetime: string) {
  const date = new Date(datetime.replace(' ', 'T'))
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function toTimestamp(value: string) {
  return new Date(value.replace(' ', 'T')).getTime()
}

function getNumericId(value: string) {
  const parts = value.split('-')
  const numericId = Number.parseInt(parts[parts.length - 1] ?? '0', 10)
  return Number.isFinite(numericId) ? numericId : 0
}
