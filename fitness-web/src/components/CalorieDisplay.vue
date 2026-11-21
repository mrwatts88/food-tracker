<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  homeMacroMetrics,
  homeMacroPages,
  nutritionMetricColorVars,
  nutritionMetricLabels,
  nutritionMetricUnits,
} from '@/lib/nutrition'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import type { EntryMetric, InsightStatus, NutritionMetric, TrackMetric } from '@/types'

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

// The calorie card is a vertical pager: page 0 is the insights grid, page 1 is
// the calorie summary (where it opens), and each page after that holds one
// group of macros from homeMacroPages. Native scroll-snap does the swiping; this
// component only tracks which page is showing and keeps the keypad's metric in
// step with it.
const PAGE_INSIGHTS = 0
const PAGE_CALORIES = 1
const FIRST_MACRO_PAGE = 2
const LAST_PAGE = FIRST_MACRO_PAGE + homeMacroPages.length - 1
const pagerElement = ref<HTMLElement | null>(null)
const currentPage = ref(PAGE_CALORIES)
// The macro each macro page last pointed the keypad at, so paging back to it
// picks up where it left off.
const lastMacroByPage = ref<NutritionMetric[]>(homeMacroPages.map((metrics) => metrics[0]!))
// Set while a programmatic scroll is in flight so intermediate scroll events do
// not read as the user paging. Cleared when it lands or when the user touches.
let pendingPage: number | null = null

// Metrics whose goal is a ceiling rather than a floor.
const limitMacros: ReadonlySet<NutritionMetric> = new Set(['sugar', 'carbs', 'sodium', 'caffeine'])

function isHomeMacro(metric: EntryMetric): metric is NutritionMetric {
  return homeMacroMetrics.includes(metric as NutritionMetric)
}

// Pager page for a home macro.
function pageOfMacro(metric: NutritionMetric) {
  return homeMacroPages.findIndex((metrics) => metrics.includes(metric)) + FIRST_MACRO_PAGE
}

function rememberMacro(metric: NutritionMetric) {
  lastMacroByPage.value[pageOfMacro(metric) - FIRST_MACRO_PAGE] = metric
}

const macroPages = computed(() =>
  homeMacroPages.map((metrics, index) => {
    const selected = metrics.includes(props.activeMetric as NutritionMetric)
      ? (props.activeMetric as NutritionMetric)
      : lastMacroByPage.value[index]!

    return {
      page: index + FIRST_MACRO_PAGE,
      label: metrics.map((metric) => nutritionMetricLabels[metric]).join(', '),
      accent: nutritionMetricColorVars[selected],
      rows: metrics.map(macroRow),
    }
  }),
)

function macroRow(metric: NutritionMetric) {
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
}

const insightStatusLabels: Record<InsightStatus, string> = {
  more: 'Eat more',
  less: 'Ease off',
  'on-track': 'On track',
  'no-goal': 'No goal',
  'no-data': 'No history',
}

// One tile per macro: today's target from the server (which only depends on
// past days) against today's live total, so tiles update as entries land.
const insightTiles = computed(() =>
  (nutritionStore.insights?.metrics ?? []).map((insight) => {
    const { metric, kind, goal, average, todayTarget } = insight
    const unit = nutritionMetricUnits[metric]
    const today = nutritionStore.totalsByMetric[metric]
    const left = todayTarget === null ? null : todayTarget - today
    const over = kind === 'ceiling' && left !== null && left < 0
    const done = kind === 'floor' && left !== null && left <= 0

    let heroValue = formatNumber(today)
    let heroCaption = `${unit} today`

    if (left !== null) {
      if (done) {
        heroValue = 'Done'
        heroCaption = "today's target hit"
      } else if (over) {
        heroValue = formatNumber(-left)
        heroCaption = `${unit} over`
      } else {
        heroValue = formatNumber(left)
        heroCaption = kind === 'floor' ? `${unit} to go` : `${unit} left`
      }
    }

    let progress = 0

    if (todayTarget !== null) {
      progress = todayTarget > 0 ? Math.min(1, today / todayTarget) : today > 0 ? 1 : 0
    }

    return {
      metric,
      label: nutritionMetricLabels[metric],
      accent: nutritionMetricColorVars[metric],
      status: insight.status,
      statusLabel: insightStatusLabels[insight.status],
      heroValue,
      heroCaption,
      over,
      done,
      progress,
      todayLine:
        todayTarget === null
          ? null
          : `${formatNumber(today)} / ${formatNumber(todayTarget)} ${unit}`,
      averageLine:
        average === null
          ? `No days logged yet`
          : `Avg ${formatNumber(average)}${goal === null ? '' : ` · goal ${formatNumber(goal)}`}`,
      active: props.activeMetric === metric,
    }
  }),
)
const insightsLoaded = computed(() => nutritionStore.insights !== null)
const insightsDays = computed(() => nutritionStore.insights?.daysLogged ?? 0)
const insightsWindow = computed(() => nutritionStore.insights?.windowDays ?? 7)

