<script setup lang="ts">
import { computed } from 'vue'

import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useWeightStore } from '@/stores/weight'
import type { EntryMetric, TrackMetric } from '@/types'

const props = defineProps<{
  activeMetric: EntryMetric
}>()

// Kept so the parent's @select-metric listener stays valid; metric selection is
// no longer surfaced now that the calorie view is a single focused summary.
defineEmits<{
  'select-metric': [metric: TrackMetric]
}>()

const calorieStore = useCalorieStore()
const weightStore = useWeightStore()
const appStore = useAppStore()

const isWeightMode = computed(() => props.activeMetric === 'weight')

// Calorie summary — the three numbers that matter, no time-based unlock exposed.
// effectiveDailyTarget is the full day's allowance (not the unlock-gated amount).
const caloriesEaten = computed(() => calorieStore.totalCalories)
const caloriesAllowed = computed(() => calorieStore.effectiveDailyTarget)
const caloriesRemaining = computed(() => calorieStore.remainingCalories)
const isOverdrawn = computed(() => caloriesRemaining.value < 0)
const calorieLoading = computed(() => calorieStore.loading && !calorieStore.submittingEntry)

const weightValue = computed(() => weightStore.todayWeight?.amount.toFixed(1) ?? '-')
const weightDetail = computed(() =>
  weightStore.todayWeight ? 'Latest entry for today' : 'No weight logged today',
)
const weightLoading = computed(() => weightStore.loading && !weightStore.submittingEntry)

function openHistory(metric: EntryMetric) {
  appStore.openDrawer(metric)
}

function formatNumber(value: number) {
  return value.toLocaleString()
}
</script>

<template>
  <div class="calorie-display">
    <!-- Weight mode: same focused summary layout, one centered number -->
    <div
      v-if="isWeightMode"
      class="summary-card"
      :style="{ '--summary-accent': 'var(--color-weight-primary)' }"
    >
      <div
        v-if="weightLoading"
        class="loading-indicator loading-indicator--center"
        role="status"
        aria-label="Loading weight"
      >
        <span
          class="loading-spinner"
          :style="{ '--spinner-color': 'var(--color-weight-primary)' }"
        ></span>
      </div>
      <template v-else>
        <button
          class="icon-button summary-card-history"
          aria-label="Open weight history"
          title="Open weight history"
          @click="openHistory('weight')"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 7.5v5l4 1M4.252 5v4H8M5.07 8a8 8 0 1 1-.818 6"
            />
          </svg>
        </button>
        <div
          class="summary-hero"
          :class="{ 'summary-hero--submitting': weightStore.submittingEntry }"
        >
          <div class="summary-hero-value">{{ weightValue }}</div>
          <div class="summary-hero-label">{{ weightDetail }}</div>
        </div>
      </template>
    </div>

    <!-- Calorie mode: one focused summary — eaten, remaining, allowed -->
    <div
      v-else
      class="summary-card"
      :style="{ '--summary-accent': 'var(--color-calorie-primary)' }"
    >
      <div
        v-if="calorieLoading"
        class="loading-indicator loading-indicator--center"
        role="status"
        aria-label="Loading calories"
      >
        <span
          class="loading-spinner"
          :style="{ '--spinner-color': 'var(--color-calorie-primary)' }"
        ></span>
      </div>
      <template v-else>
        <button
          class="icon-button summary-card-history"
          aria-label="Open calorie history"
          title="Open calorie history"
          @click="openHistory('calorie')"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 7.5v5l4 1M4.252 5v4H8M5.07 8a8 8 0 1 1-.818 6"
            />
          </svg>
        </button>
        <div
          class="summary-hero"
          :class="{ 'summary-hero--submitting': calorieStore.submittingEntry }"
        >
          <div class="summary-hero-value" :class="{ 'summary-hero-value--over': isOverdrawn }">
            {{ formatNumber(caloriesRemaining) }}
          </div>
          <div class="summary-hero-label">
            {{ isOverdrawn ? 'Calories over' : 'Calories remaining' }}
          </div>
        </div>
        <div class="summary-splits">
          <div class="summary-split">
            <div class="summary-split-value">{{ formatNumber(caloriesEaten) }}</div>
            <div class="summary-split-label">Eaten</div>
          </div>
          <div class="summary-split">
            <div class="summary-split-value">{{ formatNumber(caloriesAllowed) }}</div>
            <div class="summary-split-label">Allowed</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.calorie-display {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-sm) var(--spacing-md);
  min-height: 0;
  overflow: hidden;
}

@media (min-width: 429px) {
  .calorie-display {
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
  }
}

/* Focused summary card — shared by calorie and weight modes */
.summary-card {
  position: relative;
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(20px, 6vh, 44px);
  padding: 10px;
  border-radius: var(--border-radius);
  border: 1px solid color-mix(in srgb, var(--summary-accent) 40%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--summary-accent) 14%, transparent),
    var(--color-surface)
  );
}

.summary-card-history {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 5;
  color: var(--summary-accent);
}

.summary-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.summary-hero--submitting {
  opacity: 0.45;
}

.summary-hero-value {
  font-size: clamp(64px, 22vw, 132px);
  font-weight: 800;
  line-height: 0.95;
  color: var(--summary-accent);
}

.summary-hero-value--over {
  color: #fcd34d;
}

.summary-hero-label {
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.summary-splits {
  display: flex;
  align-items: stretch;
  gap: clamp(24px, 10vw, 64px);
  text-align: center;
}

.summary-split {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-split-value {
  font-size: clamp(28px, 8vw, 44px);
  font-weight: 700;
  line-height: 1;
  color: var(--color-text);
}

.summary-split-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

/* Shared */
.icon-button {
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 4px;
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-button svg {
  width: 19px;
  height: 19px;
}

.icon-button:active {
  transform: scale(0.98);
  background: rgba(255, 255, 255, 0.08);
}

.loading-indicator {
  min-height: 56px;
  min-width: 96px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.loading-indicator--center {
  justify-content: center;
}

.loading-spinner {
  width: 22px;
  height: 22px;
  border: 3px solid color-mix(in srgb, var(--spinner-color) 25%, transparent);
  border-top-color: var(--spinner-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@media (max-width: 428px) {
  .calorie-display {
    padding-bottom: var(--spacing-sm);
  }

  .summary-card {
    padding: 9px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
