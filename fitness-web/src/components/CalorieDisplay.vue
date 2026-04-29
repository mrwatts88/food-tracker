<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  nutritionMetricColorVars,
  nutritionMetricLabels,
  nutritionMetrics,
  nutritionMetricUnits,
} from '@/lib/nutrition'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import type { EntryMetric, NutritionMetric, TrackMetric } from '@/types'

type DashboardCard = {
  key: string
  label: string
  value: string
  detail: string
  valueSuffix?: string
  supportingLines?: Array<{
    key: string
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
  summary?: boolean
  hideHeader?: boolean
  prominentSupporting?: boolean
  loading?: boolean
  submitting?: boolean
  warning?: string | null
  lockMetric?: NutritionMetric
  locked?: boolean
}

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
const lockedNutritionMetrics = ref<Set<NutritionMetric>>(new Set())
const submissionStartTotals = ref<Record<NutritionMetric, number | null>>({
  protein: null,
  sugar: null,
  caffeine: null,
  steps: null,
})
let intervalId: number | null = null

const nutritionLockStorageKey = computed(
  () => `nutrition-locks:${formatLocalDate(new Date(nowTick.value))}`,
)

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
    unlockStatus.value.dailyTargetCalories,
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
    timeZone: status.timezone,
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

  if (
    !status?.nextUnlockAt ||
    status.allCaloriesUnlockedToday ||
    estimatedServerNowMs.value === null
  ) {
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

const overdrawMessage = computed(() => {
  const status = unlockStatus.value

  if (!status || status.overdrawCalories <= 0) {
    return null
  }

  if (status.allCaloriesUnlockedToday) {
    return `Overdrawn by ${formatNumber(status.overdrawCalories)}. There are no more unlocks today.`
  }

  return `Overdrawn by ${formatNumber(status.overdrawCalories)}. Next reduced from ${formatNumber(
    status.nextScheduledUnlockCalories,
  )} to ${formatNumber(status.nextEffectiveUnlockCalories)}.`
})

const calorieSupportingLines = computed<NonNullable<DashboardCard['supportingLines']>>(() => [
  {
    key: 'unlock',
    value: nutritionUnlockSummary.value,
  },
  {
    key: 'consumed-target',
    value: consumedVsTarget.value,
  },
])

const nutritionCards = computed<DashboardCard[]>(() => [
  {
    key: 'nutrition-calories',
    label: 'Calories',
    unit: 'kCals',
    value: formatNumber(availableCalories.value),
    detail: '',
    valueSuffix: 'Available',
    selectMetric: 'calorie',
    historyMetric: 'calorie',
    accentColor: 'var(--color-calorie-primary)',
    hero: false,
    loading: calorieStore.loading && !calorieStore.submittingEntry,
    submitting: calorieStore.submittingEntry,
  },
  {
    key: 'nutrition-calorie-pacing',
    label: 'Calorie pacing',
    value: '',
    detail: '',
    supportingLines: calorieSupportingLines.value,
    accentColor: 'var(--color-calorie-primary)',
    hideHeader: true,
    prominentSupporting: true,
    loading: calorieStore.loading && !calorieStore.submittingEntry,
    submitting: calorieStore.submittingEntry,
  },
  ...nutritionMetrics.map((metric) => ({
    key: `nutrition-${metric}`,
    label: nutritionMetricLabels[metric],
    unit: nutritionMetricUnits[metric],
    value: formatProgressValue(
      nutritionStore.totalsByMetric[metric],
      nutritionStore.goalsByMetric[metric] ?? null,
    ),
    detail: '',
    selectMetric: metric,
    historyMetric: metric,
    lockMetric: metric,
    locked: lockedNutritionMetrics.value.has(metric),
    accentColor: nutritionMetricColorVars[metric],
    loading: nutritionStore.loadingByMetric[metric] && !nutritionStore.submittingByMetric[metric],
    submitting: nutritionStore.submittingByMetric[metric],
  })),
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
  detailInBody: true,
  loading: weightStore.loading && !weightStore.submittingEntry,
  submitting: weightStore.submittingEntry,
}))

const displayCards = computed<DashboardCard[]>(() =>
  isWeightMode.value ? [weightCard.value] : nutritionCards.value,
)

watch(
  () => unlockStatus.value?.nextUnlockAt,
  () => {
    boundaryRefreshTarget.value = null
  },
)

onMounted(() => {
  loadNutritionLocks()

  intervalId = window.setInterval(() => {
    nowTick.value = Date.now()
    maybeRefreshUnlockStatus()
  }, 1000)
})

watch(nutritionLockStorageKey, () => {
  loadNutritionLocks()
})

for (const metric of nutritionMetrics) {
  watch(
    () => nutritionStore.submittingByMetric[metric],
    (isSubmitting, wasSubmitting) => {
      if (isSubmitting && !wasSubmitting) {
        submissionStartTotals.value[metric] = nutritionStore.totalsByMetric[metric]
        return
      }

      if (!isSubmitting && wasSubmitting) {
        maybeAutoLockNutritionMetric(metric)
        submissionStartTotals.value[metric] = null
      }
    },
  )
}

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

function toggleNutritionLock(metric: NutritionMetric) {
  const nextLockedMetrics = new Set(lockedNutritionMetrics.value)

  if (nextLockedMetrics.has(metric)) {
    nextLockedMetrics.delete(metric)
  } else {
    nextLockedMetrics.add(metric)
  }

  lockedNutritionMetrics.value = nextLockedMetrics
  saveNutritionLocks()
}

function lockNutritionMetric(metric: NutritionMetric) {
  if (lockedNutritionMetrics.value.has(metric)) {
    return
  }

  const nextLockedMetrics = new Set(lockedNutritionMetrics.value)
  nextLockedMetrics.add(metric)
  lockedNutritionMetrics.value = nextLockedMetrics
  saveNutritionLocks()
}

function maybeAutoLockNutritionMetric(metric: NutritionMetric) {
  const goal = nutritionStore.goalsByMetric[metric] ?? null
  const startTotal = submissionStartTotals.value[metric]
  const currentTotal = nutritionStore.totalsByMetric[metric]

  if (goal === null || startTotal === null) {
    return
  }

  if (startTotal < goal && currentTotal >= goal) {
    lockNutritionMetric(metric)
  }
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

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function formatNumber(value: number) {
  return value.toLocaleString()
}

function formatProgressValue(current: number, goal: number | null) {
  const goalValue = goal === null ? '--' : formatNumber(goal)
  return `${formatNumber(current)} / ${goalValue}`
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function loadNutritionLocks() {
  const storedMetrics = window.localStorage.getItem(nutritionLockStorageKey.value)

  if (!storedMetrics) {
    lockedNutritionMetrics.value = new Set()
    return
  }

  try {
    const parsedMetrics = JSON.parse(storedMetrics)

    if (!Array.isArray(parsedMetrics)) {
      lockedNutritionMetrics.value = new Set()
      return
    }

    lockedNutritionMetrics.value = new Set(
      parsedMetrics.filter((metric): metric is NutritionMetric =>
        nutritionMetrics.includes(metric as NutritionMetric),
      ),
    )
  } catch {
    lockedNutritionMetrics.value = new Set()
  }
}

function saveNutritionLocks() {
  window.localStorage.setItem(
    nutritionLockStorageKey.value,
    JSON.stringify([...lockedNutritionMetrics.value]),
  )
}
</script>

<template>
  <div class="calorie-display">
    <div :class="['track-grid', { 'track-grid--single': displayCards.length === 1 }]">
      <template v-for="card in displayCards" :key="card.key">
        <div
          v-if="card.hero"
          :class="[
            'track-card',
            'track-card--primary',
            {
              'track-card--selectable': Boolean(card.selectMetric),
              'track-card--selected': props.activeMetric === card.selectMetric,
              'track-card--locked': card.locked,
            },
          ]"
          :style="{ '--card-accent': card.accentColor ?? 'var(--color-calorie-primary)' }"
          @click="selectMetric(card.selectMetric)"
        >
          <div v-if="!card.hideHeader" class="track-card-header">
            <div class="track-card-header-copy">
              <div class="track-card-label">{{ card.label }}</div>
            </div>
            <div class="track-card-actions">
              <button
                v-if="card.lockMetric"
                class="icon-button lock-button"
                :class="{ 'lock-button--active': card.locked }"
                :style="{ color: card.accentColor ?? 'var(--color-calorie-primary)' }"
                :aria-pressed="card.locked ? 'true' : 'false'"
                :aria-label="`${card.locked ? 'Unlock' : 'Lock'} ${card.label.toLowerCase()} tile for today`"
                :title="`${card.locked ? 'Unlock' : 'Lock'} ${card.label.toLowerCase()} for today`"
                @click.stop="toggleNutritionLock(card.lockMetric)"
              >
                <svg
                  v-if="card.locked"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z"
                  />
                </svg>
                <svg
                  v-else
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 11V8a5 5 0 0 1 9.5-2.2M6 11h12v9H6z"
                  />
                </svg>
              </button>
              <button
                v-if="card.historyMetric"
                class="icon-button"
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
          </div>
          <div
            class="track-card-body track-card-body--hero"
            :class="{ 'track-card-body--with-supporting': Boolean(card.supportingLines?.length) }"
          >
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
            <template v-else>
              <div
                v-if="card.supportingLines?.length"
                class="track-card-supporting"
                :class="{
                  'track-card-supporting--submitting': card.submitting,
                  'track-card-supporting--prominent': card.prominentSupporting,
                }"
              >
                <div
                  v-for="line in card.supportingLines"
                  :key="line.key"
                  class="track-card-supporting-line"
                >
                  {{ line.value }}
                </div>
              </div>
              <div
                v-if="card.value || card.detailInBody"
                class="track-card-value-stack track-card-value-stack--bottom"
              >
                <div
                  v-if="card.value"
                  class="track-card-value"
                  :class="{
                    'track-card-value--hero': card.emphasizedValue,
                    'track-card-value--submitting': card.submitting,
                    'track-card-value--hero-compact': card.compactValue,
                  }"
                  :style="{ color: card.accentColor }"
                >
                  {{ card.value }}
                </div>
                <div v-if="card.detailInBody" class="track-card-detail">
                  {{ card.detail }}
                </div>
              </div>
              <div
                v-if="card.detailInBody && card.warning"
                class="track-card-detail track-card-detail--warning"
              >
                {{ card.warning }}
              </div>
            </template>
          </div>
          <div v-if="!card.detailInBody && card.detail" class="track-card-detail">
            {{ card.detail }}
          </div>
          <div
            v-if="!card.detailInBody && card.warning"
            class="track-card-detail track-card-detail--warning"
          >
            {{ card.warning }}
          </div>
          <div v-if="card.locked" class="track-card-lock-overlay" aria-hidden="true">
            <svg class="track-card-lock-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z"
              />
            </svg>
          </div>
        </div>

        <div
          v-else
          :class="[
            'track-card',
            {
              'track-card--accented': Boolean(card.accentColor),
              'track-card--summary': card.summary,
              'track-card--selectable': Boolean(card.selectMetric),
              'track-card--selected': props.activeMetric === card.selectMetric,
              'track-card--locked': card.locked,
            },
          ]"
          :style="card.accentColor ? { '--card-accent': card.accentColor } : undefined"
          @click="selectMetric(card.selectMetric)"
        >
          <div v-if="!card.hideHeader" class="track-card-header">
            <div class="track-card-header-copy">
              <div class="track-card-label">{{ card.label }}</div>
            </div>
            <div class="track-card-actions">
              <button
                v-if="card.lockMetric"
                class="icon-button lock-button"
                :class="{ 'lock-button--active': card.locked }"
                :style="{ color: card.accentColor ?? 'var(--color-calorie-primary)' }"
                :aria-pressed="card.locked ? 'true' : 'false'"
                :aria-label="`${card.locked ? 'Unlock' : 'Lock'} ${card.label.toLowerCase()} tile for today`"
                :title="`${card.locked ? 'Unlock' : 'Lock'} ${card.label.toLowerCase()} for today`"
                @click.stop="toggleNutritionLock(card.lockMetric)"
              >
                <svg
                  v-if="card.locked"
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z"
                  />
                </svg>
                <svg
                  v-else
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 11V8a5 5 0 0 1 9.5-2.2M6 11h12v9H6z"
                  />
                </svg>
              </button>
              <button
                v-if="card.historyMetric"
                class="icon-button"
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
            <template v-else>
              <div
                v-if="card.supportingLines?.length"
                class="track-card-supporting"
                :class="{
                  'track-card-supporting--submitting': card.submitting,
                  'track-card-supporting--prominent': card.prominentSupporting,
                }"
              >
                <div
                  v-for="line in card.supportingLines"
                  :key="line.key"
                  class="track-card-supporting-line"
                >
                  {{ line.value }}
                </div>
              </div>
              <div
                v-if="card.value || card.detail"
                class="track-card-value-stack track-card-value-stack--bottom"
              >
                <div
                  class="track-card-value"
                  :class="{ 'track-card-value--submitting': card.submitting }"
                  :style="{ color: card.accentColor ?? 'var(--color-text)' }"
                >
                  {{ card.value }}
                  <span v-if="card.valueSuffix" class="track-card-value-suffix">
                    {{ card.valueSuffix }}
                  </span>
                </div>
                <div v-if="card.detail" class="track-card-detail">{{ card.detail }}</div>
              </div>
            </template>
            <div v-if="card.warning" class="track-card-detail track-card-detail--warning">
              {{ card.warning }}
            </div>
          </div>
          <div v-if="card.locked" class="track-card-lock-overlay" aria-hidden="true">
            <svg class="track-card-lock-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z"
              />
            </svg>
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
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.track-grid--single {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
}

