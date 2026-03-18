<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCalorieStore } from '@/stores/calorie'
import { useAppStore } from '@/stores/app'
import type { DisplayMode } from '@/types'

const calorieStore = useCalorieStore()
const appStore = useAppStore()
const displayMode = ref<DisplayMode>('consumed')

const displayValue = computed(() => {
  switch (displayMode.value) {
    case 'consumed':
      return calorieStore.totalCalories
    case 'remaining':
      return calorieStore.remainingCalories
    case 'goal':
      return calorieStore.calorieGoal
    default:
      return calorieStore.totalCalories
  }
})

const displayLabel = computed(() => {
  switch (displayMode.value) {
    case 'consumed':
      return 'Calories Today'
    case 'remaining':
      return 'Calories Remaining'
    case 'goal':
      return 'Daily Goal'
    default:
      return 'Calories Today'
  }
})

function cycleDisplayMode() {
  const modes: DisplayMode[] = ['consumed', 'remaining', 'goal']
  const currentIndex = modes.indexOf(displayMode.value)
  const nextIndex = (currentIndex + 1) % modes.length
  displayMode.value = modes[nextIndex] as DisplayMode
}
</script>

<template>
  <div class="calorie-display">
    <div class="label">{{ displayLabel }}</div>
    <div class="value-row">
      <div
        v-if="calorieStore.loading && !calorieStore.submittingEntry"
        class="loading-indicator"
        role="status"
        aria-label="Loading calories"
      >
        <span class="loading-spinner"></span>
      </div>
      <div
        v-else
        class="value"
        :class="{ 'value-submitting': calorieStore.submittingEntry }"
        @click="cycleDisplayMode"
      >
        {{ displayValue.toLocaleString() }}
      </div>
      <button class="history-button" @click="appStore.openDrawer">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 7.5v5l4 1M4.252 5v4H8M5.07 8a8 8 0 1 1-.818 6" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.calorie-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md);
  min-height: 0;
}

@media (min-width: 429px) {
  .calorie-display {
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
  }
}

.display-content {
  text-align: center;
  cursor: pointer;
  user-select: none;
  padding: var(--spacing-sm);
  border-radius: var(--border-radius);
  transition: background 0.2s ease;
}

.display-content:active {
  background: rgba(255, 255, 255, 0.05);
}

.label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}

.value-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.value {
  font-size: 56px;
  font-weight: 700;
  color: var(--color-calorie-primary);
  line-height: 1;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.value-submitting {
  opacity: 0.45;
}

.loading-indicator {
  min-height: 56px;
  min-width: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner {
  width: 26px;
  height: 26px;
  border: 3px solid rgba(16, 185, 129, 0.25);
  border-top-color: var(--color-calorie-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.history-button {
  padding: 12px 12px;
  background: var(--color-surface);
  border: none;
  border-radius: var(--border-radius);
  color: var(--color-calorie-primary);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.2s ease;
}

.history-button:active {
  transform: scale(0.98);
  background: rgba(16, 185, 129, 0.1);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
