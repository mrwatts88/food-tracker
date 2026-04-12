<script setup lang="ts">
import { computed } from 'vue'
import { useCalorieStore } from '@/stores/calorie'
import { useWeightStore } from '@/stores/weight'
import WeightChart from './WeightChart.vue'

const calorieStore = useCalorieStore()
const weightStore = useWeightStore()

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

const currentWeight = computed(() => {
  return weightStore.entries[0]?.amount ?? null
})

const poundsToGoal = computed(() => {
  const goalWeight = toFiniteNumber(calorieStore.goalWeight)
  const current = toFiniteNumber(currentWeight.value)

  if (goalWeight === null || current === null) {
    return null
  }

  return Math.max(0, current - goalWeight)
})

const closestToGoal = computed(() => {
  const goalWeight = toFiniteNumber(calorieStore.goalWeight)

  if (goalWeight === null || weightStore.entries.length === 0) {
    return null
  }

  return weightStore.entries.reduce((closest, entry) => {
    const distance = Math.max(0, entry.amount - goalWeight)

    if (closest === null) {
      return distance
    }

    return Math.min(closest, distance)
  }, null as number | null)
})

const goalWeightDisplay = computed(() => {
  const value = toFiniteNumber(calorieStore.goalWeight)

  if (value === null) {
    return '-'
  }

  return value.toFixed(1)
})

const poundsToGoalDisplay = computed(() => {
  const value = poundsToGoal.value

  if (value === null) {
    return '-'
  }

  return `${value.toFixed(1)} lb to go`
})

const closestToGoalDisplay = computed(() => {
  const value = closestToGoal.value

  if (value === null) {
    return 'closest: -'
  }

  return `closest: ${value.toFixed(1)} lb`
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
    <div class="goal-progress-card">
      <div class="goal-progress-label">Goal Weight</div>
      <div class="goal-progress-value">{{ poundsToGoalDisplay }}</div>
      <div class="goal-progress-detail">{{ closestToGoalDisplay }}</div>
      <div class="goal-progress-target">target {{ goalWeightDisplay }} lb</div>
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

.goal-progress-card {
  width: 100%;
  padding: 16px 18px;
  border-radius: var(--border-radius);
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--color-weight-primary) 18%, transparent), var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-weight-primary) 38%, transparent);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.goal-progress-label,
.goal-progress-target {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.7px;
  font-weight: 600;
  text-align: center;
}

.goal-progress-value {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-weight-primary);
  text-align: center;
}

.goal-progress-detail {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
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

  .goal-progress-value {
    font-size: 24px;
  }

  .label {
    font-size: 10px;
  }

  .stats-row {
    gap: var(--spacing-md);
  }
}
</style>
