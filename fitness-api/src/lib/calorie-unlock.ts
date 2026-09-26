import { asc, eq } from 'drizzle-orm'
import { DateTime } from 'luxon'

import type { Database } from '../db/client'
import { appSettings, calorieEntries } from '../db/schema'
import { getCurrentDateTime, toZonedIso } from './time'
import { resolveCalorieGoal } from './goals'
import { calculateTdeeStats } from './tdee'

const FRACTION_SUM_TOLERANCE = 0.000001
const UNLOCK_SCHEDULE_SETTING_KEY = 'calorie_unlock_schedule'

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
  dailyGoalStreak: number
  noBorrowUnlockStreak: number
  timezone: string
  serverNow: string
}

export type UnlockScheduleEntry = {
  time: string
  fraction: number
}

export type UnlockScheduleResponse = {
  slots: UnlockScheduleEntry[]
  isDefault: boolean
}

// The schedule saved in the app wins; the CALORIE_UNLOCK_SCHEDULE env var is the default.
export async function getUnlockSchedule(db: Database, defaultSchedule: string) {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, UNLOCK_SCHEDULE_SETTING_KEY))
      .limit(1)

    return row?.value ?? defaultSchedule
  } catch (error) {
    // Keep unlocks working if the API deploys before the app_settings migration runs.
    if (isMissingTableError(error) || isMissingTableError(error instanceof Error ? error.cause : undefined)) {
      return defaultSchedule
    }

    throw error
  }
}

function isMissingTableError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === '42P01'
}

export async function getUnlockScheduleResponse(
  db: Database,
  defaultSchedule: string
): Promise<UnlockScheduleResponse> {
  const schedule = await getUnlockSchedule(db, defaultSchedule)

  return {
    slots: parseUnlockSchedule(schedule).map(toScheduleEntry),
    isDefault: schedule === defaultSchedule
  }
}

// Throws on an invalid schedule, so nothing broken is ever stored.
export async function saveUnlockSchedule(db: Database, entries: UnlockScheduleEntry[]) {
  const schedule = entries.map(entry => `${entry.time}=${entry.fraction}`).join(',')
  parseUnlockSchedule(schedule)

  await db
    .insert(appSettings)
    .values({ key: UNLOCK_SCHEDULE_SETTING_KEY, value: schedule })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: schedule } })
}

export async function resetUnlockSchedule(db: Database) {
  await db.delete(appSettings).where(eq(appSettings.key, UNLOCK_SCHEDULE_SETTING_KEY))
}

function toScheduleEntry(slot: UnlockScheduleSlot): UnlockScheduleEntry {
  return {
    time: `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`,
    fraction: slot.fraction
  }
}

export async function calculateUnlockStatus(options: {
  db: Database
  now: Date
  timezone: string
  schedule: string
  fallbackGoal: number
  calorieDeficit: number
  calorieTarget: number | null
  dailyGoalStreak?: number
}): Promise<UnlockStatus> {
  const { db, now, timezone, schedule, fallbackGoal, calorieDeficit, calorieTarget, dailyGoalStreak = 0 } = options
  const current = getCurrentDateTime(now, timezone)
  const todayKey = current.toISODate() ?? ''
  const scheduleSlots = parseUnlockSchedule(schedule)

  const [entries, dailyTargetCalories] = await Promise.all([
    loadCalorieEntries(db, timezone),
    calculateDailyTargetCalories(db, current, timezone, fallbackGoal, calorieDeficit, calorieTarget)
  ])

  const todayEntries = entries.filter(entry => entry.localDate === todayKey)
  const dailySchedule = buildDailyUnlockSchedule(current.startOf('day'), scheduleSlots, dailyTargetCalories)
  const unlockedCalories = dailySchedule
    .filter(slot => slot.unlockAt.toMillis() <= current.toMillis())
    .reduce((sum, slot) => sum + slot.calories, 0)
  const consumedCalories = todayEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const overdrawCalories = Math.max(0, consumedCalories - unlockedCalories)
  const nextSlot = dailySchedule.find(slot => slot.unlockAt.toMillis() > current.toMillis()) ?? null

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
    dailyGoalStreak,
    noBorrowUnlockStreak: dailyGoalStreak,
    timezone,
    serverNow: toZonedIso(now, timezone)
  }
}

export function parseUnlockSchedule(schedule: string): UnlockScheduleSlot[] {
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

async function calculateDailyTargetCalories(
  db: Database,
  now: DateTime,
  timezone: string,
  fallbackGoal: number,
  calorieDeficit: number,
  calorieTarget: number | null
) {
  const tdeeStats = await calculateTdeeStats(db, now.toJSDate(), timezone)
  return resolveCalorieGoal(calorieTarget, tdeeStats.amount, calorieDeficit, fallbackGoal)
}