.track-card {
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  padding: 10px;
  border-radius: var(--border-radius);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-surface) 94%, white 6%),
    var(--color-surface)
  );
  border: 1px solid color-mix(in srgb, var(--color-calorie-primary) 20%, transparent);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.track-card--summary {
  grid-column: 1 / -1;
}

.track-card--primary,
.track-card--accented {
  border-color: color-mix(in srgb, var(--card-accent) 40%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--card-accent) 14%, transparent),
    var(--color-surface)
  );
}

.track-card--selectable {
  cursor: pointer;
}

.track-card--selected {
  border-color: color-mix(in srgb, var(--card-accent) 80%, white 20%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--card-accent) 70%, transparent);
}

.track-card--locked {
  border-color: color-mix(in srgb, var(--card-accent) 28%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--card-accent) 7%, transparent),
    var(--color-surface)
  );
}

.track-card-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.track-card-header-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.track-card-body {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}

.track-card-body--hero {
  align-items: flex-start;
}

.track-card-body--with-supporting {
  justify-content: flex-start;
}

.track-card-label {
  min-width: 0;
  font-size: 16px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-card-value {
  font-size: clamp(16px, 3.9vw, 23px);
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

.track-card-value-suffix {
  margin-left: 6px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 700;
  vertical-align: baseline;
}

.track-card-supporting {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.track-card-supporting--submitting {
  opacity: 0.45;
}

.track-card-supporting-line {
  min-width: 0;
  font-size: 11px;
  line-height: 1.25;
  font-weight: 700;
  color: color-mix(in srgb, var(--color-text) 88%, var(--card-accent) 12%);
  word-break: break-word;
}

.track-card-supporting--prominent {
  height: 100%;
  justify-content: center;
  gap: 8px;
}

.track-card-supporting--prominent .track-card-supporting-line {
  font-size: clamp(16px, 4vw, 20px);
  line-height: 1.12;
  font-weight: 800;
  color: var(--card-accent);
}

.track-card-value-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.track-card-value-stack--bottom {
  margin-top: auto;
}

.track-card-detail {
  position: relative;
  z-index: 2;
  font-size: 11px;
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
  min-height: 36px;
  min-width: 42px;
}

.loading-spinner {
  width: 22px;
  height: 22px;
  border: 3px solid color-mix(in srgb, var(--spinner-color) 25%, transparent);
  border-top-color: var(--spinner-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.track-card-actions {
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: row;
  gap: 4px;
}

.track-card-lock-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--card-accent) 72%, white 28%);
  background: rgba(0, 0, 0, 0.46);
  pointer-events: none;
}

.track-card-lock-mark {
  width: min(32%, 56px);
  height: auto;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.28));
  opacity: 0.92;
  transform: translate(-4px, 2px);
}

.icon-button {
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 5px;
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-button svg {
  width: 21px;
  height: 21px;
}

.icon-button:active {
  transform: scale(0.98);
}

.icon-button:active {
  background: rgba(255, 255, 255, 0.08);
}

.lock-button {
  background: var(--color-surface);
}

.lock-button svg {
  opacity: 0.58;
}

.lock-button--active {
  background: color-mix(in srgb, var(--card-accent) 18%, var(--color-surface));
}

.lock-button--active svg {
  opacity: 1;
}

@media (max-width: 428px) {
  .calorie-display {
    padding-bottom: var(--spacing-sm);
  }

  .track-card {
    padding: 9px;
  }

  .icon-button {
    padding: 5px;
  }

  .icon-button svg {
    width: 22px;
    height: 22px;
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

  .track-card-supporting {
    gap: 3px;
  }

  .track-card-supporting-line {
    font-size: 12px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
