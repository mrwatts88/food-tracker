import { asc } from 'drizzle-orm'
import { DateTime } from 'luxon'

import type { Database } from '../db/client'
import { calorieEntries } from '../db/schema'
import { getCurrentDateTime, toZonedIso } from './time'
import { calculateTdeeStats } from './tdee'

const FRACTION_SUM_TOLERANCE = 0.000001

type UnlockScheduleSlot = {
  hour: number
  minute: number
  fraction: number
}

type DailyUnlockBoundary = {
  unlockAt: DateTime
  endAtExclusive: DateTime
}

type DailyUnlockSlot = DailyUnlockBoundary & {
  calories: number
  cumulativeUnlocked: number
}

type LocalCalorieEntry = {
  amount: number
  createdAt: DateTime
  localDate: string
}

export type UnlockStatus = {
  dailyTargetCalories: number
  consumedCalories: number
  unlockedCalories: number
  availableCalories: number
  overdrawCalories: number
  nextUnlockAt: string | null
  nextScheduledUnlockCalories: number
  nextEffectiveUnlockCalories: number
  allCaloriesUnlockedToday: boolean
  noBorrowUnlockStreak: number
  timezone: string
  serverNow: string
}

export async function calculateUnlockStatus(options: {
  db: Database
  now: Date
  timezone: string
  schedule: string
  fallbackGoal: number
  calorieDeficit: number
}): Promise<UnlockStatus> {
  const { db, now, timezone, schedule, fallbackGoal, calorieDeficit } = options
  const current = getCurrentDateTime(now, timezone)
  const todayKey = current.toISODate() ?? ''
  const scheduleSlots = parseUnlockSchedule(schedule)

  const [entries, dailyTargetCalories] = await Promise.all([
    loadCalorieEntries(db, timezone),
    calculateDailyTargetCalories(db, current, timezone, fallbackGoal, calorieDeficit)
  ])

  const todayEntries = entries.filter(entry => entry.localDate === todayKey)
  const dailySchedule = buildDailyUnlockSchedule(current.startOf('day'), scheduleSlots, dailyTargetCalories)
  const unlockedCalories = dailySchedule
    .filter(slot => slot.unlockAt.toMillis() <= current.toMillis())
    .reduce((sum, slot) => sum + slot.calories, 0)
  const consumedCalories = todayEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const overdrawCalories = Math.max(0, consumedCalories - unlockedCalories)
  const nextSlot = dailySchedule.find(slot => slot.unlockAt.toMillis() > current.toMillis()) ?? null
  const noBorrowUnlockStreak = await calculateNoBorrowUnlockStreak({
    db,
    current,
    timezone,
    scheduleSlots,
    fallbackGoal,
    calorieDeficit,
    entries
  })

  return {
    dailyTargetCalories,
    consumedCalories,
    unlockedCalories,
    availableCalories: Math.max(0, unlockedCalories - consumedCalories),
    overdrawCalories,
    nextUnlockAt: nextSlot ? toZonedIso(nextSlot.unlockAt.toJSDate(), timezone) : null,
    nextScheduledUnlockCalories: nextSlot?.calories ?? 0,
    nextEffectiveUnlockCalories: nextSlot ? Math.max(0, nextSlot.calories - overdrawCalories) : 0,
    allCaloriesUnlockedToday: nextSlot === null,
    noBorrowUnlockStreak,
    timezone,
    serverNow: toZonedIso(now, timezone)
  }
}

function parseUnlockSchedule(schedule: string): UnlockScheduleSlot[] {
  const slots = schedule
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [timePart, fractionPart] = part.split('=')

      if (!timePart || !fractionPart) {
        throw new Error(`Invalid calorie unlock schedule entry: "${part}"`)
      }

      const timeMatch = timePart.match(/^(\d{2}):(\d{2})$/)

      if (!timeMatch) {
        throw new Error(`Invalid calorie unlock time: "${timePart}"`)
      }

      const hourText = timeMatch[1] ?? ''
      const minuteText = timeMatch[2] ?? ''
      const hour = Number.parseInt(hourText, 10)
      const minute = Number.parseInt(minuteText, 10)
      const fraction = Number.parseFloat(fractionPart)

      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error(`Invalid calorie unlock time: "${timePart}"`)
      }

      if (!Number.isFinite(fraction) || fraction <= 0) {
        throw new Error(`Invalid calorie unlock fraction: "${fractionPart}"`)
      }

      return {
        hour,
        minute,
        fraction
      }
    })
    .sort((left, right) => left.hour * 60 + left.minute - (right.hour * 60 + right.minute))

  if (slots.length === 0) {
    throw new Error('Calorie unlock schedule must contain at least one entry')
  }

  for (let index = 1; index < slots.length; index += 1) {
    const previous = slots[index - 1]
    const current = slots[index]

    if (!previous || !current) {
      continue
    }

    if (previous.hour === current.hour && previous.minute === current.minute) {
      throw new Error('Calorie unlock schedule cannot contain duplicate times')
    }
  }

  const fractionSum = slots.reduce((sum, slot) => sum + slot.fraction, 0)

  if (Math.abs(fractionSum - 1) > FRACTION_SUM_TOLERANCE) {
    throw new Error('Calorie unlock schedule fractions must sum to 1')
  }

  return slots
}

function buildDailyUnlockSchedule(
  day: DateTime,
  schedule: UnlockScheduleSlot[],
  dailyTargetCalories: number
): DailyUnlockSlot[] {
  const boundaries = buildDailyUnlockBoundaries(day, schedule)
  let assignedCalories = 0
  let cumulativeUnlocked = 0

  return boundaries.map((boundary, index) => {
    const remainingSlots = schedule.length - index - 1
    const scheduleSlot = schedule[index]
    const calories =
      remainingSlots === 0 || !scheduleSlot
        ? dailyTargetCalories - assignedCalories
        : Math.floor(dailyTargetCalories * scheduleSlot.fraction)

    assignedCalories += calories
    cumulativeUnlocked += calories

    return {
      ...boundary,
      calories,
      cumulativeUnlocked
    }
  })
}

