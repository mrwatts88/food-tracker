import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'

import { estimateWeightTrend, type DailyAmount } from './weight-trend'

const today = '2026-06-30'

function daysAgo(days: number) {
  return DateTime.fromISO(today).minus({ days }).toISODate() ?? today
}

// Eats `intake` every day while the true weight falls by `lossPerWeek`,
// with an optional water swing added to each weigh-in.
function history(options: { days: number; intake: number; lossPerWeek: number; noise?: (day: number) => number }) {
  const weights: DailyAmount[] = []
  const calories: DailyAmount[] = []

  for (let day = options.days - 1; day >= 0; day -= 1) {
    const trueWeight = 200 + (day * options.lossPerWeek) / 7
    weights.push({ date: daysAgo(day), amount: trueWeight + (options.noise?.(day) ?? 0) })
    calories.push({ date: daysAgo(day + 1), amount: options.intake })
  }

  return { weights, calories }
}

describe('estimateWeightTrend', () => {
  it('returns nothing without weight history', () => {
    expect(estimateWeightTrend([], [{ date: today, amount: 2000 }], today)).toEqual([])
  })

  it('recovers TDEE from a steady loss', () => {
    const { weights, calories } = history({ days: 90, intake: 2200, lossPerWeek: 1 })
    const latest = estimateWeightTrend(weights, calories, today).at(-1)

    expect(latest?.tdee).toBeCloseTo(2700, -1)
    expect(latest?.weight).toBeCloseTo(200, 1)
  })

  it('keeps the trend steady through water swings', () => {
    // A sodium-style spike: +3 lb, fading over the following days.
    const spike = (day: number) => (day <= 3 ? 3 * 0.5 ** day : 0)
    const { weights, calories } = history({ days: 90, intake: 2200, lossPerWeek: 1, noise: spike })
    const latest = estimateWeightTrend(weights, calories, today).at(-1)

    expect(weights.at(-1)?.amount).toBe(203)
    expect(latest?.weight).toBeLessThan(201.5)
    expect(latest?.tdee).toBeGreaterThan(2500)
  })

  it('produces a point for every day, including days without a weigh-in', () => {
    const { weights, calories } = history({ days: 30, intake: 2200, lossPerWeek: 1 })
    const sparse = weights.filter((_, index) => index % 3 === 0)
    const points = estimateWeightTrend(sparse, calories, today)

    expect(points).toHaveLength(30)
    expect(points.at(-1)?.date).toBe(today)
  })

  it('treats partially logged days as unknown intake rather than a huge deficit', () => {
    const { weights, calories } = history({ days: 90, intake: 2200, lossPerWeek: 1 })
    const withPartialDays = calories.map((entry, index) =>
      index % 10 === 0 ? { ...entry, amount: 300 } : entry
    )
    const latest = estimateWeightTrend(weights, withPartialDays, today).at(-1)

    expect(latest?.tdee).toBeCloseTo(2700, -2)
  })
})
