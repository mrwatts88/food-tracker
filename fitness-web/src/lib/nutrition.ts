import type { EntryMetric, NutritionMetric } from '@/types'

export const nutritionMetrics: NutritionMetric[] = ['protein', 'sugar', 'caffeine', 'carbs', 'sodium', 'fiber', 'steps']

// The macros shown on the second page of the home card. Sugar, caffeine, and
// steps stay tracked (voice, CLI, history) but are not surfaced there.
export const homeMacroMetrics: NutritionMetric[] = ['protein', 'fiber', 'sodium', 'carbs']

export const nutritionMetricLabels: Record<NutritionMetric, string> = {
  protein: 'Protein',
  sugar: 'Sugar',
  caffeine: 'Caffeine',
  carbs: 'Carbs',
  sodium: 'Sodium',
  fiber: 'Fiber',
  steps: 'Steps'
}

export const nutritionMetricUnits: Record<NutritionMetric, string> = {
  protein: 'g',
  sugar: 'g',
  caffeine: 'mg',
  carbs: 'g',
  sodium: 'mg',
  fiber: 'g',
  steps: 'steps'
}

export const nutritionMetricColorVars: Record<NutritionMetric, string> = {
  protein: 'var(--color-protein-primary)',
  sugar: 'var(--color-sugar-primary)',
  caffeine: 'var(--color-caffeine-primary)',
  carbs: 'var(--color-carbs-primary)',
  sodium: 'var(--color-sodium-primary)',
  fiber: 'var(--color-fiber-primary)',
  steps: 'var(--color-steps-primary)'
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
