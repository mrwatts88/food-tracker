<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  homeMacroMetrics,
  nutritionMetricColorVars,
  nutritionMetricLabels,
  nutritionMetricUnits,
} from '@/lib/nutrition'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import type { EntryMetric, NutritionMetric, TrackMetric } from '@/types'

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

// The calorie card is a two-page vertical pager: page 0 is the calorie summary,
// page 1 is the macros. Native scroll-snap does the swiping; this component only
// tracks which page is showing and keeps the keypad's metric in step with it.
const PAGE_CALORIES = 0
const PAGE_MACROS = 1
const pagerElement = ref<HTMLElement | null>(null)
const currentPage = ref(PAGE_CALORIES)
const lastMacro = ref<NutritionMetric>('protein')
// Set while a programmatic scroll is in flight so intermediate scroll events do
// not read as the user paging. Cleared when it lands or when the user touches.
let pendingPage: number | null = null

// Metrics whose goal is a ceiling rather than a floor.
const limitMacros: ReadonlySet<NutritionMetric> = new Set(['sugar', 'carbs'])

function isHomeMacro(metric: EntryMetric): metric is NutritionMetric {
  return homeMacroMetrics.includes(metric as NutritionMetric)
}

const selectedMacro = computed<NutritionMetric>(() =>
  isHomeMacro(props.activeMetric) ? props.activeMetric : lastMacro.value,
)
const macrosAccent = computed(() => nutritionMetricColorVars[selectedMacro.value])

const macroRows = computed(() =>
  homeMacroMetrics.map((metric) => {
    const total = nutritionStore.totalsByMetric[metric]
    const configuredGoal = nutritionStore.goalsByMetric[metric]
    // A goal of 0 in settings means "no goal", not "met at zero".
    const goal = configuredGoal > 0 ? configuredGoal : null
    const isLimit = limitMacros.has(metric)
    const ratio = goal === null ? 0 : total / goal

    return {
      metric,
      label: nutritionMetricLabels[metric],
      unit: nutritionMetricUnits[metric],
      total,
      goal,
      progress: Math.min(1, ratio),
      // Over a ceiling is a warning; reaching a floor is a win.
      over: isLimit && goal !== null && total > goal,
      met: !isLimit && goal !== null && total >= goal,
      accent: nutritionMetricColorVars[metric],
      active: props.activeMetric === metric,
      loading: nutritionStore.loadingByMetric[metric] && !nutritionStore.submittingByMetric[metric],
      submitting: nutritionStore.submittingByMetric[metric],
    }
  }),
)

const pageForMetric = computed(() =>
  isHomeMacro(props.activeMetric) ? PAGE_MACROS : PAGE_CALORIES,
)

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

// Metric changed from outside the pager (mode toggle, keypad shortcuts): bring
// the matching page into view. Changes the pager itself caused are already in
// step and skip this.
watch(
  () => props.activeMetric,
  (metric) => {
    if (isHomeMacro(metric)) {
      lastMacro.value = metric
    }

    if (pageForMetric.value !== currentPage.value) {
      currentPage.value = pageForMetric.value
      scrollToPage(currentPage.value, 'smooth')
    }
  },
)

// The pager is torn down in weight mode and rebuilt on the way back, so re-sync
// whenever the element (re)appears.
watch(pagerElement, (element) => {
  if (element) {
    currentPage.value = pageForMetric.value
    void nextTick(() => scrollToPage(currentPage.value, 'instant'))
  }
})

onMounted(() => {
  intervalId = window.setInterval(() => {
    nowTick.value = Date.now()
    maybeRefreshUnlockStatus()
  }, 1000)

  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  if (intervalId !== null) {
    window.clearInterval(intervalId)
  }

  window.removeEventListener('keydown', handleKeyDown)
})

function pageStride(element: HTMLElement) {
  // Pages are 100% tall with a gap between them, so the stride is the distance
  // from one page's top to the next.
  const gap = Number.parseFloat(getComputedStyle(element).rowGap) || 0
  return element.clientHeight + gap
}

