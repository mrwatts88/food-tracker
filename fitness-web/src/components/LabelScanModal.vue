<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import type { LabelMetric, LabelParseResult, VoiceMetric } from '@/types'

import NumberPad, { type NumberPadKey } from './NumberPad.vue'

interface Props {
  result: LabelParseResult
  lockedMetrics: VoiceMetric[]
  submitting?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  submitting: false,
})

const emit = defineEmits<{
  cancel: []
  submit: [totals: Record<LabelMetric, number>]
}>()

const metricRows: Array<{ metric: LabelMetric; label: string; unit: string; color: string }> = [
  { metric: 'calorie', label: 'Calories', unit: 'kcal', color: 'var(--color-calorie-primary)' },
  { metric: 'carbs', label: 'Carbs', unit: 'g', color: 'var(--color-carbs-primary)' },
  { metric: 'sodium', label: 'Sodium', unit: 'mg', color: 'var(--color-sodium-primary)' },
  { metric: 'protein', label: 'Protein', unit: 'g', color: 'var(--color-protein-primary)' },
  { metric: 'sugar', label: 'Sugar', unit: 'g', color: 'var(--color-sugar-primary)' },
]

const step = ref<'confirm' | 'amount'>('confirm')
const amountText = ref('')

// Editable copies of the parsed values, as strings so an empty field means
// "not on the label / don't log".
const perServingText = reactive<Record<LabelMetric, string>>(
  Object.fromEntries(
    metricRows.map(({ metric }) => [metric, formatEditable(props.result.perServing[metric])]),
  ) as Record<LabelMetric, string>,
)
const servingGramsText = ref(formatEditable(props.result.servingGrams))

const logsByGrams = computed(() => props.result.servingGrams !== null)
const servingGrams = computed(() => parsePositive(servingGramsText.value))

const perServing = computed(() =>
  Object.fromEntries(
    metricRows.map(({ metric }) => [metric, parseNonNegative(perServingText[metric])]),
  ) as Record<LabelMetric, number | null>,
)

const loggableRows = computed(() =>
  metricRows.filter(
    ({ metric }) => !props.lockedMetrics.includes(metric) && (perServing.value[metric] ?? 0) > 0,
  ),
)

const canConfirm = computed(
  () => loggableRows.value.length > 0 && (!logsByGrams.value || servingGrams.value !== null),
)

const amount = computed(() => parsePositive(amountText.value))

const servingsEaten = computed(() => {
  if (amount.value === null) {
    return null
  }

  if (logsByGrams.value) {
    return servingGrams.value === null ? null : amount.value / servingGrams.value
  }

  return amount.value
})

const totals = computed(() => {
  const factor = servingsEaten.value ?? 0

  return Object.fromEntries(
    metricRows.map(({ metric }) => {
      const value = perServing.value[metric]
      const loggable = !props.lockedMetrics.includes(metric) && value !== null
      return [metric, loggable ? Math.round(value * factor) : 0]
    }),
  ) as Record<LabelMetric, number>
})

const canSubmit = computed(
  () =>
    !props.submitting &&
    servingsEaten.value !== null &&
    Object.values(totals.value).some(total => total > 0),
)

function goToAmount() {
  if (!canConfirm.value) {
    return
  }

  step.value = 'amount'
}

function goBack() {
  step.value = 'confirm'
}

const MAX_AMOUNT_LENGTH = 6

function handlePadPress(key: NumberPadKey) {
  const current = amountText.value

  if (key === 'back') {
    amountText.value = current.slice(0, -1)
    return
  }

  if (key === '.') {
    if (!current.includes('.')) {
      amountText.value = current === '' ? '0.' : `${current}.`
    }
    return
  }

  if (current.length >= MAX_AMOUNT_LENGTH) {
    return
  }

  amountText.value = current === '0' ? key : current + key
}

function submit() {
  if (!canSubmit.value) {
    return
  }

  emit('submit', totals.value)
}

// Every tap on a confirm-screen field selects its whole value, so typing
// replaces it instead of editing around wherever the cursor landed. Deferred
// a tick because iOS places the caret after focus/click handlers run.
function selectAll(event: Event) {
  const input = event.target as HTMLInputElement
  window.setTimeout(() => input.setSelectionRange(0, input.value.length))
}

function formatEditable(value: number | null) {
  return value === null ? '' : String(value)
}

