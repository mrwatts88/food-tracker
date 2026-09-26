<!-- eslint-disable vue/multi-word-component-names -->
<script lang="ts">
import { ref } from 'vue'

type ScaleField = 'servingGrams' | 'servingAmount' | 'eatenGrams'

const SCALE_FIELDS: ScaleField[] = ['servingGrams', 'servingAmount', 'eatenGrams']

// Module-level so the last label survives switching metrics, for a second helping later.
const scaleValues = ref<Record<ScaleField, string>>({ servingGrams: '', servingAmount: '', eatenGrams: '' })
</script>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import type { EntryMetric } from '@/types'

interface Props {
  mode: EntryMetric
  accentColor?: string | null
  submitting?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  accentColor: null,
  submitting: false,
  disabled: false
})
const emit = defineEmits<{
  'insert-divider': []
  submit: [value: number]
}>()

const currentInput = ref('')
const hasInput = computed(() => currentInput.value.length > 0)
const maxInputLength = computed(() => (props.mode === 'steps' ? 5 : 4))

// Serving scaler: "label says 84 g is 150 cal, I weighed 96 g" → 171.
const scaleOpen = ref(false)
const scaleField = ref<ScaleField>('servingGrams')
// The first digit typed into a prefilled field replaces it, like a selected input.
const scaleReplaceOnType = ref(false)
const canScale = computed(() => props.mode !== 'weight' && props.mode !== 'steps')

const scaleUnit = computed(() => {
  if (props.mode === 'calorie') return 'cal'
  if (props.mode === 'caffeine') return 'mg'
  return 'g'
})

const scaleResult = computed(() => {
  const servingGrams = Number(scaleValues.value.servingGrams)
  const servingAmount = Number(scaleValues.value.servingAmount)
  const eatenGrams = Number(scaleValues.value.eatenGrams)

  if (!(servingGrams > 0) || !(servingAmount > 0) || !(eatenGrams > 0)) {
    return null
  }

  return Math.round((servingAmount * eatenGrams) / servingGrams)
})

function openScale() {
  scaleOpen.value = true
  currentInput.value = ''
  selectScaleField(scaleValues.value.servingGrams ? 'servingGrams' : firstEmptyScaleField())
}

function closeScale() {
  scaleOpen.value = false
}

function firstEmptyScaleField() {
  return SCALE_FIELDS.find((field) => !scaleValues.value[field]) ?? 'servingGrams'
}

function selectScaleField(field: ScaleField) {
  scaleField.value = field
  scaleReplaceOnType.value = scaleValues.value[field].length > 0
}

function typeIntoScale(num: number) {
  const field = scaleField.value
  const current = scaleReplaceOnType.value ? '' : scaleValues.value[field]
  scaleReplaceOnType.value = false

  if (current.length < 4) {
    scaleValues.value[field] = current + num.toString()
  }
}

function backspaceScale() {
  const field = scaleField.value
  scaleReplaceOnType.value = false

  if (scaleValues.value[field]) {
    scaleValues.value[field] = scaleValues.value[field].slice(0, -1)
    return
  }

  const index = SCALE_FIELDS.indexOf(field)
  if (index > 0) {
    scaleField.value = SCALE_FIELDS[index - 1] ?? 'servingGrams'
  }
}

// ✓ walks through the fields, then logs the scaled amount once all three are in.
function submitScale() {
  const nextField = SCALE_FIELDS[SCALE_FIELDS.indexOf(scaleField.value) + 1]

  if (nextField) {
    selectScaleField(nextField)
    return
  }

  if (scaleResult.value === null) {
    selectScaleField(firstEmptyScaleField())
    return
  }

  if (scaleResult.value <= 0 || props.submitting || props.disabled) return

  emit('submit', scaleResult.value)
  // Keep the label for next time; the weighed amount is specific to this helping.
  scaleValues.value.eatenGrams = ''
  scaleOpen.value = false
}

