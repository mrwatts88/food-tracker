<script setup lang="ts">
import { computed } from 'vue'
import { useCalorieStore } from '@/stores/calorie'
import WeightChart from './WeightChart.vue'

const calorieStore = useCalorieStore()

function formatCaloriesPerDay(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 0
  })
}

function toFiniteNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return value
}

const averageEatenDisplay = computed(() => {
  return formatCaloriesPerDay(calorieStore.eatenPerDay)
})

const averageBurnedDisplay = computed(() => {
  return formatCaloriesPerDay(calorieStore.tdee)
})

const isOvereating = computed(() => {
  const eaten = toFiniteNumber(calorieStore.eatenPerDay)
  const burned = toFiniteNumber(calorieStore.tdee)
  if (eaten === null || burned === null) return false
  return eaten >= burned
})

const isGaining = computed(() => {
  const value = toFiniteNumber(calorieStore.lossIn2Weeks)
  if (value === null) return false
  return -value >= 0
})

const lossIn2WeeksDisplay = computed(() => {
  const value = calorieStore.lossIn2Weeks
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }
  return (-value).toFixed(1)
})
</script>

<template>
  <div class="stats-display">
    <div class="stats-row">
      <div class="stats-item">
        <div class="label">Eaten / Day</div>
        <div class="value" :class="isOvereating ? 'warning' : 'success'">{{ averageEatenDisplay }}</div>
      </div>
      <div class="stats-item">
        <div class="label">Burned / Day</div>
        <div class="value burned">{{ averageBurnedDisplay }}</div>
      </div>
      <div class="stats-item">
        <div class="label">Change in 2wk</div>
        <div class="value" :class="isGaining ? 'warning' : 'success'">{{ lossIn2WeeksDisplay }}</div>
      </div>
    </div>
    <WeightChart :gaining="isGaining" />
  </div>
</template>

<style scoped>
.stats-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 48px;
  padding: var(--spacing-lg) var(--spacing-md);
  min-height: 0;
  overflow-y: auto;
}

.stats-row {
  display: flex;
  justify-content: center;
  gap: var(--spacing-lg);
  width: 100%;
}

.stats-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.label {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.value {
  font-size: 36px;
  font-weight: 700;
  line-height: 1;
}

.value.success {
  color: var(--color-calorie-primary);
}

.value.warning {
  color: #dc2626;
}

.value.burned {
  color: var(--color-weight-primary);
}

@media (min-width: 429px) {
  .stats-display {
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
    border-bottom: 3px solid var(--color-surface);
    border-bottom-left-radius: var(--border-radius);
    border-bottom-right-radius: var(--border-radius);
  }
}

@media (max-width: 360px) {
  .value {
    font-size: 28px;
  }

  .label {
    font-size: 10px;
  }

  .stats-row {
    gap: var(--spacing-md);
  }
}
</style>