const pageForMetric = computed(() =>
  isHomeMacro(props.activeMetric) ? pageOfMacro(props.activeMetric) : PAGE_CALORIES,
)

const unlockStatus = computed(() => calorieStore.unlockStatus)

// Calorie summary. The hero number is what is available *right now*: calories
// unlocked so far today minus calories eaten. If unlock status is unavailable
// (the request failed) fall back to the plain full-day remaining amount.
const caloriesEaten = computed(() => calorieStore.totalCalories)
const caloriesAllowed = computed(() => calorieStore.effectiveDailyTarget)
const caloriesRemaining = computed(() => calorieStore.remainingCalories)
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
      rememberMacro(metric)
    }

    // Tapping an insight tile points the keypad at that macro without paging away.
    const staysOnInsights = currentPage.value === PAGE_INSIGHTS

    if (pageForMetric.value !== currentPage.value && !staysOnInsights) {
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
    if (Math.abs(element.scrollTop - pendingPage * stride) >= 1) {
      return
    }

    // Landed: fall through so a scroll started by the dots or arrow keys
    // updates the page and the keypad metric like a swipe does.
    pendingPage = null
  }

  const page = Math.min(LAST_PAGE, Math.max(PAGE_INSIGHTS, Math.round(element.scrollTop / stride)))

  if (page === currentPage.value) {
    return
  }

  currentPage.value = page
  emit(
    'select-metric',
    page < FIRST_MACRO_PAGE ? 'calorie' : lastMacroByPage.value[page - FIRST_MACRO_PAGE]!,
  )
}

function handlePagerUserInput() {
  pendingPage = null
}

function selectMacro(metric: NutritionMetric) {
  rememberMacro(metric)
  emit('select-metric', metric)
}

function handleKeyDown(event: KeyboardEvent) {
  if (isWeightMode.value || event.metaKey || event.ctrlKey || event.altKey) {
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    scrollToPage(Math.min(LAST_PAGE, currentPage.value + 1), 'smooth')
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    scrollToPage(Math.max(PAGE_INSIGHTS, currentPage.value - 1), 'smooth')
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

    <!-- Calorie mode: a vertical pager. Insights sit above the calorie card, macro pages below it. -->
    <template v-else>
      <div
        ref="pagerElement"
        class="summary-pager"
        @scroll.passive="handlePagerScroll"
        @touchstart.passive="handlePagerUserInput"
        @wheel.passive="handlePagerUserInput"
      >
        <!-- Insights: what each macro needs today, from the prior week's average against its goal -->
        <section
          class="summary-page"
          aria-label="Insights"
          :aria-hidden="currentPage !== PAGE_INSIGHTS"
        >
          <div
            class="summary-card insights-card"
            :style="{ '--summary-accent': 'var(--color-calorie-primary)' }"
          >
            <div class="insights-header">
              <span class="insights-title">Today's plan</span>
              <span class="insights-subtitle">
                vs. last {{ insightsWindow }} days
                <template v-if="insightsLoaded && insightsDays < insightsWindow">
                  ({{ insightsDays }} logged)
                </template>
              </span>
            </div>
            <div
              v-if="!insightsLoaded"
              class="loading-indicator loading-indicator--center"
              role="status"
              aria-label="Loading insights"
            >
              <span
                class="loading-spinner"
                :style="{ '--spinner-color': 'var(--color-calorie-primary)' }"
              ></span>
            </div>
            <div v-else class="insights-grid">
              <button
                v-for="tile in insightTiles"
                :key="tile.metric"
                class="insight-tile"
                :class="[`insight-tile--${tile.status}`, { 'insight-tile--active': tile.active }]"
                type="button"
                :aria-pressed="tile.active"
                :aria-label="`${tile.label}: ${tile.statusLabel}, ${tile.heroValue} ${tile.heroCaption}. Log ${tile.label}`"
                :style="{ '--insight-accent': tile.accent }"
                @click="selectMacro(tile.metric)"
              >
                <div class="insight-tile-body">
                  <div class="insight-tile-header">
                    <span class="insight-tile-label">{{ tile.label }}</span>
                    <span class="insight-chip">{{ tile.statusLabel }}</span>
                  </div>
                  <div class="insight-tile-hero">
                    <span
                      class="insight-tile-value"
                      :class="{
                        'insight-tile-value--over': tile.over,
                        'insight-tile-value--done': tile.done,
                      }"
                      >{{ tile.heroValue }}</span
                    >
                    <span class="insight-tile-caption">{{ tile.heroCaption }}</span>
                  </div>
                  <div class="insight-tile-bar">
                    <div
                      class="insight-tile-fill"
                      :class="{ 'insight-tile-fill--over': tile.over }"
                      :style="{ width: `${Math.round(tile.progress * 100)}%` }"
                    ></div>
                  </div>
                  <div class="insight-tile-lines">
                    <span v-if="tile.todayLine" class="insight-tile-today">
                      Today {{ tile.todayLine }}
                    </span>
                    <span>{{ tile.averageLine }}</span>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </section>

        <!-- Calories: available now (unlock-gated), next unlock countdown, and the day's totals -->
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
                  <div class="summary-split-value">{{ formatNumber(caloriesRemaining) }}</div>
                  <div class="summary-split-label">Remaining</div>
                </div>
                <div class="summary-split">
                  <div class="summary-split-value">{{ formatNumber(caloriesAllowed) }}</div>
                  <div class="summary-split-label">Allowed</div>
                </div>
              </div>
            </template>
          </div>
        </section>

        <!-- Macro pages: three macros each, in label order. Tapping a row points the keypad at it. -->
        <section
          v-for="macroPage in macroPages"
          :key="macroPage.page"
          class="summary-page"
          :aria-label="macroPage.label"
          :aria-hidden="currentPage !== macroPage.page"
        >
          <div class="summary-card macros-card" :style="{ '--summary-accent': macroPage.accent }">
            <div class="macro-list">
              <div
                v-for="row in macroPage.rows"
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
          :class="{ 'summary-dot--active': currentPage === PAGE_INSIGHTS }"
          type="button"
          role="tab"
          :aria-selected="currentPage === PAGE_INSIGHTS"
          aria-label="Insights"
          @click="scrollToPage(PAGE_INSIGHTS, 'smooth')"
        ></button>
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
          v-for="macroPage in macroPages"
          :key="macroPage.page"
          class="summary-dot"
          :class="{ 'summary-dot--active': currentPage === macroPage.page }"
          type="button"
          role="tab"
          :aria-selected="currentPage === macroPage.page"
          :aria-label="macroPage.label"
          @click="scrollToPage(macroPage.page, 'smooth')"
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

/* Pager: insights, then the calorie card, then the macro pages */
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
  /* Every page stops short of the page dots so their right edges line up. */
  padding-right: 22px;
  scroll-snap-align: start;
  scroll-snap-stop: always;
}