const displayValue = computed(() => {
  if (props.mode === 'weight' && currentInput.value.length > 0) {
    // For weight, auto-insert decimal before last digit
    // e.g., "1450" displays as "145.0"
    const digits = currentInput.value
    if (digits.length === 1) {
      return `0.${digits}`
    }
    return `${digits.slice(0, -1)}.${digits.slice(-1)}`
  }
  return currentInput.value || '0'
})

function handleNumberClick(num: number) {
  if (scaleOpen.value) {
    typeIntoScale(num)
    return
  }

  if (currentInput.value.length < maxInputLength.value) {
    currentInput.value += num.toString()
  }
}

function handleBackspace() {
  if (scaleOpen.value) {
    backspaceScale()
    return
  }

  if (!hasInput.value) {
    return
  }

  const chars = currentInput.value.split('')
  chars.pop()
  currentInput.value = chars.join('')
}

function handleClearInput() {
  if (!hasInput.value) {
    return
  }

  currentInput.value = ''
}

function handleSubmit() {
  if (scaleOpen.value) {
    submitScale()
    return
  }

  if (currentInput.value.length === 0 || props.submitting || props.disabled) return

  let value: number
  if (props.mode === 'weight') {
    // Convert display value to actual float
    // "145.0" → 145.0
    value = parseFloat(displayValue.value)
  } else {
    value = parseInt(currentInput.value, 10)
  }

  emit('submit', value)
  currentInput.value = ''
}

const primaryColor = computed(() => {
  if (props.accentColor) {
    return props.accentColor
  }

  if (props.mode === 'weight') {
    return 'var(--color-weight-primary)'
  }

  return 'var(--color-calorie-primary)'
})

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

function handleKeyDown(event: KeyboardEvent) {
  if (['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(event.key)) {
    handleNumberClick(Number.parseInt(event.key, 10))
  } else if (event.key === 'Backspace') {
    handleBackspace()
  } else if (event.key === 'Enter') {
    handleSubmit()
  } else if (event.key === 'Escape' && scaleOpen.value) {
    closeScale()
  }
}
</script>

<template>
  <div class="keyboard">
    <div v-if="scaleOpen" class="input-display scale-display">
      <div class="scale-fields">
        <button
          type="button"
          class="scale-field"
          :class="{ 'scale-field--active': scaleField === 'servingGrams' }"
          @click="selectScaleField('servingGrams')"
        >
          <span class="scale-field-value">{{ scaleValues.servingGrams || '–' }}</span>
          <span class="scale-field-label">label g</span>
        </button>
        <span class="scale-joiner">=</span>
        <button
          type="button"
          class="scale-field"
          :class="{ 'scale-field--active': scaleField === 'servingAmount' }"
          @click="selectScaleField('servingAmount')"
        >
          <span class="scale-field-value">{{ scaleValues.servingAmount || '–' }}</span>
          <span class="scale-field-label">label {{ scaleUnit }}</span>
        </button>
        <span class="scale-joiner">·</span>
        <button
          type="button"
          class="scale-field"
          :class="{ 'scale-field--active': scaleField === 'eatenGrams' }"
          @click="selectScaleField('eatenGrams')"
        >
          <span class="scale-field-value">{{ scaleValues.eatenGrams || '–' }}</span>
          <span class="scale-field-label">ate g</span>
        </button>
      </div>
      <div class="scale-result" :style="{ color: scaleResult !== null ? primaryColor : undefined }">
        {{ scaleResult ?? '–' }}<small>{{ scaleUnit }}</small>
      </div>
      <button type="button" class="scale-close" aria-label="Close serving scaler" @click="closeScale">×</button>
    </div>
    <div v-else class="input-display" :class="{ 'has-clear-button': hasInput, 'has-scale-button': canScale }">
      <button
        v-if="canScale"
        type="button"
        class="input-scale-button"
        aria-label="Scale a serving by weight"
        title="Scale a serving by weight"
        @click="openScale"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16M5 20h14M6 8h12M6 8l-3 6a3 3 0 0 0 6 0L6 8Zm12 0-3 6a3 3 0 0 0 6 0l-3-6Z"
          />
        </svg>
      </button>
      <span class="input-display-value">{{ displayValue }}</span>
      <button
        v-if="hasInput"
        type="button"
        class="input-clear-button"
        aria-label="Clear input"
        @click="handleClearInput"
      >
        ×
      </button>
    </div>
    <div class="keyboard-grid">
      <button
        v-for="num in [1, 2, 3, 4, 5, 6, 7, 8, 9]"
        :key="num"
        class="key-button"
        @click="handleNumberClick(num)"
      >
        {{ num }}
      </button>
      <button class="key-button key-clear" aria-label="Backspace" @click="handleBackspace">
        <svg class="key-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.2"
            d="M11 17L6 12l5-5M6 12h12"
          />
        </svg>
      </button>
      <button class="key-button" @click="handleNumberClick(0)">0</button>
      <button
        class="key-button key-submit"
        :style="{ background: primaryColor }"
        :disabled="submitting || disabled"
        @click="handleSubmit"
      >
        <span v-if="submitting" class="loading-spinner"></span>
        <span v-else>✓</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.keyboard {
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
  background: var(--color-surface);
}

.input-display {
  position: relative;
  font-size: 40px;
  font-weight: 700;
  text-align: center;
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: var(--color-background);
  border-radius: var(--border-radius);
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text);
}