function parseNonNegative(text: string) {
  const trimmed = text.trim()

  if (trimmed === '') {
    return null
  }

  const value = Number(trimmed)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function parsePositive(text: string) {
  const value = parseNonNegative(text)
  return value !== null && value > 0 ? value : null
}

function formatTotal(metric: LabelMetric, value: number) {
  const row = metricRows.find(candidate => candidate.metric === metric)
  return `${value.toLocaleString()} ${row?.unit ?? ''}`
}
</script>

<template>
  <div class="modal-overlay">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <p class="eyebrow">Nutrition Label</p>
        <h2 class="title">
          {{ step === 'confirm' ? (result.productName ?? 'Check the numbers') : logsByGrams ? 'How many grams?' : 'How many servings?' }}
        </h2>
        <p v-if="result.servingSizeText" class="serving-text">Serving: {{ result.servingSizeText }}</p>
      </div>

      <div v-if="step === 'confirm'" class="modal-body">
        <section v-if="result.warnings.length > 0" class="warning-panel">
          <ul class="warning-list">
            <li v-for="warning in result.warnings" :key="warning">{{ warning }}</li>
          </ul>
        </section>

        <label v-if="logsByGrams" class="field-row">
          <span class="field-name">Serving size</span>
          <span class="field-input-wrap">
            <input
              v-model="servingGramsText"
              class="field-input"
              type="text"
              inputmode="decimal"
              placeholder="—"
              @focus="selectAll"
              @click="selectAll"
            />
            <span class="field-unit">g</span>
          </span>
        </label>

        <p class="section-label">Per serving</p>
        <label
          v-for="row in metricRows"
          :key="row.metric"
          class="field-row"
          :class="{ 'is-locked': lockedMetrics.includes(row.metric) }"
        >
          <span class="field-name">
            <span class="field-dot" :style="{ background: row.color }"></span>
            {{ row.label }}
            <span v-if="lockedMetrics.includes(row.metric)" class="locked-note">locked</span>
          </span>
          <span class="field-input-wrap">
            <input
              v-model="perServingText[row.metric]"
              class="field-input"
              type="text"
              inputmode="decimal"
              placeholder="—"
              :disabled="lockedMetrics.includes(row.metric)"
              @focus="selectAll"
              @click="selectAll"
            />
            <span class="field-unit">{{ row.unit }}</span>
          </span>
        </label>
      </div>

      <div v-if="step === 'amount'" class="amount-step">
        <div class="amount-display" :aria-label="logsByGrams ? 'Grams eaten' : 'Servings eaten'">
          <span class="amount-value" :class="{ 'is-empty': amountText === '' }">{{ amountText || '0' }}</span>
          <span class="amount-unit">{{ logsByGrams ? 'g' : 'servings' }}</span>
        </div>

        <div class="totals-grid">
          <div v-for="row in loggableRows" :key="row.metric" class="total-card">
            <span class="total-name">{{ row.label }}</span>
            <strong class="total-value">{{ formatTotal(row.metric, totals[row.metric]) }}</strong>
          </div>
        </div>

        <NumberPad @press="handlePadPress" />
      </div>

      <div class="modal-actions">
        <template v-if="step === 'confirm'">
          <button class="secondary-button" type="button" @click="emit('cancel')">Cancel</button>
          <button class="primary-button" type="button" :disabled="!canConfirm" @click="goToAmount">
            Looks right
          </button>
        </template>
        <template v-else>
          <button class="secondary-button" type="button" :disabled="submitting" @click="goBack">
            Back
          </button>
          <button class="primary-button" type="button" :disabled="!canSubmit" @click="submit">
            {{ submitting ? 'Saving...' : 'Log it' }}
          </button>
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
  position: relative;
  width: 100%;
  max-width: 428px;
  max-height: 88vh;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  background:
    radial-gradient(circle at top, rgba(14, 165, 233, 0.14), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02)),
    #111827;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 12px 16px 10px;
}

.modal-actions {
  padding: 10px 12px max(10px, env(safe-area-inset-bottom));
}

.modal-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #7dd3fc;
  margin-bottom: 2px;
}

.title {
  font-size: 20px;
  line-height: 1.1;
}

.serving-text {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.modal-body {
  overflow-y: auto;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
}

.section-label {
  margin-top: 6px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.warning-panel {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(251, 191, 36, 0.22);
}

.warning-list {
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: #fde68a;
  font-size: 14px;
}

.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 6px 5px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.field-row.is-locked {
  opacity: 0.5;
}

.field-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}

.field-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.locked-note {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-secondary);
}

.field-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.field-input {
  width: 84px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.25);
  color: var(--color-text);
  font-size: 16px;
  font-weight: 700;
  text-align: right;
}

.field-unit {
  width: 32px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.amount-step {
  padding: 10px 12px;
  display: grid;
  gap: 8px;
}

.amount-display {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  min-height: 56px;
  padding: 6px 12px;
  border-radius: var(--border-radius);
  background: var(--color-background);
}

.amount-value {
  font-size: 40px;
  font-weight: 800;
  line-height: 1.1;
}

.amount-value.is-empty {
  color: var(--color-text-muted);
}

.amount-unit {
  font-size: 16px;
  color: var(--color-text-secondary);
}

.totals-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.total-card {
  padding: 6px 10px;
  display: grid;
  gap: 2px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.total-name {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.total-value {
  font-size: 15px;
  white-space: nowrap;
}

.modal-actions {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.secondary-button,
.primary-button {
  min-height: 44px;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.secondary-button {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text);
}

.primary-button {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  color: white;
}

.secondary-button:disabled,
.primary-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 428px) {
  .modal-overlay {
    padding: 0;
  }

  .modal-content {
    max-height: calc(100dvh - 8px);
    border-radius: 16px 16px 0 0;
  }
}
</style>
