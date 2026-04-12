import { DateTime } from 'luxon'
import { gte } from 'drizzle-orm'

import type { Database } from '../db/client'
import { calorieEntries } from '../db/schema'
import { getCurrentDateTime, getTodayBounds, toZonedIso } from './time'
import { calculateTdeeStats } from './tdee'

const CALORIE_DEFICIT = 250
const FRACTION_SUM_TOLERANCE = 0.000001

type UnlockScheduleSlot = {
  hour: number
  minute: number
  fraction: number
}

type DailyUnlockSlot = {
  unlockAt: DateTime
  calories: number
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
  timezone: string
  serverNow: string
}

export async function calculateUnlockStatus(options: {
  db: Database
  now: Date
  timezone: string
  schedule: string
  fallbackGoal: number
}): Promise<UnlockStatus> {
  const { db, now, timezone, schedule, fallbackGoal } = options
  const today = getTodayBounds(now, timezone)
  const current = getCurrentDateTime(now, timezone)

  const [entries, tdeeStats] = await Promise.all([
    db
      .select({
        amount: calorieEntries.amount
      })
      .from(calorieEntries)
      .where(gte(calorieEntries.createdAt, today.startUtc)),
    calculateTdeeStats(db, now, timezone)
  ])

  const consumedCalories = entries.reduce((sum, entry) => sum + entry.amount, 0)
  const derivedGoal = Number.isFinite(tdeeStats.amount) ? tdeeStats.amount - CALORIE_DEFICIT : 0
  const dailyTargetCalories = derivedGoal > 0 ? derivedGoal : fallbackGoal
  const dailySchedule = buildDailyUnlockSchedule(current, parseUnlockSchedule(schedule), dailyTargetCalories)

  const unlockedCalories = dailySchedule
    .filter(slot => slot.unlockAt.toMillis() <= current.toMillis())
    .reduce((sum, slot) => sum + slot.calories, 0)

  const nextSlot = dailySchedule.find(slot => slot.unlockAt.toMillis() > current.toMillis()) ?? null
  const overdrawCalories = Math.max(0, consumedCalories - unlockedCalories)

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
  current: DateTime,
  schedule: UnlockScheduleSlot[],
  dailyTargetCalories: number
): DailyUnlockSlot[] {
  let assignedCalories = 0

  return schedule.map((slot, index) => {
    const remainingSlots = schedule.length - index - 1
    const calories =
      remainingSlots === 0
        ? dailyTargetCalories - assignedCalories
        : Math.floor(dailyTargetCalories * slot.fraction)

    assignedCalories += calories

    return {
      unlockAt: current.startOf('day').plus({ hours: slot.hour, minutes: slot.minute }),
      calories
    }
  })
}
