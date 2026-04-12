<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useProteinStore } from '@/stores/protein'

const calorieStore = useCalorieStore()
const proteinStore = useProteinStore()
const appStore = useAppStore()

const nowTick = ref(Date.now())
const boundaryRefreshTarget = ref<string | null>(null)
const refreshingBoundary = ref(false)
let intervalId: number | null = null

const isProteinMode = computed(() => appStore.trackMode === 'protein')

const isLoading = computed(() => {
  return isProteinMode.value ? proteinStore.loading : calorieStore.loading
})

const isSubmitting = computed(() => {
  return isProteinMode.value ? proteinStore.submittingEntry : calorieStore.submittingEntry
})

const accentColor = computed(() => {
  return isProteinMode.value ? 'var(--color-protein-primary)' : 'var(--color-calorie-primary)'
})

const loadingLabel = computed(() => {
  return isProteinMode.value ? 'Loading protein' : 'Loading calories'
})

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

const nextUnlockSummary = computed(() => {
  const status = unlockStatus.value

  if (!status) {
    return 'Loading unlock status'
  }

  if (status.allCaloriesUnlockedToday) {
    return 'All calories unlocked today'
  }

  if (!nextUnlockTimeLabel.value) {
    return 'Next unlock unavailable'
  }

  return `${nextUnlockTimeLabel.value} (+${formatNumber(status.nextEffectiveUnlockCalories)})`
})

const nextUnlockDetail = computed(() => {
  const status = unlockStatus.value

  if (!status || status.allCaloriesUnlockedToday) {
    return null
  }

  if (status.overdrawCalories > 0 && status.nextScheduledUnlockCalories !== status.nextEffectiveUnlockCalories) {
    return `Scheduled +${formatNumber(status.nextScheduledUnlockCalories)}, reduced by debt`
  }

  return `Scheduled +${formatNumber(status.nextScheduledUnlockCalories)}`
})

const overdrawMessage = computed(() => {
  const status = unlockStatus.value

  if (!status || status.overdrawCalories <= 0) {
    return null
  }

  if (status.allCaloriesUnlockedToday) {
    return `Overdrawn by ${formatNumber(status.overdrawCalories)}. There are no more unlocks today.`
  }

  return `Overdrawn by ${formatNumber(status.overdrawCalories)}. Next unlock reduced from ${formatNumber(
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
    isProteinMode.value ||
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

  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':')
}

function formatNumber(value: number) {
  return value.toLocaleString()
}
</script>

<template>
  <div class="calorie-display">
    <template v-if="isProteinMode">
      <div class="label">Protein Today</div>
      <div class="value-row">
        <div
          v-if="isLoading && !isSubmitting"
          class="loading-indicator"
          role="status"
          :aria-label="loadingLabel"
        >
          <span class="loading-spinner" :style="{ '--spinner-color': accentColor }"></span>
        </div>
        <div
          v-else
          class="value"
          :class="{ 'value-submitting': isSubmitting }"
          :style="{ color: accentColor }"
        >
          {{ proteinStore.totalProtein.toLocaleString() }}
        </div>
        <button class="history-button" :style="{ color: accentColor }" @click="appStore.openDrawer">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
    </template>

    <template v-else>
      <div class="label">Calories Available Now</div>
      <div class="value-row">
        <div
          v-if="isLoading && !isSubmitting && !unlockStatus"
          class="loading-indicator"
          role="status"
          :aria-label="loadingLabel"
        >
          <span class="loading-spinner" :style="{ '--spinner-color': accentColor }"></span>
        </div>
        <div
          v-else
          class="value"
          :class="{ 'value-submitting': isSubmitting }"
          :style="{ color: accentColor }"
        >
          {{ availableCalories.toLocaleString() }}
        </div>
        <button class="history-button" :style="{ color: accentColor }" @click="appStore.openDrawer">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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

      <div class="status-grid">
        <div class="status-card">
          <div class="status-label">Next Unlock</div>
          <div class="status-value">{{ nextUnlockSummary }}</div>
          <div v-if="nextUnlockDetail" class="status-detail">{{ nextUnlockDetail }}</div>
        </div>

        <div class="status-card">
          <div class="status-label">Countdown</div>
          <div class="status-value">
            {{ countdownLabel ?? (unlockStatus?.allCaloriesUnlockedToday ? 'Done for today' : '--:--:--') }}
          </div>
          <div class="status-detail">Server-paced unlock timer</div>
        </div>

        <div class="status-card status-card--wide">
          <div class="status-label">Consumed vs Target</div>
          <div class="status-value">{{ consumedVsTarget }}</div>
          <div class="status-detail">
            {{ formatNumber(unlockStatus?.unlockedCalories ?? 0) }} unlocked so far
          </div>
        </div>
      </div>

      <div v-if="overdrawMessage" class="warning-card">
        {{ overdrawMessage }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.calorie-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  min-height: 0;
}

@media (min-width: 429px) {
  .calorie-display {
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
  }
}

.label {
  font-size: 14px;
  color: var(--color-text-secondary);
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
  line-height: 1;
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
  border: 3px solid color-mix(in srgb, var(--spinner-color) 25%, transparent);
  border-top-color: var(--spinner-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.history-button {
  padding: 12px;
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

.status-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-sm);
}

.status-card {
  min-width: 0;
  padding: 12px;
  border-radius: var(--border-radius);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 94%, white 6%), var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-calorie-primary) 20%, transparent);
}

.status-card--wide {
  grid-column: 1 / -1;
}

.status-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 8px;
}

.status-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--color-text);
}

.status-detail {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.warning-card {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--border-radius);
  background: color-mix(in srgb, #f59e0b 18%, transparent);
  border: 1px solid color-mix(in srgb, #f59e0b 45%, transparent);
  color: #fcd34d;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

@media (max-width: 428px) {
  .value {
    font-size: 48px;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }

  .status-card--wide {
    grid-column: auto;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
