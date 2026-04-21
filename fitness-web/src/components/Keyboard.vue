<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { EntryMetric } from '@/types'

interface Props {
  mode: EntryMetric
  accentColor?: string | null
  submitting?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  accentColor: null,
  submitting: false
})
const emit = defineEmits<{
  'insert-divider': []
  submit: [value: number]
}>()

const currentInput = ref('')
const hasInput = computed(() => currentInput.value.length > 0)
const showsDividerAction = computed(() => props.mode !== 'weight' && !hasInput.value)

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
  if (currentInput.value.length < 4) {
    currentInput.value += num.toString()
  }
}

function handleBackspace() {
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

function handleInsertDivider() {
  if (props.submitting || !showsDividerAction.value) {
    return
  }

  emit('insert-divider')
}

function handleSubmit() {
  if (currentInput.value.length === 0 || props.submitting) return

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
  }
}
</script>

<template>
  <div class="keyboard">
    <div class="input-display" :class="{ 'has-clear-button': hasInput }">
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
      <button
        v-if="showsDividerAction"
        class="key-button key-divider"
        :style="{ background: primaryColor }"
        :disabled="submitting"
        @click="handleInsertDivider"
      >
        <span v-if="submitting" class="loading-spinner divider-spinner"></span>
        <span v-else>BINK</span>
      </button>
      <button v-else class="key-button key-clear" @click="handleBackspace">←</button>
      <button class="key-button" @click="handleNumberClick(0)">0</button>
      <button
        class="key-button key-submit"
        :style="{ background: primaryColor }"
        :disabled="submitting"
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

.key-divider {
  color: white;
}

.key-divider:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.key-divider:active {
  opacity: 0.8;
}

.key-divider:disabled:active {
  transform: none;
  opacity: 0.5;
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

.divider-spinner {
  border-color: rgba(249, 250, 251, 0.25);
  border-top-color: currentColor;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
