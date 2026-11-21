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
  { metric: 'sodium', label: 'Sodium', unit: 'mg', color: 'var(--color-sodium-primary)' },
  { metric: 'carbs', label: 'Carbs', unit: 'g', color: 'var(--color-carbs-primary)' },
  { metric: 'fiber', label: 'Fiber', unit: 'g', color: 'var(--color-fiber-primary)' },
  { metric: 'sugar', label: 'Sugar', unit: 'g', color: 'var(--color-sugar-primary)' },
  { metric: 'protein', label: 'Protein', unit: 'g', color: 'var(--color-protein-primary)' },
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

  activeField.value = null
  step.value = 'amount'
}

function goBack() {
  step.value = 'confirm'
}

const MAX_ENTRY_LENGTH = 6

type ConfirmField = LabelMetric | 'servingGrams'

// The confirm-screen field the pad is editing. Tapping a field selects its
// whole value: the next key replaces it rather than appending.
const activeField = ref<ConfirmField | null>(null)
const replaceOnType = ref(false)

function selectField(field: ConfirmField) {
  if (field !== 'servingGrams' && props.lockedMetrics.includes(field)) {
    return
  }

  activeField.value = field
  replaceOnType.value = true
}

function getFieldText(field: ConfirmField) {
  return field === 'servingGrams' ? servingGramsText.value : perServingText[field]
}

function setFieldText(field: ConfirmField, text: string) {
  if (field === 'servingGrams') {
    servingGramsText.value = text
  } else {
    perServingText[field] = text
  }
}

function applyKey(current: string, key: NumberPadKey, replace: boolean) {
  const base = replace ? '' : current

  if (key === 'back') {
    return base.slice(0, -1)
  }

  if (key === '.') {
    if (base.includes('.')) {
      return base
    }

    return base === '' ? '0.' : `${base}.`
  }

  if (base.length >= MAX_ENTRY_LENGTH) {
    return base
  }

  return base === '0' ? key : base + key
}

function handlePadPress(key: NumberPadKey) {
  if (step.value === 'amount') {
    amountText.value = applyKey(amountText.value, key, false)
    return
  }

  const field = activeField.value

  if (field === null) {
    return
  }

  setFieldText(field, applyKey(getFieldText(field), key, replaceOnType.value))
  replaceOnType.value = false
}

function submit() {
  if (!canSubmit.value) {
    return
  }

  emit('submit', totals.value)
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

        <div class="fields-grid">
          <button
            v-if="logsByGrams"
            type="button"
            class="field-cell field-cell--wide"
            :class="{ 'is-active': activeField === 'servingGrams' }"
            @click="selectField('servingGrams')"
          >
            <span class="field-name">Serving size</span>
            <span class="field-input">
              <span
                class="field-value"
                :class="{ 'is-selected': activeField === 'servingGrams' && replaceOnType }"
                >{{ servingGramsText || '—' }}</span
              >
              <span class="field-unit">g</span>
            </span>
          </button>

          <button
            v-for="row in metricRows"
            :key="row.metric"
            type="button"
            class="field-cell"
            :class="{
              'is-locked': lockedMetrics.includes(row.metric),
              'is-active': activeField === row.metric,
            }"
            :disabled="lockedMetrics.includes(row.metric)"
            @click="selectField(row.metric)"
          >
            <span class="field-name">
              <span class="field-dot" :style="{ background: row.color }"></span>
              {{ row.label }}
              <span v-if="lockedMetrics.includes(row.metric)" class="locked-note">locked</span>
            </span>
            <span class="field-input">
              <span
                class="field-value"
                :class="{ 'is-selected': activeField === row.metric && replaceOnType }"
                >{{ perServingText[row.metric] || '—' }}</span
              >
              <span class="field-unit">{{ row.unit }}</span>
            </span>
          </button>
        </div>
      </div>

      <div v-if="step === 'confirm'" class="pad-wrap">
        <NumberPad @press="handlePadPress" />
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
  max-height: calc(100dvh - 32px);
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
  padding: 10px 12px 28px;
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

.fields-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.field-cell {
  min-width: 0;
  display: grid;
  gap: 4px;
  padding: 6px 8px 8px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.field-cell--wide {
  grid-column: 1 / -1;
}

.field-cell.is-locked {
  opacity: 0.5;
  cursor: default;
}

.field-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.field-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.locked-note {
  margin-left: auto;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.field-input {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
}

.field-value {
  font-size: 18px;
  font-weight: 700;
}

.field-cell.is-active .field-input {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
}

/* Mimics selected text: the next key replaces the whole value. */
.field-value.is-selected {
  border-radius: 3px;
  background: rgba(14, 165, 233, 0.45);
}

.pad-wrap {
  padding: 4px 12px 16px;
}

.field-unit {
  min-width: 28px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.amount-step {
  padding: 10px 12px 16px;
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
  border: 1px solid #38bdf8;
  border-radius: var(--border-radius);
  background: var(--color-background);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
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
    /* Edge-to-edge sheet: side and bottom borders would run into the phone's rounded
       screen corners and get clipped, so only the top edge is outlined. */
    border-width: 1px 0 0;
  }
}
</style>
