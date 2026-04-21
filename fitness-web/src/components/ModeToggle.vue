<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import type { Mode } from '@/types'

const appStore = useAppStore()

function handleModeChange(mode: Mode) {
  if (mode === 'calorie' && appStore.mode === 'calorie') {
    appStore.toggleTrackDashboardMode()
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
      :class="['toggle-button', { active: appStore.mode === 'stats' }]"
      :style="{ '--active-color': 'var(--color-calorie-primary)' }"
      @click="handleModeChange('stats')"
    >
      Stats
    </button>
  </div>
</template>

<style scoped>
.mode-toggle {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-surface);
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
