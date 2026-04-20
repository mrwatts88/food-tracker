import type { EntryMetric, NutritionMetric } from '@/types'

export const nutritionMetrics: NutritionMetric[] = ['protein', 'sugar', 'caffeine']

export const nutritionMetricLabels: Record<NutritionMetric, string> = {
  protein: 'Protein',
  sugar: 'Sugar',
  caffeine: 'Caffeine'
}

export const nutritionMetricUnits: Record<NutritionMetric, string> = {
  protein: 'g',
  sugar: 'g',
  caffeine: 'mg'
}

export const nutritionMetricColorVars: Record<NutritionMetric, string> = {
  protein: 'var(--color-protein-primary)',
  sugar: 'var(--color-sugar-primary)',
  caffeine: 'var(--color-caffeine-primary)'
}

export function isNutritionMetric(metric: EntryMetric): metric is NutritionMetric {
  return nutritionMetrics.includes(metric as NutritionMetric)
}

export function formatNutritionTotal(metric: NutritionMetric, amount: number) {
  return `${amount.toLocaleString()} ${nutritionMetricUnits[metric]}`
}

export function formatNutritionProgress(metric: NutritionMetric, amount: number, goal: number | null) {
  if (goal === null) {
    return `${amount.toLocaleString()}/--${nutritionMetricUnits[metric]}`
  }

  return `${amount.toLocaleString()}/${goal.toLocaleString()}${nutritionMetricUnits[metric]}`
}
