import { describe, expect, it } from 'vitest'

import { buildInsight } from './nutrition-insights'

describe('buildInsight', () => {
  it('asks for more of a floor metric so tomorrow\'s 7-day average reaches the goal', () => {
    // Six newest days at 90 g; a 7th, older day falls out of tomorrow's window.
    const insight = buildInsight('protein', 100, [90, 90, 90, 90, 90, 90, 40])

    expect(insight).toEqual({
      metric: 'protein',
      kind: 'floor',
      goal: 100,
      average: 83,
      todayTarget: 160,
      capped: false,
      status: 'more'
    })
  })

  it('asks for less of a ceiling metric', () => {
    const insight = buildInsight('sodium', 2300, [2500, 2500, 2300, 2300, 2300, 2300, 2300])

    expect(insight).toMatchObject({ kind: 'ceiling', average: 2357, todayTarget: 1900, status: 'less' })
  })

  it('treats an average at the goal as on track and targets the goal itself', () => {
    expect(buildInsight('fiber', 30, [30, 30, 30])).toMatchObject({ status: 'on-track', todayTarget: 30 })
    expect(buildInsight('sugar', 40, [40, 10])).toMatchObject({ status: 'on-track', todayTarget: 40 })
  })

  it('clamps targets that cannot close the gap in one day', () => {
    expect(buildInsight('fiber', 30, [0, 0, 0, 0, 0, 0, 0])).toMatchObject({ todayTarget: 60, capped: true })
    expect(buildInsight('caffeine', 280, [600, 600, 600])).toMatchObject({ todayTarget: 0, capped: true })
  })

  it('uses only the logged days when fewer than seven were logged', () => {
    expect(buildInsight('carbs', 200, [260, 240])).toMatchObject({ average: 250, todayTarget: 100, status: 'less' })
  })

  it('reports missing data and missing goals', () => {
    expect(buildInsight('protein', 150, [])).toMatchObject({ status: 'no-data', average: null, todayTarget: 150 })
    expect(buildInsight('caffeine', 0, [100])).toMatchObject({ status: 'no-goal', average: 100, todayTarget: null })
  })
})
