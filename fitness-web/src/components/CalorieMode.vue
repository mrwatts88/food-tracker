<script setup lang="ts">
import { computed } from 'vue'

import { isNutritionMetric, nutritionMetricColorVars } from '@/lib/nutrition'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import type { EntryMetric } from '@/types'
import CalorieDisplay from './CalorieDisplay.vue'
import Keyboard from './Keyboard.vue'

const appStore = useAppStore()
const calorieStore = useCalorieStore()
const nutritionStore = useNutritionStore()
const weightStore = useWeightStore()

const trackSelectors: Array<{ metric: EntryMetric; label: string; accentColor: string }> = [
  { metric: 'calorie', label: 'kCals', accentColor: 'var(--color-calorie-primary)' },
  { metric: 'weight', label: 'Wt', accentColor: 'var(--color-weight-primary)' },
  { metric: 'protein', label: 'Pro', accentColor: nutritionMetricColorVars.protein },
  { metric: 'sugar', label: 'Sug', accentColor: nutritionMetricColorVars.sugar },
  { metric: 'caffeine', label: 'Caff', accentColor: nutritionMetricColorVars.caffeine }
]

const keyboardAccentColor = computed(() => {
  if (isNutritionMetric(appStore.activeMetric)) {
    return nutritionMetricColorVars[appStore.activeMetric]
  }

  if (appStore.activeMetric === 'weight') {
    return 'var(--color-weight-primary)'
  }

  return 'var(--color-calorie-primary)'
})

async function handleSubmit(amount: number) {
  if (appStore.activeMetric === 'weight') {
    await weightStore.addEntry(amount)
    return
  }

  if (isNutritionMetric(appStore.activeMetric)) {
    await nutritionStore.addEntry(amount, appStore.activeMetric)
    return
  }

  await calorieStore.addEntry(amount)
}

function handleMetricChange(metric: EntryMetric) {
  if (appStore.activeMetric === metric) {
    return
  }

  appStore.setActiveMetric(metric)
}
</script>

<template>
  <div class="calorie-mode">
    <div class="display-section">
      <CalorieDisplay :active-metric="appStore.activeMetric" />
      <div class="track-toggle">
        <button
          v-for="selector in trackSelectors"
          :key="selector.metric"
          :class="['track-toggle-button', { active: appStore.activeMetric === selector.metric }]"
          :style="{ '--track-accent': selector.accentColor }"
          @click="handleMetricChange(selector.metric)"
        >
          {{ selector.label }}
        </button>
      </div>
    </div>
    <div class="input-section">
      <Keyboard
        :mode="appStore.activeMetric"
        :accent-color="keyboardAccentColor"
        :submitting="
          appStore.activeMetric === 'weight'
              ? weightStore.submittingEntry
              : isNutritionMetric(appStore.activeMetric)
                ? nutritionStore.submittingByMetric[appStore.activeMetric]
                : calorieStore.submittingEntry
        "
        @submit="handleSubmit"
      />
    </div>
  </div>
</template>

<style scoped>
.calorie-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.display-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.track-toggle {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md) var(--spacing-md);
  flex-shrink: 0;
}

@media (min-width: 429px) {
  .track-toggle {
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
  }
}

.track-toggle-button {
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 0;
}

.track-toggle-button.active {
  background: color-mix(in srgb, var(--track-accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--track-accent) 50%, transparent);
  color: var(--track-accent);
}

@media (max-width: 428px) {
  .track-toggle {
    gap: 6px;
  }

  .track-toggle-button {
    padding: 10px 6px;
    font-size: 12px;
  }
}

.track-toggle-button:active {
  transform: scale(0.98);
}

.input-section {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  min-height: 0;
}

</style>
