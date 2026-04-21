<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  isNutritionMetric,
  nutritionMetricColorVars,
  nutritionMetricLabels,
  nutritionMetrics,
  nutritionMetricUnits
} from '@/lib/nutrition'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import type { EntryMetric, NutritionMetric } from '@/types'

type DashboardCard = {
  key: string
  label: string
  value: string
  detail: string
  historyMetric?: EntryMetric
  unit?: string
  accentColor?: string
  hero?: boolean
  emphasizedValue?: boolean
  compactValue?: boolean
  detailInBody?: boolean
  loading?: boolean
  submitting?: boolean
  warning?: string | null
}

const props = defineProps<{
  activeMetric: EntryMetric
}>()

const calorieStore = useCalorieStore()
const nutritionStore = useNutritionStore()
const weightStore = useWeightStore()
const appStore = useAppStore()

const nowTick = ref(Date.now())
const boundaryRefreshTarget = ref<string | null>(null)
const refreshingBoundary = ref(false)
let intervalId: number | null = null

const isNutritionMode = computed(() => isNutritionMetric(props.activeMetric))
const isWeightMode = computed(() => props.activeMetric === 'weight')

const activeNutritionMetric = computed<NutritionMetric>(() =>
  isNutritionMetric(props.activeMetric) ? props.activeMetric : 'protein'
)
const nutritionAccentColor = computed(() => nutritionMetricColorVars[activeNutritionMetric.value])
const activeNutritionLabel = computed(() => nutritionMetricLabels[activeNutritionMetric.value])
const activeNutritionUnit = computed(() => nutritionMetricUnits[activeNutritionMetric.value])

const primaryLoading = computed(() => {
  if (isWeightMode.value) {
    return weightStore.loading
  }

  if (isNutritionMode.value) {
    return nutritionStore.currentLoading
  }

  return calorieStore.loading
})

const primarySubmitting = computed(() => {
  if (isWeightMode.value) {
    return weightStore.submittingEntry
  }

  if (isNutritionMode.value) {
    return nutritionStore.currentSubmitting
  }

  return calorieStore.submittingEntry
})

const accentColor = computed(() => {
  if (isWeightMode.value) {
    return 'var(--color-weight-primary)'
  }

  if (isNutritionMode.value) {
    return nutritionAccentColor.value
  }

  return 'var(--color-calorie-primary)'
})

const unlockStatus = computed(() => calorieStore.unlockStatus)

const availableCalories = computed(() => {
  return unlockStatus.value?.availableCalories ?? Math.max(0, calorieStore.remainingCalories)
})

const mainCardLabel = computed(() => {
  if (isWeightMode.value) {
    return 'Weight'
  }

  if (isNutritionMode.value) {
    return activeNutritionLabel.value
  }

  return 'Calories'
})

const mainCardUnit = computed(() => {
  if (isWeightMode.value) {
    return 'lbs'
  }

  if (isNutritionMode.value) {
    return activeNutritionUnit.value
  }

  return 'kCals'
})

const mainCardValue = computed(() => {
  if (isWeightMode.value) {
    return weightStore.todayWeight?.amount.toFixed(1) ?? '-'
  }

  if (isNutritionMode.value) {
    return formatProgressValue(nutritionStore.currentTotal, nutritionStore.currentGoal)
  }

  return formatNumber(availableCalories.value)
})

const mainCardDetail = computed(() => {
  if (isWeightMode.value) {
    return weightStore.todayWeight ? 'Latest entry for today' : 'No weight logged today'
  }

  if (isNutritionMode.value) {
    return `Total for today in ${activeNutritionUnit.value}`
  }

  return 'Available right now'
})

const showPrimaryLoader = computed(() => {
  if (!primaryLoading.value || primarySubmitting.value) {
    return false
  }

  return props.activeMetric !== 'calorie' || !unlockStatus.value
})

const consumedVsTarget = computed(() => {
  if (!unlockStatus.value) {
    return `${formatNumber(calorieStore.totalCalories)} / ${formatNumber(calorieStore.effectiveDailyTarget)}`
  }

  return `${formatNumber(unlockStatus.value.consumedCalories)} / ${formatNumber(
    unlockStatus.value.dailyTargetCalories
  )}`
})

