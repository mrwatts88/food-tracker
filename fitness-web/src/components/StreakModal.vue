<script setup lang="ts">
import { computed } from 'vue'

import type {
  DailyGoalStreakStatus,
  RetiredStreakGoalMetric,
  StreakDaySummary,
  StreakGoalMetric,
  StreakMetricStatus,
} from '@/types'

type AnyStreakMetric = StreakGoalMetric | RetiredStreakGoalMetric

interface Props {
  status: DailyGoalStreakStatus | null
  loading?: boolean
  error?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: null,
})

const emit = defineEmits<{
  close: []
}>()

const metricLabels: Record<AnyStreakMetric, string> = {
  calorie: 'Calories',
  protein: 'Protein',
  sugar: 'Sugar',
  carbs: 'Carbs',
  caffeine: 'Caffeine',
  steps: 'Steps',
}

const metricUnits: Record<AnyStreakMetric, string> = {
  calorie: 'cal',
  protein: 'g',
  sugar: 'g',
  carbs: 'g',
  caffeine: 'mg',
  steps: 'steps',
}

const metricColors: Record<AnyStreakMetric, string> = {
  calorie: 'var(--color-calorie-primary)',
  protein: 'var(--color-protein-primary)',
  sugar: 'var(--color-sugar-primary)',
  carbs: 'var(--color-carbs-primary)',
  caffeine: 'var(--color-caffeine-primary)',
  steps: 'var(--color-steps-primary)',
}

const todayMisses = computed(
  () => props.status?.today.metrics.filter((metric) => !metric.met) ?? [],
)

const todaySummary = computed(() => {
  if (!props.status) {
    return ''
  }

  if (todayMisses.value.length === 0) {
    return 'On track. Today counts once it ends.'
  }

  return `Off track: ${todayMisses.value.map((metric) => describeMiss(metric)).join(', ')}.`
})

const lastBreakLabel = computed(() => {
  const lastBreakDate = props.status?.lastBreakDate

  return lastBreakDate
    ? formatDate(lastBreakDate, { weekday: 'short', month: 'short', day: 'numeric' })
    : null
})

function describeMiss(metric: StreakMetricStatus) {
  const unit = metricUnits[metric.metric]
  const label = metricLabels[metric.metric].toLowerCase()

  const suffix = metric.counted ? '' : ' (old rule)'

  if (metric.kind === 'min') {
    return `${label} ${formatNumber(metric.goal - metric.total)} ${unit} short${suffix}`
  }

  return `${label} ${formatNumber(metric.total - metric.goal)} ${unit} over${suffix}`
}

function describeGoal(metric: StreakMetricStatus) {
  const target = `${formatNumber(metric.goal)} ${metricUnits[metric.metric]}`

  return metric.kind === 'min' ? `at least ${target}` : `under ${target}`
}

function describeDay(day: StreakDaySummary) {
  if (day.missing) {
    return 'Nothing logged'
  }

  const misses = day.metrics.filter((metric) => !metric.met)

  if (misses.length === 0) {
    return 'All goals met'
  }

  return misses.map((metric) => describeMiss(metric)).join(', ')
}

function formatDate(localDate: string, options: Intl.DateTimeFormatOptions) {
  const [year, month, day] = localDate.split('-').map(Number)

  if (!year || !month || !day) {
    return localDate
  }

  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day))
}

function formatNumber(value: number) {
  return value.toLocaleString()
}
</script>

