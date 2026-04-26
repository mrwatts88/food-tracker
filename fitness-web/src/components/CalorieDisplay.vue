<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  nutritionMetricColorVars,
  nutritionMetricLabels,
  nutritionMetrics,
  nutritionMetricUnits
} from '@/lib/nutrition'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import type { EntryMetric, TrackMetric } from '@/types'

type DashboardCard = {
  key: string
  label: string
  value: string
  detail: string
  summaryRows?: Array<{
    key: string
    label: string
    value: string
  }>
  selectMetric?: TrackMetric
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

type DashboardSummaryRow = NonNullable<DashboardCard['summaryRows']>[number]

const props = defineProps<{
  activeMetric: EntryMetric
}>()
const emit = defineEmits<{
  'select-metric': [metric: TrackMetric]
}>()

const calorieStore = useCalorieStore()
const nutritionStore = useNutritionStore()
const weightStore = useWeightStore()
const appStore = useAppStore()

const nowTick = ref(Date.now())
const boundaryRefreshTarget = ref<string | null>(null)
const refreshingBoundary = ref(false)
let intervalId: number | null = null

const isWeightMode = computed(() => props.activeMetric === 'weight')

const unlockStatus = computed(() => calorieStore.unlockStatus)

const availableCalories = computed(() => {
  return unlockStatus.value?.availableCalories ?? Math.max(0, calorieStore.remainingCalories)
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

const nutritionUnlockSummary = computed(() => {
  const status = unlockStatus.value

  if (!status) {
    return nextUnlockSummary.value
  }

  if (status.allCaloriesUnlockedToday || !nextUnlockTimeLabel.value) {
    return nextUnlockSummary.value
  }

  return `+${formatNumber(status.nextEffectiveUnlockCalories)} in ${nextUnlockPrimary.value}`
})

const streakSummary = computed(() => {
  const status = unlockStatus.value

  if (!status) {
    return 'Loading streak'
  }

  const streak = status.dailyGoalStreak
  const noun = streak === 1 ? 'day' : 'days'
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

const nutritionCaloriesSummaryRows = computed<DashboardSummaryRow[]>(() => [
  {
    key: 'available',
    label: '',
    value: `${formatNumber(availableCalories.value)} available`
  },
  {
    key: 'unlock',
    label: '',
    value: nutritionUnlockSummary.value
  },
  {
    key: 'consumed-target',
    label: '',
    value: consumedVsTarget.value
  }
])

const nutritionCards = computed<DashboardCard[]>(() => [
  {
    key: 'nutrition-calories',
    label: 'Calories',
    unit: 'kCals',
    value: '',
    detail: '',
    summaryRows: nutritionCaloriesSummaryRows.value,
    selectMetric: 'calorie',
    historyMetric: 'calorie',
    accentColor: 'var(--color-calorie-primary)',
    hero: true,
    emphasizedValue: false,
    loading: calorieStore.loading && !calorieStore.submittingEntry,
    submitting: calorieStore.submittingEntry
  },
  ...nutritionMetrics.map(metric => ({
    key: `nutrition-${metric}`,
    label: nutritionMetricLabels[metric],
    unit: nutritionMetricUnits[metric],
    value: formatProgressValue(nutritionStore.totalsByMetric[metric], nutritionStore.goalsByMetric[metric] ?? null),
    detail: 'Total today',
    selectMetric: metric,
    historyMetric: metric,
    accentColor: nutritionMetricColorVars[metric],
    loading: nutritionStore.loadingByMetric[metric] && !nutritionStore.submittingByMetric[metric],
    submitting: nutritionStore.submittingByMetric[metric]
  }))
])

const weightCard = computed<DashboardCard>(() => ({
  key: 'weight',
  label: 'Weight',
  unit: 'lbs',
  value: weightStore.todayWeight?.amount.toFixed(1) ?? '-',
  detail: weightStore.todayWeight ? 'Latest entry for today' : 'No weight logged today',
  historyMetric: 'weight',
  accentColor: 'var(--color-weight-primary)',
  hero: true,
  emphasizedValue: true,
  loading: weightStore.loading && !weightStore.submittingEntry,
  submitting: weightStore.submittingEntry
}))

const displayCards = computed<DashboardCard[]>(() =>
  isWeightMode.value ? [weightCard.value] : nutritionCards.value
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

function selectMetric(metric?: TrackMetric) {
  if (!metric || props.activeMetric === metric) {
    return
  }

  emit('select-metric', metric)
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
    <div :class="['track-grid', { 'track-grid--single': displayCards.length === 1 }]">
      <div v-if="!isWeightMode" class="streak-badge" aria-label="Daily goal streak">
        <svg
          class="streak-badge-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M12 2c.4 2.2-.3 3.8-1.5 5.1C9.1 8.6 7 10.8 7 14a5 5 0 0 0 10 0c0-2.6-1.4-4.4-2.8-6-.8-.9-1.5-1.7-1.9-2.7-.4 1.4-1.2 2.4-2 3.4-.8 1-1.5 1.9-1.5 3.3a3 3 0 0 0 6 0c0-.7-.2-1.4-.6-2 .1 2-1.4 3.6-3.2 3.6-1.7 0-3-1.3-3-3 0-1.9 1.1-3.1 2.4-4.5C11.4 4.9 12.1 3.8 12 2Z"
          />
        </svg>
        <span>{{ streakSummary }}</span>
      </div>
      <template v-for="card in displayCards" :key="card.key">
        <div
          v-if="card.hero"
          :class="[
            'track-card',
            'track-card--primary',
            { 'track-card--selectable': Boolean(card.selectMetric), 'track-card--selected': props.activeMetric === card.selectMetric }
          ]"
          :style="{ '--card-accent': card.accentColor ?? 'var(--color-calorie-primary)' }"
          @click="selectMetric(card.selectMetric)"
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
              @click.stop="openHistory(card.historyMetric)"
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
            <template v-else-if="card.summaryRows">
              <div class="track-card-summary" :class="{ 'track-card-summary--submitting': card.submitting }">
                <div v-for="row in card.summaryRows" :key="row.key" class="track-card-summary-row">
                  <span v-if="row.label" class="track-card-summary-label">{{ row.label }}:</span>
                  <span class="track-card-summary-value">
                    {{ row.value }}
                  </span>
                </div>
              </div>
            </template>
            <template v-else>
              <div
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
            </template>
          </div>
          <div v-if="!card.detailInBody && card.detail" class="track-card-detail">{{ card.detail }}</div>
          <div v-if="!card.detailInBody && card.warning" class="track-card-detail track-card-detail--warning">
            {{ card.warning }}
          </div>
        </div>

        <div
          v-else
          :class="[
            'track-card',
            {
              'track-card--accented': Boolean(card.accentColor),
              'track-card--selectable': Boolean(card.selectMetric),
              'track-card--selected': props.activeMetric === card.selectMetric
            }
          ]"
          :style="card.accentColor ? { '--card-accent': card.accentColor } : undefined"
          @click="selectMetric(card.selectMetric)"
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
              @click.stop="openHistory(card.historyMetric)"
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
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.streak-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  transform: translate(-50%, -50%);
  min-width: 96px;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid rgba(245, 158, 11, 0.5);
  border-radius: 999px;
  background: #2f2a1b;
  color: #fbbf24;
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.28),
    0 0 0 4px var(--color-background);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
}

.streak-badge-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.track-grid--single {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
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

.track-card--selectable {
  cursor: pointer;
}

.track-card--selected {
  border-color: color-mix(in srgb, var(--card-accent) 80%, white 20%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--card-accent) 70%, transparent);
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

.track-card-summary {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track-card-summary--submitting {
  opacity: 0.45;
}

.track-card-summary-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.track-card-summary-label {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--color-text-secondary);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.track-card-summary-value {
  min-width: 0;
  font-size: 13px;
  line-height: 1.25;
  font-weight: 700;
  color: color-mix(in srgb, var(--color-text) 88%, var(--card-accent) 12%);
  word-break: break-word;
  flex: 1 1 auto;
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

  .track-card-summary {
    gap: 3px;
  }

  .track-card-summary-label {
    font-size: 10px;
  }

  .track-card-summary-value {
    font-size: 12px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
