<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useProteinStore } from '@/stores/protein'
import { useQuickAddStore } from '@/stores/quickadd'
import type { TrackMode } from '@/types'
import CalorieDisplay from './CalorieDisplay.vue'
import Keyboard from './Keyboard.vue'
import QuickAddList from './QuickAddList.vue'
import QuickAddDisplay from './QuickAddDisplay.vue'

const appStore = useAppStore()
const calorieStore = useCalorieStore()
const proteinStore = useProteinStore()
const quickAddStore = useQuickAddStore()

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

  quickAddStore.clearTaps()
  appStore.setTrackMode(trackMode)
}
</script>

<template>
  <div class="calorie-mode">
    <CalorieDisplay />
    <div class="track-toggle">
      <button
        :class="['track-toggle-button', { active: appStore.trackMode === 'calorie' }]"
        @click="handleTrackModeChange('calorie')"
      >
        Calories
      </button>
      <button
        :class="['track-toggle-button', 'track-toggle-button--protein', { active: appStore.trackMode === 'protein' }]"
        @click="handleTrackModeChange('protein')"
      >
        Protein
      </button>
    </div>
    <div class="input-section">
      <Keyboard
        v-if="appStore.inputMode === 'keyboard'"
        :mode="appStore.trackMode"
        :submitting="appStore.trackMode === 'protein' ? proteinStore.submittingEntry : calorieStore.submittingEntry"
        @submit="handleSubmit"
      />
      <template v-else>
        <QuickAddList />
        <QuickAddDisplay />
      </template>
    </div>
  </div>
</template>

<style scoped>
.calorie-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.track-toggle {
  display: flex;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md) var(--spacing-md);
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
}
</style>