.input-display.has-clear-button {
  padding-left: calc(var(--spacing-md) + 44px);
  padding-right: calc(var(--spacing-md) + 44px);
}

.input-display.has-scale-button {
  padding-left: calc(var(--spacing-md) + 44px);
  padding-right: calc(var(--spacing-md) + 44px);
}

.input-scale-button {
  position: absolute;
  top: 50%;
  left: var(--spacing-sm);
  width: 36px;
  height: 36px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.input-scale-button:active {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-50%) scale(0.95);
}

.scale-display {
  justify-content: flex-start;
  gap: var(--spacing-sm);
  padding: 6px 48px 6px 6px;
  font-size: inherit;
}

.scale-fields {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.scale-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 46px;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.scale-field--active {
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.06);
}

.scale-field-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.1;
}

.scale-field-label {
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.scale-joiner {
  color: var(--color-text-muted);
  font-size: 16px;
}

.scale-result {
  margin-left: auto;
  font-size: 30px;
  font-weight: 800;
  line-height: 1;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.scale-result small {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.scale-close {
  position: absolute;
  top: 50%;
  right: var(--spacing-sm);
  width: 32px;
  height: 32px;
  transform: translateY(-50%);
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.input-display-value {
  line-height: 1;
}

.input-clear-button {
  position: absolute;
  top: 50%;
  right: var(--spacing-sm);
  width: 36px;
  height: 36px;
  transform: translateY(-50%);
  border: none;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.14);
  color: #ef4444;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.input-clear-button:active {
  background: rgba(239, 68, 68, 0.22);
  transform: translateY(-50%) scale(0.95);
}

.keyboard-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
}

.key-button {
  min-height: 50px;
  font-size: 22px;
  font-weight: 600;
  border: none;
  border-radius: var(--border-radius);
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.1s ease;
  user-select: none;
}

.key-icon {
  display: block;
  margin: 0 auto;
}

.key-button:active {
  transform: scale(0.95);
  background: rgba(255, 255, 255, 0.1);
}

.key-clear {
  background: #ef4444;
  color: white;
}

.key-clear:active {
  background: #dc2626;
}

.key-submit {
  color: white;
}

.key-submit:active {
  opacity: 0.8;
}

.key-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.key-submit:disabled:active {
  transform: none;
}

.loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