function buildDailyUnlockBoundaries(day: DateTime, schedule: UnlockScheduleSlot[]): DailyUnlockBoundary[] {
  const dayStart = day.startOf('day')

  return schedule.map((slot, index) => {
    const unlockAt = dayStart.plus({ hours: slot.hour, minutes: slot.minute })
    const nextSlot = schedule[index + 1]
    const endAtExclusive = nextSlot
      ? dayStart.plus({ hours: nextSlot.hour, minutes: nextSlot.minute })
      : dayStart.plus({ days: 1 })

    return {
      unlockAt,
      endAtExclusive
    }
  })
}

async function calculateNoBorrowUnlockStreak(options: {
  db: Database
  current: DateTime
  timezone: string
  scheduleSlots: UnlockScheduleSlot[]
  fallbackGoal: number
  calorieDeficit: number
  entries: LocalCalorieEntry[]
}) {
  const { db, current, timezone, scheduleSlots, fallbackGoal, calorieDeficit, entries } = options

  if (entries.length === 0) {
    return 0
  }

  const earliestEntry = entries[0]

  if (!earliestEntry) {
    return 0
  }

  const earliestTrackedDay = earliestEntry.createdAt.startOf('day')
  const currentDayStart = current.startOf('day')
  const entriesByDay = groupEntriesByDay(entries)
  const dailyTargetCache = new Map<string, number>()
  let streak = 0

  for (
    let day = currentDayStart;
    day.toMillis() >= earliestTrackedDay.toMillis();
    day = day.minus({ days: 1 })
  ) {
    const completedSlotCount = getCompletedSlotCount(day, current, scheduleSlots)

    if (completedSlotCount === 0) {
      continue
    }

    const dayKey = day.toISODate() ?? ''
    const dailyTargetCalories = await getDailyTargetCaloriesForDay(
      db,
      day,
      timezone,
      fallbackGoal,
      calorieDeficit,
      dailyTargetCache
    )
    const completedSlots = buildDailyUnlockSchedule(day, scheduleSlots, dailyTargetCalories).slice(
      0,
      completedSlotCount
    )
    const cleanSlots = getCompletedSlotCleanFlags(completedSlots, entriesByDay.get(dayKey) ?? [])

    for (let index = cleanSlots.length - 1; index >= 0; index -= 1) {
      if (!cleanSlots[index]) {
        return streak
      }

      streak += 1
    }
  }

  return streak
}

function getCompletedSlotCount(day: DateTime, current: DateTime, schedule: UnlockScheduleSlot[]) {
  if (day.toISODate() !== current.toISODate()) {
    return schedule.length
  }

  const boundaries = buildDailyUnlockBoundaries(day, schedule)

  return boundaries.filter(slot => slot.endAtExclusive.toMillis() <= current.toMillis()).length
}

function getCompletedSlotCleanFlags(slots: DailyUnlockSlot[], entries: LocalCalorieEntry[]) {
  let cumulativeConsumed = 0
  let entryIndex = 0

  return slots.map(slot => {
    while (
      entryIndex < entries.length &&
      (entries[entryIndex]?.createdAt.toMillis() ?? Number.POSITIVE_INFINITY) < slot.endAtExclusive.toMillis()
    ) {
      cumulativeConsumed += entries[entryIndex]?.amount ?? 0
      entryIndex += 1
    }

    return cumulativeConsumed <= slot.cumulativeUnlocked
  })
}

async function loadCalorieEntries(db: Database, timezone: string): Promise<LocalCalorieEntry[]> {
  const entries = await db
    .select({
      amount: calorieEntries.amount,
      createdAt: calorieEntries.createdAt
    })
    .from(calorieEntries)
    .orderBy(asc(calorieEntries.createdAt))

  return entries.map(entry => {
    const createdAt = DateTime.fromJSDate(entry.createdAt).setZone(timezone)

    return {
      amount: entry.amount,
      createdAt,
      localDate: createdAt.toISODate() ?? ''
    }
  })
}

function groupEntriesByDay(entries: LocalCalorieEntry[]) {
  const grouped = new Map<string, LocalCalorieEntry[]>()

  for (const entry of entries) {
    const dayEntries = grouped.get(entry.localDate)

    if (dayEntries) {
      dayEntries.push(entry)
      continue
    }

    grouped.set(entry.localDate, [entry])
  }

  return grouped
}

async function getDailyTargetCaloriesForDay(
  db: Database,
  day: DateTime,
  timezone: string,
  fallbackGoal: number,
  calorieDeficit: number,
  cache: Map<string, number>
) {
  const dayKey = day.toISODate() ?? ''
  const cached = cache.get(dayKey)

  if (typeof cached === 'number') {
    return cached
  }

  const dailyTargetCalories = await calculateDailyTargetCalories(
    db,
    day.endOf('day'),
    timezone,
    fallbackGoal,
    calorieDeficit
  )
  cache.set(dayKey, dailyTargetCalories)
  return dailyTargetCalories
}

async function calculateDailyTargetCalories(
  db: Database,
  now: DateTime,
  timezone: string,
  fallbackGoal: number,
  calorieDeficit: number
) {
  const tdeeStats = await calculateTdeeStats(db, now.toJSDate(), timezone)
  const derivedGoal = Number.isFinite(tdeeStats.amount) ? tdeeStats.amount - calorieDeficit : 0

  return derivedGoal > 0 ? derivedGoal : fallbackGoal
}