<template>
  <div class="modal-overlay" @click="emit('close')">
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-label="Daily goal streak"
      @click.stop
    >
      <div class="modal-header">
        <div>
          <p class="eyebrow">Daily goal streak</p>
          <h2 class="title">
            <template v-if="status">
              {{ formatNumber(status.currentStreak) }}
              {{ status.currentStreak === 1 ? 'day' : 'days' }}
            </template>
            <template v-else>Streak</template>
          </h2>
        </div>
        <button class="close-button" type="button" aria-label="Close" @click="emit('close')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <p v-if="loading && !status" class="empty-state">Loading streak...</p>
        <p v-else-if="error" class="empty-state empty-state--error">{{ error }}</p>

        <template v-else-if="status">
          <section class="section">
            <div class="section-heading">
              <p class="section-label">Today</p>
              <span class="pill" :class="todayMisses.length === 0 ? 'pill--good' : 'pill--bad'">
                {{ todayMisses.length === 0 ? 'On track' : 'Off track' }}
              </span>
            </div>
            <div class="metric-list">
              <div
                v-for="metric in status.today.metrics"
                :key="metric.metric"
                class="metric-row"
                :style="{ '--metric-accent': metricColors[metric.metric] }"
              >
                <span
                  class="metric-mark"
                  :class="metric.met ? 'metric-mark--met' : 'metric-mark--missed'"
                >
                  {{ metric.met ? '✓' : '✗' }}
                </span>
                <div class="metric-text">
                  <span class="metric-label">{{ metricLabels[metric.metric] }}</span>
                  <span class="metric-goal">{{ describeGoal(metric) }}</span>
                </div>
                <span class="metric-total" :class="{ 'metric-total--missed': !metric.met }">
                  {{ formatNumber(metric.total) }}
                  <span class="metric-unit">{{ metricUnits[metric.metric] }}</span>
                </span>
              </div>
            </div>
            <p class="note">{{ todaySummary }}</p>
          </section>

          <section class="section">
            <p class="section-label">Last 7 days</p>
            <div class="day-list">
              <div
                v-for="day in status.recentDays"
                :key="day.localDate"
                class="day-row"
                :class="day.successful ? 'day-row--good' : 'day-row--bad'"
              >
                <span class="day-mark">{{ day.successful ? '✓' : '✗' }}</span>
                <div class="day-text">
                  <span class="day-date">
                    {{
                      formatDate(day.localDate, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })
                    }}
                  </span>
                  <span class="day-detail">{{ describeDay(day) }}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="section">
            <p class="section-label">How it works</p>
            <p class="note">
              A day counts when calories, sugar, and carbs stay under their limits and protein
              reaches its goal. Days are judged after they end, and a day with nothing logged breaks
              the streak. Caffeine and steps are tracked but do not affect it.
            </p>
            <p v-if="lastBreakLabel" class="note">Last break: {{ lastBreakLabel }}.</p>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(2, 6, 23, 0.72);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
}

.modal-content {
  width: 100%;
  max-width: 428px;
  max-height: 88vh;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  background:
    radial-gradient(circle at top, rgba(245, 158, 11, 0.16), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02)), #111827;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #fbbf24;
  margin-bottom: 4px;
}

.title {
  font-size: 28px;
  line-height: 1.1;
}

.close-button {
  border: none;
  border-radius: 12px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text);
  cursor: pointer;
  display: flex;
}

.modal-body {
  overflow-y: auto;
  padding: 16px;
  display: grid;
  gap: 18px;
}

.section {
  display: grid;
  gap: 10px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.pill {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 5px 9px;
  border-radius: 999px;
}

.pill--good {
  color: #86efac;
  background: rgba(34, 197, 94, 0.16);
}

.pill--bad {
  color: #fcd34d;
  background: rgba(245, 158, 11, 0.16);
}

.metric-list,
.day-list {
  display: grid;
  gap: 8px;
}

.metric-row,
.day-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
}

.day-row {
  grid-template-columns: auto minmax(0, 1fr);
}

.metric-mark,
.day-mark {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
}

.metric-mark--met,
.day-row--good .day-mark {
  color: #86efac;
  background: rgba(34, 197, 94, 0.16);
}

.metric-mark--missed,
.day-row--bad .day-mark {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.16);
}

.metric-text,
.day-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.metric-label,
.day-date {
  font-weight: 700;
}

.metric-label {
  color: var(--metric-accent);
}

.metric-goal,
.day-detail {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.3;
}

.metric-total {
  font-size: 18px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.metric-total--missed {
  color: #fcd34d;
}

.metric-unit {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.note {
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-text-secondary);
}

.empty-state {
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  line-height: 1.45;
}

.empty-state--error {
  color: #fecaca;
  background: rgba(248, 113, 113, 0.14);
}

@media (max-width: 428px) {
  .modal-overlay {
    padding: 0;
  }

  .modal-content {
    max-height: 92vh;
    border-radius: 20px 20px 0 0;
  }
}
</style>
