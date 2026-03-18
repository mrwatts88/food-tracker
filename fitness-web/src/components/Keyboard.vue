<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { Mode } from '@/types'

interface Props {
  mode: Mode
  submitting?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  submitting: false
})
const emit = defineEmits<{
  submit: [value: number]
}>()

const currentInput = ref('')

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
  if (currentInput.value === "0") {
    currentInput.value = num.toString();
  } else if (currentInput.value.length < 4) {
    // Limit input length
    currentInput.value += num.toString()
  }
}

function handleBackspace() {
  const chars = currentInput.value.split("");
  chars.pop();
  currentInput.value = chars.join("");
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
  return props.mode === 'calorie' ? 'var(--color-calorie-primary)' : 'var(--color-weight-primary)'
})

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

function handleKeyDown(event: KeyboardEvent) {
  if (event.key in ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
    handleNumberClick(Number.parseInt(event.key));
  } else if (event.key === "Backspace") {
    handleBackspace();
  } else if (event.key == "Enter") {
    handleSubmit();
  }
}
</script>

<template>
  <div class="keyboard">
    <div class="input-display">{{ displayValue }}</div>
    <div class="keyboard-grid">
      <button v-for="num in [1, 2, 3, 4, 5, 6, 7, 8, 9]" :key="num" class="key-button" @click="handleNumberClick(num)">
        {{ num }}
      </button>
      <button class="key-button key-clear" @click="handleBackspace">←</button>
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
  font-size: 40px;
  font-weight: 700;
  text-align: right;
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: var(--color-background);
  border-radius: var(--border-radius);
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  color: var(--color-text);
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
