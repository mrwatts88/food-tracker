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

  return `${value.toFixed(1)} lb`
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
    <div class="stats-grid">
      <div class="stats-card">
        <div class="stats-card-label">Eaten / Day</div>
        <div class="stats-card-content">
          <div class="stats-card-value" :class="isOvereating ? 'warning' : 'success'">
            {{ averageEatenDisplay }}
          </div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-card-label">Burned / Day</div>
        <div class="stats-card-content">
          <div class="stats-card-value burned">{{ averageBurnedDisplay }}</div>
        </div>
      </div>
      <div class="stats-card stats-card--goal">
        <div class="stats-card-label">Until Goal</div>
        <div class="stats-card-content">
          <div class="stats-card-value weight">{{ poundsToGoalDisplay }}</div>
          <div class="stats-card-detail">{{ closestToGoalDisplay }}</div>
          <div class="stats-card-detail stats-card-detail--target">target {{ goalWeightDisplay }} lb</div>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-card-label">Change in 2wk</div>
        <div class="stats-card-content">
          <div class="stats-card-value" :class="isGaining ? 'warning' : 'success'">{{ lossIn2WeeksDisplay }}</div>
        </div>
      </div>
    </div>
    <div class="stats-chart">
      <WeightChart :gaining="isGaining" />
    </div>
  </div>
</template>

<style scoped>
.stats-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 18px;
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-lg);
  min-height: 0;
  overflow-y: auto;
}

.stats-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stats-card {
  min-width: 0;
  min-height: 132px;
  padding: 16px 14px;
  border-radius: var(--border-radius);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 94%, white 6%), var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-calorie-primary) 20%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.stats-card--goal {
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--color-weight-primary) 18%, transparent), var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-weight-primary) 38%, transparent);
}

.stats-card-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}

.stats-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

.stats-card-detail {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.35;
}

.stats-card-detail--target {
  text-transform: uppercase;
  letter-spacing: 0.7px;
  font-weight: 600;
}

.stats-card-value {
  font-size: clamp(24px, 5.2vw, 36px);
  font-weight: 700;
  line-height: 1;
  color: var(--color-text);
  word-break: break-word;
}

.stats-card-value.success {
  color: var(--color-calorie-primary);
}

.stats-card-value.warning {
  color: #dc2626;
}

.stats-card-value.burned,
.stats-card-value.weight {
  color: var(--color-weight-primary);
}

.stats-chart {
  width: 100%;
  margin-top: 24px;
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
  .stats-card {
    padding: 12px;
    min-height: 120px;
  }

  .stats-card-label {
    font-size: 10px;
  }

  .stats-card-value {
    font-size: clamp(20px, 5.6vw, 28px);
  }

  .stats-card-detail {
    font-size: 11px;
  }
}
</style>