const nextUnlockTimeLabel = computed(() => {
  const status = unlockStatus.value

  if (!status?.nextUnlockAt) {
    return null
  }

  const nextUnlockDate = new Date(status.nextUnlockAt)

  if (Number.isNaN(nextUnlockDate.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: status.timezone
  }).format(nextUnlockDate)
})

const estimatedServerNowMs = computed(() => {
  const status = unlockStatus.value

  if (!status) {
    return null
  }

  const serverNowMs = Date.parse(status.serverNow)

  if (Number.isNaN(serverNowMs)) {
    return null
  }

  const elapsedSinceFetch = Math.max(0, nowTick.value - calorieStore.unlockStatusReceivedAt)
  return serverNowMs + elapsedSinceFetch
})

const countdownMs = computed(() => {
  const status = unlockStatus.value

  if (!status?.nextUnlockAt || status.allCaloriesUnlockedToday || estimatedServerNowMs.value === null) {
    return null
  }

  const nextUnlockMs = Date.parse(status.nextUnlockAt)

  if (Number.isNaN(nextUnlockMs)) {
    return null
  }

  return Math.max(0, nextUnlockMs - estimatedServerNowMs.value)
})

const countdownLabel = computed(() => {
  if (countdownMs.value === null) {
    return null
  }

  return formatCountdown(countdownMs.value)
})

const nextUnlockPrimary = computed(() => {
  const status = unlockStatus.value

  if (!status) {
    return 'Loading...'
  }

  if (status.allCaloriesUnlockedToday) {
    return 'Done for today'
  }

  return countdownLabel.value ?? '--:--:--'
})

const nextUnlockSummary = computed(() => {
  const status = unlockStatus.value

  if (!status) {
    return 'Fetching next unlock'
  }

  if (status.allCaloriesUnlockedToday) {
    return 'All calories unlocked today'
  }

  if (!nextUnlockTimeLabel.value) {
    return 'Next unlock unavailable'
  }

  return `${nextUnlockTimeLabel.value} (+${formatNumber(status.nextEffectiveUnlockCalories)})`
})

const streakSummary = computed(() => {
  const status = unlockStatus.value

  if (!status) {
    return 'Loading streak'
  }

  const streak = status.noBorrowUnlockStreak
  const noun = streak === 1 ? 'unlock' : 'unlocks'
  return `${formatNumber(streak)} ${noun}`
})

const overdrawMessage = computed(() => {
  const status = unlockStatus.value

  if (!status || status.overdrawCalories <= 0) {
    return null
  }

  if (status.allCaloriesUnlockedToday) {
    return `Overdrawn by ${formatNumber(status.overdrawCalories)}. There are no more unlocks today.`
  }

  return `Overdrawn by ${formatNumber(status.overdrawCalories)}. Next reduced from ${formatNumber(
    status.nextScheduledUnlockCalories
  )} to ${formatNumber(status.nextEffectiveUnlockCalories)}.`
})

const overviewCards = computed<DashboardCard[]>(() => [
  {
    key: 'overview-primary',
    label: mainCardLabel.value,
    unit: mainCardUnit.value,
    value: mainCardValue.value,
    detail: mainCardDetail.value,
    historyMetric: props.activeMetric,
    accentColor: accentColor.value,
    hero: true,
    emphasizedValue: true,
    compactValue: isNutritionMode.value,
    loading: showPrimaryLoader.value,
    submitting: primarySubmitting.value
  },
  {
    key: 'overview-next-unlock',
    label: 'Next Unlock',
    value: nextUnlockPrimary.value,
    detail: nextUnlockSummary.value,
    warning: overdrawMessage.value
  },
  {
    key: 'overview-streak',
    label: 'No-Borrow Streak',
    value: streakSummary.value,
    detail: 'Completed unlock slots'
  },
  {
    key: 'overview-consumed-target',
    label: 'Consumed / Target',
    value: consumedVsTarget.value,
    detail: `${formatNumber(unlockStatus.value?.unlockedCalories ?? 0)} unlocked so far`
  }
])