function scrollToPage(page: number, behavior: ScrollBehavior) {
  const element = pagerElement.value

  if (!element) {
    return
  }

  const top = page * pageStride(element)

  if (Math.abs(element.scrollTop - top) < 1) {
    pendingPage = null
    return
  }

  pendingPage = page
  element.scrollTo({ top, behavior })
}

function handlePagerScroll() {
  const element = pagerElement.value

  if (!element) {
    return
  }

  const stride = pageStride(element)

  if (pendingPage !== null) {
    if (Math.abs(element.scrollTop - pendingPage * stride) < 1) {
      pendingPage = null
    }

    return
  }

  const page = Math.round(element.scrollTop / stride)

  if (page === currentPage.value) {
    return
  }

  currentPage.value = page
  emit('select-metric', page === PAGE_MACROS ? lastMacro.value : 'calorie')
}

function handlePagerUserInput() {
  pendingPage = null
}

function selectMacro(metric: NutritionMetric) {
  lastMacro.value = metric
  emit('select-metric', metric)
}

function handleKeyDown(event: KeyboardEvent) {
  if (isWeightMode.value || event.metaKey || event.ctrlKey || event.altKey) {
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    scrollToPage(PAGE_MACROS, 'smooth')
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    scrollToPage(PAGE_CALORIES, 'smooth')
  }
}

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

    <!-- Calorie mode: a two-page pager. Swipe up for macros, down to come back. -->
    <template v-else>
      <div
        ref="pagerElement"
        class="summary-pager"
        @scroll.passive="handlePagerScroll"
        @touchstart.passive="handlePagerUserInput"
        @wheel.passive="handlePagerUserInput"
      >
        <!-- Page 1: available now (unlock-gated), next unlock countdown, and the day's totals -->
        <section
          class="summary-page"
          aria-label="Calories"
          :aria-hidden="currentPage !== PAGE_CALORIES"
        >
          <div class="summary-card" :style="{ '--summary-accent': 'var(--color-calorie-primary)' }">
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
                <div
                  class="summary-hero-value"
                  :class="{ 'summary-hero-value--over': isOverdrawn }"
                >
                  {{ formatNumber(heroValue) }}
                </div>
                <div class="summary-hero-label">{{ heroLabel }}</div>
              </div>
              <div
                class="summary-unlock"
                :class="{ 'summary-unlock--submitting': calorieStore.submittingEntry }"
              >
                <div v-if="countdownLabel" class="summary-unlock-countdown">
                  {{ countdownLabel }}
                </div>
                <div class="summary-unlock-line">{{ nextUnlockSummary }}</div>
                <div
                  v-if="overdrawMessage"
                  class="summary-unlock-line summary-unlock-line--warning"
                >
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
        </section>

        <!-- Page 2: protein, sugar, carbs. Tapping a row points the keypad at it. -->
        <section
          class="summary-page"
          aria-label="Macros"
          :aria-hidden="currentPage !== PAGE_MACROS"
        >
          <div class="summary-card macros-card" :style="{ '--summary-accent': macrosAccent }">
            <div class="macro-list">
              <div
                v-for="row in macroRows"
                :key="row.metric"
                class="macro-row"
                :class="{
                  'macro-row--active': row.active,
                  'macro-row--submitting': row.submitting,
                }"
                :style="{ '--macro-accent': row.accent }"
              >
                <button
                  class="macro-row-main"
                  type="button"
                  :aria-pressed="row.active"
                  :aria-label="`Log ${row.label}`"
                  @click="selectMacro(row.metric)"
                >
                  <div class="macro-row-header">
                    <span class="macro-row-label">{{ row.label }}</span>
                    <span
                      v-if="row.loading"
                      class="loading-spinner loading-spinner--small"
                      :style="{ '--spinner-color': row.accent }"
                      role="status"
                      :aria-label="`Loading ${row.label}`"
                    ></span>
                    <span
                      v-else
                      class="macro-row-value"
                      :class="{
                        'macro-row-value--over': row.over,
                        'macro-row-value--met': row.met,
                      }"
                    >
                      <strong>{{ formatNumber(row.total) }}</strong>
                      <span class="macro-row-goal">
                        / {{ row.goal === null ? '--' : formatNumber(row.goal) }} {{ row.unit }}
                      </span>
                    </span>
                  </div>
                  <div class="macro-row-bar">
                    <div
                      class="macro-row-fill"
                      :class="{ 'macro-row-fill--over': row.over }"
                      :style="{ width: `${Math.round(row.progress * 100)}%` }"
                    ></div>
                  </div>
                </button>
                <button
                  class="icon-button macro-row-history"
                  type="button"
                  :aria-label="`Open ${row.label.toLowerCase()} history`"
                  :title="`Open ${row.label.toLowerCase()} history`"
                  @click="openHistory(row.metric)"
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
          </div>
        </section>
      </div>

      <div class="summary-dots" role="tablist" aria-label="Summary pages">
        <button
          class="summary-dot"
          :class="{ 'summary-dot--active': currentPage === PAGE_CALORIES }"
          type="button"
          role="tab"
          :aria-selected="currentPage === PAGE_CALORIES"
          aria-label="Calories"
          @click="scrollToPage(PAGE_CALORIES, 'smooth')"
        ></button>
        <button
          class="summary-dot"
          :class="{ 'summary-dot--active': currentPage === PAGE_MACROS }"
          type="button"
          role="tab"
          :aria-selected="currentPage === PAGE_MACROS"
          aria-label="Macros"
          @click="scrollToPage(PAGE_MACROS, 'smooth')"
        ></button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.calorie-display {
  position: relative; /* anchors the page dots */
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

/* Pager: page 1 is the calorie card, page 2 is the macros */
.summary-pager {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-auto-rows: 100%;
  row-gap: var(--spacing-sm);
  overflow-y: auto;
  overflow-x: hidden;
  scroll-snap-type: y mandatory;
  overscroll-behavior-y: contain;
  scrollbar-width: none;
}

.summary-pager::-webkit-scrollbar {
  display: none;
}

.summary-page {
  min-height: 0;
  display: flex;
  flex-direction: column;
  scroll-snap-align: start;
  scroll-snap-stop: always;
}

.summary-dots {
  position: absolute;
  top: 50%;
  right: calc(var(--spacing-md) + 6px);
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 6;
}

.summary-dot {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.summary-dot::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  transition:
    background 0.2s ease,
    transform 0.2s ease;
}

.summary-dot--active::before {
  background: var(--color-text);
  transform: scale(1.25);
}

/* Macros page */
.macros-card {
  justify-content: stretch;
  gap: 0;
}

.macro-list {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: clamp(6px, 3cqh, 16px);
  padding-right: 22px; /* keep clear of the page dots */
}

.macro-row {
  flex: 1;
  min-height: 0;
  max-height: 120px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 0 8px 0 12px;
  border-radius: var(--border-radius);
  border: 1px solid color-mix(in srgb, var(--macro-accent) 30%, transparent);
  /* Opaque so the card gradient does not show through the rows. */
  background: var(--color-background);
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}

.macro-row--active {
  border-color: var(--macro-accent);
  background: color-mix(in srgb, var(--macro-accent) 18%, var(--color-background));
}

.macro-row--submitting {
  opacity: 0.55;
}

.macro-row-main {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: clamp(6px, 2.5cqh, 12px);
  padding: 8px 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.macro-row-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.macro-row-label {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 700;
  color: var(--macro-accent);
}

.macro-row-value {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
}

.macro-row-value strong {
  font-size: clamp(22px, 8cqh, 34px);
  font-weight: 800;
  line-height: 1;
}

.macro-row-goal {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.macro-row-value--over strong {
  color: #fcd34d;
}

.macro-row-value--met strong {
  color: var(--macro-accent);
}

.macro-row-bar {
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}

.macro-row-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--macro-accent);
  transition: width 0.3s ease;
}

.macro-row-fill--over {
  background: #fcd34d;
}

.macro-row-history {
  color: var(--macro-accent);
  background: transparent;
  padding: 8px;
}

.loading-spinner--small {
  width: 16px;
  height: 16px;
  border-width: 2px;
  align-self: center;
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
