<script setup lang="ts">
import { computed } from 'vue'

import { nutritionMetricColorVars } from '@/lib/nutrition'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import type { TrackMode } from '@/types'
import CalorieDisplay from './CalorieDisplay.vue'
import Keyboard from './Keyboard.vue'

const appStore = useAppStore()
const calorieStore = useCalorieStore()
const nutritionStore = useNutritionStore()
const weightStore = useWeightStore()

const nutritionAccentColor = computed(() => nutritionMetricColorVars[appStore.nutritionMetric])
const keyboardAccentColor = computed(() => {
  if (appStore.trackMode === 'nutrition') {
    return nutritionAccentColor.value
  }

  if (appStore.trackMode === 'weight') {
    return 'var(--color-weight-primary)'
  }

  return 'var(--color-calorie-primary)'
})

async function handleSubmit(amount: number) {
  if (appStore.trackMode === 'nutrition') {
    await nutritionStore.addEntry(amount)
    return
  }

  if (appStore.trackMode === 'weight') {
    await weightStore.addEntry(amount)
    return
  }

  await calorieStore.addEntry(amount)
}

function handleTrackModeChange(trackMode: TrackMode) {
  if (appStore.trackMode === trackMode) {
    return
  }

  appStore.setTrackMode(trackMode)
}
</script>

<template>
  <div class="calorie-mode">
    <div class="display-section">
      <CalorieDisplay :track-mode="appStore.trackMode" />
      <div class="track-toggle">
        <button
          :class="['track-toggle-button', { active: appStore.trackMode === 'calorie' }]"
          @click="handleTrackModeChange('calorie')"
        >
          Calories
        </button>
        <button
          :class="[
            'track-toggle-button',
            'track-toggle-button--nutrition',
            { active: appStore.trackMode === 'nutrition' }
          ]"
          :style="{ '--track-accent': nutritionAccentColor }"
          @click="handleTrackModeChange('nutrition')"
        >
          Nutrition
        </button>
        <button
          :class="[
            'track-toggle-button',
            'track-toggle-button--weight',
            { active: appStore.trackMode === 'weight' }
          ]"
          @click="handleTrackModeChange('weight')"
        >
          Weight
        </button>
      </div>
    </div>
    <div class="input-section">
      <Keyboard
        :mode="appStore.trackMode"
        :accent-color="keyboardAccentColor"
        :submitting="
          appStore.trackMode === 'nutrition'
            ? nutritionStore.currentSubmitting
            : appStore.trackMode === 'weight'
              ? weightStore.submittingEntry
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
  display: flex;
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
  flex: 1;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.track-toggle-button.active {
  background: color-mix(in srgb, var(--color-calorie-primary) 18%, transparent);
  border-color: color-mix(in srgb, var(--color-calorie-primary) 50%, transparent);
  color: var(--color-calorie-primary);
}

.track-toggle-button--nutrition.active {
  background: color-mix(in srgb, var(--track-accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--track-accent) 50%, transparent);
  color: var(--track-accent);
}

.track-toggle-button--weight.active {
  background: color-mix(in srgb, var(--color-weight-primary) 18%, transparent);
  border-color: color-mix(in srgb, var(--color-weight-primary) 50%, transparent);
  color: var(--color-weight-primary);
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