const nutritionCards = computed<DashboardCard[]>(() => [
  {
    key: 'nutrition-calories',
    label: 'Calories',
    unit: 'kCals',
    value: consumedVsTarget.value,
    detail: 'Total today',
    historyMetric: 'calorie',
    accentColor: 'var(--color-calorie-primary)',
    hero: true,
    emphasizedValue: false,
    detailInBody: true,
    loading: calorieStore.loading && !calorieStore.submittingEntry,
    submitting: calorieStore.submittingEntry
  },
  ...nutritionMetrics.map(metric => ({
    key: `nutrition-${metric}`,
    label: nutritionMetricLabels[metric],
    unit: nutritionMetricUnits[metric],
    value: formatProgressValue(nutritionStore.totalsByMetric[metric], nutritionStore.goalsByMetric[metric] ?? null),
    detail: 'Total today',
    historyMetric: metric,
    accentColor: nutritionMetricColorVars[metric],
    loading: nutritionStore.loadingByMetric[metric] && !nutritionStore.submittingByMetric[metric],
    submitting: nutritionStore.submittingByMetric[metric]
  }))
])

const dashboardCards = computed<DashboardCard[]>(() =>
  appStore.trackDashboardMode === 'nutrition' ? nutritionCards.value : overviewCards.value
)

watch(
  () => unlockStatus.value?.nextUnlockAt,
  () => {
    boundaryRefreshTarget.value = null
  }
)

onMounted(() => {
  intervalId = window.setInterval(() => {
    nowTick.value = Date.now()
    maybeRefreshUnlockStatus()
  }, 1000)
})

onBeforeUnmount(() => {
  if (intervalId !== null) {
    window.clearInterval(intervalId)
  }
})

function maybeRefreshUnlockStatus() {
  const status = unlockStatus.value

  if (
    !status?.nextUnlockAt ||
    status.allCaloriesUnlockedToday ||
    estimatedServerNowMs.value === null ||
    refreshingBoundary.value ||
    calorieStore.loading ||
    calorieStore.submittingEntry ||
    boundaryRefreshTarget.value === status.nextUnlockAt
  ) {
    return
  }

  const nextUnlockMs = Date.parse(status.nextUnlockAt)

  if (Number.isNaN(nextUnlockMs) || estimatedServerNowMs.value < nextUnlockMs) {
    return
  }

  boundaryRefreshTarget.value = status.nextUnlockAt
  refreshingBoundary.value = true

  void calorieStore.fetchUnlockStatus().finally(() => {
    refreshingBoundary.value = false
  })
}

