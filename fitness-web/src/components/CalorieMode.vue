<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useProteinStore } from '@/stores/protein'
import type { TrackMode } from '@/types'
import CalorieDisplay from './CalorieDisplay.vue'
import Keyboard from './Keyboard.vue'

const appStore = useAppStore()
const calorieStore = useCalorieStore()
const proteinStore = useProteinStore()

async function handleSubmit(amount: number) {
  if (appStore.trackMode === 'protein') {
    await proteinStore.addEntry(amount)
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
      <CalorieDisplay />
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
            'track-toggle-button--protein',
            { active: appStore.trackMode === 'protein' }
          ]"
          @click="handleTrackModeChange('protein')"
        >
          Protein
        </button>
      </div>
    </div>
    <div class="input-section">
      <Keyboard
        :mode="appStore.trackMode"
        :submitting="
          appStore.trackMode === 'protein'
            ? proteinStore.submittingEntry
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

.track-toggle-button--protein.active {
  background: color-mix(in srgb, var(--color-protein-primary) 18%, transparent);
  border-color: color-mix(in srgb, var(--color-protein-primary) 50%, transparent);
  color: var(--color-protein-primary);
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
