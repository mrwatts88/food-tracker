<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useProteinStore } from '@/stores/protein'
import { useWeightStore } from '@/stores/weight'
import type { TrackMode } from '@/types'

const props = defineProps<{
  trackMode: TrackMode
}>()

const calorieStore = useCalorieStore()
const proteinStore = useProteinStore()
const weightStore = useWeightStore()
const appStore = useAppStore()

const nowTick = ref(Date.now())
const boundaryRefreshTarget = ref<string | null>(null)
const refreshingBoundary = ref(false)
let intervalId: number | null = null

const isProteinMode = computed(() => props.trackMode === 'protein')
const isWeightMode = computed(() => props.trackMode === 'weight')

const primaryLoading = computed(() => {
  if (isWeightMode.value) {
    return weightStore.loading
  }

  return isProteinMode.value ? proteinStore.loading : calorieStore.loading
})

const primarySubmitting = computed(() => {
  if (isWeightMode.value) {
    return weightStore.submittingEntry
  }

  return isProteinMode.value ? proteinStore.submittingEntry : calorieStore.submittingEntry
})

const accentColor = computed(() => {
  if (isWeightMode.value) {
    return 'var(--color-weight-primary)'
  }

  return isProteinMode.value ? 'var(--color-protein-primary)' : 'var(--color-calorie-primary)'
})

const loadingLabel = computed(() => {
  if (isWeightMode.value) {
    return 'Loading weight'
  }

  return isProteinMode.value ? 'Loading protein' : 'Loading calories'
})

const unlockStatus = computed(() => calorieStore.unlockStatus)

const availableCalories = computed(() => {
  return unlockStatus.value?.availableCalories ?? Math.max(0, calorieStore.remainingCalories)
})

const mainCardLabel = computed(() => {
  if (isWeightMode.value) {
    return "Today's Weight"
  }

  return isProteinMode.value ? 'Protein Today' : 'Calories Available'
})

const mainCardValue = computed(() => {
  if (isWeightMode.value) {
    return weightStore.todayWeight?.amount.toFixed(1) ?? '-'
  }

  return isProteinMode.value ? formatNumber(proteinStore.totalProtein) : formatNumber(availableCalories.value)
})

const mainCardDetail = computed(() => {
  if (isWeightMode.value) {
    return weightStore.todayWeight ? 'Latest entry for today' : 'No weight logged today'
  }

  return isProteinMode.value ? 'Running total for today' : 'Available right now'
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
  return `${formatNumber(streak)} clean ${noun}`
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
    <div class="track-grid">
      <div class="track-card track-card--primary" :style="{ '--card-accent': accentColor }">
        <div class="track-card-header">
          <div class="track-card-label">{{ mainCardLabel }}</div>
          <button class="history-button" :style="{ color: accentColor }" @click="appStore.openDrawer">
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
            v-if="primaryLoading && !primarySubmitting && (isWeightMode || isProteinMode || !unlockStatus)"
            class="loading-indicator"
            role="status"
            :aria-label="loadingLabel"
          >
            <span class="loading-spinner" :style="{ '--spinner-color': accentColor }"></span>
          </div>
          <div
            v-else
            class="track-card-value track-card-value--hero"
            :class="{ 'track-card-value--submitting': primarySubmitting }"
            :style="{ color: accentColor }"
          >
            {{ mainCardValue }}
          </div>
        </div>
        <div class="track-card-detail">{{ mainCardDetail }}</div>
      </div>

      <div class="track-card">
        <div class="track-card-label">Next Unlock</div>
        <div class="track-card-body">
          <div class="track-card-value">{{ nextUnlockPrimary }}</div>
          <div class="track-card-detail">{{ nextUnlockSummary }}</div>
          <div v-if="overdrawMessage" class="track-card-detail track-card-detail--warning">
            {{ overdrawMessage }}
          </div>
        </div>
      </div>

      <div class="track-card">
        <div class="track-card-label">No-Borrow Streak</div>
        <div class="track-card-body">
          <div class="track-card-value">{{ streakSummary }}</div>
          <div class="track-card-detail">Completed unlock slots</div>
        </div>
      </div>

      <div class="track-card">
        <div class="track-card-label">Consumed vs Target</div>
        <div class="track-card-body">
          <div class="track-card-value">{{ consumedVsTarget }}</div>
          <div class="track-card-detail">{{ formatNumber(unlockStatus?.unlockedCalories ?? 0) }} unlocked so far</div>
        </div>
      </div>
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

.track-card--primary {
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

.loading-spinner {
  width: 26px;
  height: 26px;
  border: 3px solid color-mix(in srgb, var(--spinner-color) 25%, transparent);
  border-top-color: var(--spinner-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.history-button {
  flex-shrink: 0;
  padding: 8px;
  background: var(--color-surface);
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.2s ease;
}

.history-button:active {
  transform: scale(0.98);
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
