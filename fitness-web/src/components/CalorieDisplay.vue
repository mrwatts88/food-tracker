<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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

const nowTick = ref(Date.now())
const boundaryRefreshTarget = ref<string | null>(null)
const refreshingBoundary = ref(false)
let intervalId: number | null = null

const isWeightMode = computed(() => props.activeMetric === 'weight')

const unlockStatus = computed(() => calorieStore.unlockStatus)

// Calorie summary. The hero number is what is available *right now*: calories
// unlocked so far today minus calories eaten. If unlock status is unavailable
// (the request failed) fall back to the plain full-day remaining amount.
const caloriesEaten = computed(() => calorieStore.totalCalories)
const caloriesAllowed = computed(() => calorieStore.effectiveDailyTarget)
const caloriesUnlocked = computed(
  () => unlockStatus.value?.unlockedCalories ?? caloriesAllowed.value,
)
const caloriesAvailable = computed(
  () => unlockStatus.value?.availableCalories ?? Math.max(0, calorieStore.remainingCalories),
)
const overdrawCalories = computed(
  () => unlockStatus.value?.overdrawCalories ?? Math.max(0, -calorieStore.remainingCalories),
)
const isOverdrawn = computed(() => overdrawCalories.value > 0)
const heroValue = computed(() =>
  isOverdrawn.value ? overdrawCalories.value : caloriesAvailable.value,
)
const heroLabel = computed(() => (isOverdrawn.value ? 'Over unlocked' : 'Available now'))
const calorieLoading = computed(() => calorieStore.loading && !calorieStore.submittingEntry)

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

// The server reports its own clock alongside the status, so the countdown is
// anchored to server time plus the wall-clock time elapsed since the fetch.
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
  const status = unlockStatus.value

  if (!status) {
    return null
  }

  if (status.allCaloriesUnlockedToday) {
    return 'Done for today'
  }

  return countdownMs.value === null ? '--:--:--' : formatCountdown(countdownMs.value)
})

const nextUnlockSummary = computed(() => {
  const status = unlockStatus.value

  if (!status) {
    return 'Next unlock unavailable'
  }

  if (status.allCaloriesUnlockedToday) {
    return 'All calories unlocked today'
  }

  if (!nextUnlockTimeLabel.value) {
    return 'Next unlock unavailable'
  }

  return `+${formatNumber(status.nextEffectiveUnlockCalories)} at ${nextUnlockTimeLabel.value}`
})

const overdrawMessage = computed(() => {
  const status = unlockStatus.value

  if (!status || status.overdrawCalories <= 0) {
    return null
  }

  if (status.allCaloriesUnlockedToday) {
    return 'No more unlocks today.'
  }

  return `Next unlock reduced from ${formatNumber(status.nextScheduledUnlockCalories)} to ${formatNumber(
    status.nextEffectiveUnlockCalories,
  )}.`
})

const weightValue = computed(() => weightStore.todayWeight?.amount.toFixed(1) ?? '-')
const weightDetail = computed(() =>
  weightStore.todayWeight ? 'Latest entry for today' : 'No weight logged today',
)
const weightLoading = computed(() => weightStore.loading && !weightStore.submittingEntry)

watch(
  () => unlockStatus.value?.nextUnlockAt,
  () => {
    boundaryRefreshTarget.value = null
  },
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

// Once the countdown crosses the next unlock boundary, refetch so the newly
// unlocked calories show up without a manual refresh. Guarded so each boundary
// triggers at most one refetch.
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

function openHistory(metric: EntryMetric) {
  appStore.openDrawer(metric)
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

    <!-- Calorie mode: available now (unlock-gated), next unlock countdown, and the day's totals -->
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
            {{ formatNumber(heroValue) }}
          </div>
          <div class="summary-hero-label">{{ heroLabel }}</div>
        </div>
        <div
          class="summary-unlock"
          :class="{ 'summary-unlock--submitting': calorieStore.submittingEntry }"
        >
          <div v-if="countdownLabel" class="summary-unlock-countdown">{{ countdownLabel }}</div>
          <div class="summary-unlock-line">{{ nextUnlockSummary }}</div>
          <div v-if="overdrawMessage" class="summary-unlock-line summary-unlock-line--warning">
            {{ overdrawMessage }}
          </div>
        </div>
        <div class="summary-splits">
          <div class="summary-split">
            <div class="summary-split-value">{{ formatNumber(caloriesEaten) }}</div>
            <div class="summary-split-label">Eaten</div>
          </div>
          <div class="summary-split">
            <div class="summary-split-value">{{ formatNumber(caloriesUnlocked) }}</div>
            <div class="summary-split-label">Unlocked</div>
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
  gap: clamp(8px, 4cqh, 32px);
  container-type: size;
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
  font-size: clamp(40px, 22cqh, 120px);
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

.summary-unlock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.summary-unlock--submitting {
  opacity: 0.45;
}

.summary-unlock-countdown {
  font-size: clamp(18px, 7cqh, 32px);
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: var(--summary-accent);
}

.summary-unlock-line {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-text-secondary);
}

.summary-unlock-line--warning {
  color: #fcd34d;
}

.summary-splits {
  display: flex;
  align-items: stretch;
  width: 100%;
  justify-content: center;
  gap: clamp(12px, 4vw, 32px);
  text-align: center;
}

.summary-split {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 4px;
}

.summary-split-value {
  font-size: clamp(18px, 7cqh, 32px);
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
