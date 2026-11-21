<script setup lang="ts">
// On-screen number pad styled like the main Keyboard. Used inside modals so
// the phone's own keyboard never opens and covers the content.
export type NumberPadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back'

withDefaults(defineProps<{ allowDecimal?: boolean; compact?: boolean }>(), {
  allowDecimal: true,
  compact: false,
})

const emit = defineEmits<{
  press: [key: NumberPadKey]
}>()

const digitKeys: NumberPadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
</script>

<template>
  <div class="number-pad" :class="{ 'is-compact': compact }">
    <button
      v-for="key in digitKeys"
      :key="key"
      type="button"
      class="key-button"
      @click="emit('press', key)"
    >
      {{ key }}
    </button>
    <button
      type="button"
      class="key-button"
      :disabled="!allowDecimal"
      aria-label="Decimal point"
      @click="emit('press', '.')"
    >
      {{ allowDecimal ? '.' : '' }}
    </button>
    <button type="button" class="key-button" @click="emit('press', '0')">0</button>
    <button type="button" class="key-button key-back" aria-label="Backspace" @click="emit('press', 'back')">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M11 17L6 12l5-5M6 12h12" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.number-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
}

.key-button {
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 600;
  border: none;
  border-radius: var(--border-radius);
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.1s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.is-compact {
  gap: 6px;
}

.is-compact .key-button {
  min-height: 40px;
  font-size: 20px;
}

.key-button:active {
  transform: scale(0.95);
  background: rgba(255, 255, 255, 0.1);
}

.key-button:disabled {
  cursor: default;
}

.key-button:disabled:active {
  transform: none;
  background: var(--color-background);
}

.key-back {
  background: #ef4444;
  color: white;
}

.key-back:active {
  background: #dc2626;
}
</style>
