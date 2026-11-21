<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import type { Mode } from '@/types'

const appStore = useAppStore()

function handleModeChange(mode: Mode) {
  if (mode === 'calorie') {
    appStore.setMode('calorie')
    appStore.activateTrackMetric()
    appStore.closeDrawer()
    return
  }

  if (mode === 'weight') {
    appStore.setMode('weight')
    appStore.setActiveMetric('weight')
    appStore.closeDrawer()
    return
  }

  appStore.setMode(mode)
  appStore.closeDrawer()
}
</script>

<template>
  <div class="mode-toggle">
    <button
      :class="['toggle-button', { active: appStore.mode === 'calorie' }]"
      :style="{ '--active-color': 'var(--color-calorie-primary)' }"
      @click="handleModeChange('calorie')"
    >
      Track
    </button>
    <button
      :class="['toggle-button', { active: appStore.mode === 'weight' }]"
      :style="{ '--active-color': 'var(--color-weight-primary)' }"
      @click="handleModeChange('weight')"
    >
      Weight
    </button>
    <button
      :class="['toggle-button', { active: appStore.mode === 'stats' }]"
      :style="{ '--active-color': 'var(--color-calorie-primary)' }"
      @click="handleModeChange('stats')"
    >
      Stats
    </button>
    <button
      :class="['toggle-button', { active: appStore.mode === 'lifts' }]"
      :style="{ '--active-color': 'var(--color-lifts-primary)' }"
      @click="handleModeChange('lifts')"
    >
      Lifts
    </button>
  </div>
</template>

<style scoped>
.mode-toggle {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  /* The #top-edge bar in index.html supplies the space above the buttons. */
  padding-top: 0;
  background: var(--color-surface);
}

/* No #top-edge bar on wide screens (see index.html), so the tabs need their own top space. */
@media (min-width: 431px) {
  .mode-toggle {
    padding-top: var(--spacing-sm);
  }
}

.toggle-button {
  flex: 1;
  padding: 12px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: var(--border-radius);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-button.active {
  background: var(--active-color);
  color: white;
}

.toggle-button:active {
  transform: scale(0.98);
}
</style>
