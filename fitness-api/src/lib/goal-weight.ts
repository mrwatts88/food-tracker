import { eq } from 'drizzle-orm'

import type { Database } from '../db/client'
import { appSettings } from '../db/schema'

// Stored as text in app_settings because nutrition_goals only holds integers.
const GOAL_WEIGHT_SETTING_KEY = 'goal_weight'

// The saved goal weight, or `fallback` (the GOAL_WEIGHT env var) when none is saved.
export async function getGoalWeight(db: Database, fallback: number) {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, GOAL_WEIGHT_SETTING_KEY))

  const saved = row ? Number(row.value) : Number.NaN
  return Number.isFinite(saved) && saved > 0 ? saved : fallback
}

export async function saveGoalWeight(db: Database, goalWeight: number) {
  const value = String(goalWeight)

  await db
    .insert(appSettings)
    .values({ key: GOAL_WEIGHT_SETTING_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })

  return goalWeight
}
