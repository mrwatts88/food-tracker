<script setup lang="ts">
import { computed } from 'vue'

import type { VoiceSessionState } from '@/types'

interface Props {
  state: VoiceSessionState
  disabled?: boolean
  supported?: boolean
  secondsRemaining?: number
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  supported: true,
  secondsRemaining: 20
})

const emit = defineEmits<{
  press: []
}>()

const buttonLabel = computed(() => {
  if (props.state === 'listening') {
    return `${props.secondsRemaining}s`
  }

  if (props.state === 'processing') {
    return '...'
  }

  return null
})
</script>

<template>
  <button
    class="voice-button"
    :class="[`is-${state}`]"
    :disabled="disabled || !supported || state === 'processing'"
    @click="emit('press')"
  >
    <span class="voice-indicator" aria-hidden="true"></span>
    <span v-if="buttonLabel" class="voice-label">{{ buttonLabel }}</span>
  </button>
</template>

<style scoped>
.voice-button {
  width: 100%;
  min-height: 42px;
  padding: 10px 6px;
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  background: rgba(255, 255, 255, 0.03);
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 0;
}

.voice-label {
  line-height: 1;
}

.voice-button:active {
  transform: scale(0.98);
}

.voice-button.is-idle {
  border-color: rgba(125, 211, 252, 0.28);
  background: color-mix(in srgb, #0ea5e9 12%, transparent);
}

.voice-button.is-listening {
  border-color: rgba(248, 113, 113, 0.55);
  background: color-mix(in srgb, #f87171 16%, transparent);
  color: #fca5a5;
}

.voice-button.is-processing {
  border-color: rgba(125, 211, 252, 0.45);
  background: color-mix(in srgb, #38bdf8 12%, transparent);
}

.voice-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.voice-indicator {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06);
}

.voice-button.is-listening .voice-indicator {
  background: #f87171;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }

  50% {
    transform: scale(1.2);
    opacity: 0.6;
  }
}
</style>