.summary-dots {
  position: absolute;
  top: 50%;
  right: 4px;
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

/* The insights and macro pages drop the card frame; their tiles are the boxes. */
.summary-card.insights-card,
.summary-card.macros-card {
  padding: 0;
  border: none;
  background: none;
}

/* Insights page */
.insights-card {
  justify-content: flex-start;
  gap: 6px;
}

.insights-header {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
}

.insights-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 700;
  color: var(--color-text);
}

.insights-subtitle {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-align: right;
}

.insights-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

/* Each tile is a size container so it can drop secondary lines on short screens. */
.insight-tile {
  container-type: size;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border-radius: var(--border-radius);
  border: 1px solid color-mix(in srgb, var(--insight-accent) 30%, transparent);
  background: var(--color-background);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}

.insight-tile--active {
  border-color: var(--insight-accent);
  background: color-mix(in srgb, var(--insight-accent) 18%, var(--color-background));
}

.insight-tile-body {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 7px 10px;
}

.insight-tile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.insight-tile-label {
  min-width: 0;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--insight-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.insight-chip {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  white-space: nowrap;
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-text-secondary) 16%, transparent);
}

.insight-tile--on-track .insight-chip {
  color: #6ee7b7;
  background: color-mix(in srgb, #10b981 22%, transparent);
}

.insight-tile--more .insight-chip,
.insight-tile--less .insight-chip {
  color: #fcd34d;
  background: color-mix(in srgb, #f59e0b 20%, transparent);
}

.insight-tile-hero {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
  overflow: hidden;
}

.insight-tile-value {
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.insight-tile-value--over {
  color: #fcd34d;
}

.insight-tile-value--done {
  color: var(--insight-accent);
}

.insight-tile-caption {
  min-width: 0;
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.insight-tile-bar {
  flex-shrink: 0;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-text-secondary) 20%, transparent);
  overflow: hidden;
}

.insight-tile-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--insight-accent);
  transition: width 0.3s ease;
}

.insight-tile-fill--over {
  background: #fcd34d;
}

.insight-tile-lines {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-size: 0.7rem;
  line-height: 1.25;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.insight-tile-lines span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* On shorter tiles the progress bar goes first, then the text lines. */
@container (max-height: 104px) {
  .insight-tile-bar {
    display: none;
  }
}

@container (max-height: 86px) {
  .insight-tile-today {
    display: none;
  }
}

@container (max-height: 70px) {
  .insight-tile-lines {
    display: none;
  }
}

@container (max-height: 70px) {
  .insight-tile-body {
    gap: 4px;
    padding: 6px 8px;
  }

  .insight-tile-value {
    font-size: 1.25rem;
  }

  .insight-chip {
    padding: 1px 5px;
    font-size: 0.6rem;
  }
}

@container (max-height: 60px) {
  .insight-tile-body {
    gap: 2px;
    padding: 4px 8px;
  }

  .insight-tile-label {
    font-size: 0.65rem;
  }

  .insight-tile-value {
    font-size: 1.05rem;
  }

  .insight-tile-caption {
    font-size: 0.65rem;
  }
}

/* Short cards (small phones): the grid needs every pixel. */
@container (max-height: 300px) {
  .insights-card {
    gap: 6px;
  }

  .insights-title,
  .insights-subtitle {
    font-size: 0.7rem;
  }
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