function openHistory(metric?: EntryMetric) {
  appStore.openDrawer(metric)
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

function formatNumber(value: number) {
  return value.toLocaleString()
}

function formatProgressValue(current: number, goal: number | null) {
  const goalValue = goal === null ? '--' : formatNumber(goal)
  return `${formatNumber(current)} / ${goalValue}`
}
</script>

<template>
  <div class="calorie-display">
    <div class="track-grid">
      <template v-for="card in dashboardCards" :key="card.key">
        <div
          v-if="card.hero"
          class="track-card track-card--primary"
          :style="{ '--card-accent': card.accentColor ?? 'var(--color-calorie-primary)' }"
        >
          <div class="track-card-header">
            <div class="track-card-header-copy">
              <div class="track-card-label">{{ card.label }}</div>
              <div v-if="card.unit" class="track-card-unit">{{ card.unit }}</div>
            </div>
            <button
              v-if="card.historyMetric"
              class="history-button"
              :style="{ color: card.accentColor ?? 'var(--color-calorie-primary)' }"
              :aria-label="`Open ${card.label.toLowerCase()} history`"
              :title="`Open ${card.label.toLowerCase()} history`"
              @click="openHistory(card.historyMetric)"
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
          </div>
          <div class="track-card-body track-card-body--hero">
            <div
              v-if="card.loading"
              class="loading-indicator"
              role="status"
              :aria-label="`Loading ${card.label.toLowerCase()}`"
            >
              <span
                class="loading-spinner"
                :style="{ '--spinner-color': card.accentColor ?? 'var(--color-calorie-primary)' }"
              ></span>
            </div>
            <div
              v-else
              class="track-card-value"
              :class="{
                'track-card-value--hero': card.emphasizedValue,
                'track-card-value--submitting': card.submitting,
                'track-card-value--hero-compact': card.compactValue
              }"
              :style="{ color: card.accentColor }"
            >
              {{ card.value }}
            </div>
            <div v-if="card.detailInBody" class="track-card-detail">{{ card.detail }}</div>
            <div v-if="card.detailInBody && card.warning" class="track-card-detail track-card-detail--warning">
              {{ card.warning }}
            </div>
          </div>
          <div v-if="!card.detailInBody" class="track-card-detail">{{ card.detail }}</div>
          <div v-if="!card.detailInBody && card.warning" class="track-card-detail track-card-detail--warning">
            {{ card.warning }}
          </div>
        </div>

        <div
          v-else
          :class="['track-card', { 'track-card--accented': Boolean(card.accentColor) }]"
          :style="card.accentColor ? { '--card-accent': card.accentColor } : undefined"
        >
          <div class="track-card-header">
            <div class="track-card-header-copy">
              <div class="track-card-label">{{ card.label }}</div>
              <div v-if="card.unit" class="track-card-unit">{{ card.unit }}</div>
            </div>
            <button
              v-if="card.historyMetric"
              class="history-button"
              :style="{ color: card.accentColor ?? 'var(--color-calorie-primary)' }"
              :aria-label="`Open ${card.label.toLowerCase()} history`"
              :title="`Open ${card.label.toLowerCase()} history`"
              @click="openHistory(card.historyMetric)"
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
          </div>
          <div class="track-card-body">
            <div
              v-if="card.loading"
              class="loading-indicator loading-indicator--compact"
              role="status"
              :aria-label="`Loading ${card.label.toLowerCase()}`"
            >
              <span
                class="loading-spinner"
                :style="{ '--spinner-color': card.accentColor ?? 'var(--color-calorie-primary)' }"
              ></span>
            </div>
            <div
              v-else
              class="track-card-value"
              :class="{ 'track-card-value--submitting': card.submitting }"
              :style="{ color: card.accentColor ?? 'var(--color-text)' }"
            >
              {{ card.value }}
            </div>
            <div class="track-card-detail">{{ card.detail }}</div>
            <div v-if="card.warning" class="track-card-detail track-card-detail--warning">
              {{ card.warning }}
            </div>
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

.track-grid {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.track-card {
  min-width: 0;
  min-height: 0;
  padding: 14px;
  border-radius: var(--border-radius);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 94%, white 6%), var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-calorie-primary) 20%, transparent);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.track-card--primary,
.track-card--accented {
  border-color: color-mix(in srgb, var(--card-accent) 40%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card-accent) 14%, transparent), var(--color-surface));
}

.track-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.track-card-header-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.track-card-unit {
  display: inline-flex;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.track-card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.track-card-body--hero {
  align-items: flex-start;
}

.track-card-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 600;
}

.track-card-value {
  font-size: clamp(18px, 4.4vw, 26px);
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-text);
  word-break: break-word;
}

.track-card-value--hero {
  font-size: clamp(34px, 7.4vw, 52px);
  line-height: 1;
}

.track-card-value--hero-compact {
  font-size: clamp(24px, 5.4vw, 34px);
}

.track-card-value--submitting {
  opacity: 0.45;
}

.track-card-detail {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.35;
}

.track-card-detail--warning {
  color: #fcd34d;
}

.loading-indicator {
  min-height: 56px;
  min-width: 96px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.loading-indicator--compact {
  min-height: 42px;
  min-width: 42px;
}

.loading-spinner {
  width: 26px;
  height: 26px;
  border: 3px solid color-mix(in srgb, var(--spinner-color) 25%, transparent);
  border-top-color: var(--spinner-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.history-button {
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 8px;
  background: var(--color-surface);
  display: flex;
  align-items: center;
}

.history-button:active {
  transform: scale(0.98);
}

.history-button:active {
  background: rgba(255, 255, 255, 0.08);
}

@media (max-width: 428px) {
  .calorie-display {
    padding-bottom: var(--spacing-sm);
  }

  .track-card {
    padding: 12px;
  }

  .history-button {
    padding: 7px;
  }

  .track-card-value {
    font-size: clamp(16px, 4.6vw, 22px);
  }

  .track-card-value--hero {
    font-size: clamp(28px, 8vw, 42px);
  }

  .track-card-value--hero-compact {
    font-size: clamp(20px, 5.8vw, 28px);
  }

  .track-card-detail {
    font-size: 11px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
