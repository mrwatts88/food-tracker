<script setup lang="ts">
import { computed } from 'vue'
import { useWeightStore } from '@/stores/weight'
import { useAppStore } from '@/stores/app'

const weightStore = useWeightStore()
const appStore = useAppStore()

const displayValue = computed(() => {
  if (weightStore.todayWeight) {
    return weightStore.todayWeight.amount.toFixed(1)
  }
  return '-'
})
</script>

<template>
  <div class="weight-display">
    <div class="display-content">
      <div class="label">Today's Weight</div>
    </div>
    <div class="value-row">
      <div
        v-if="weightStore.loading && !weightStore.submittingEntry"
        class="loading-indicator"
        role="status"
        aria-label="Loading weight"
      >
        <span class="loading-spinner"></span>
      </div>
      <div
        v-else
        class="value"
        :class="{ 'value-submitting': weightStore.submittingEntry }"
      >
        {{ displayValue }}
      </div>
      <button class="history-button" @click="appStore.openDrawer">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7.5v5l4 1M4.252 5v4H8M5.07 8a8 8 0 1 1-.818 6"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.weight-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md);
  min-height: 0;
}

@media (min-width: 429px) {
  .weight-display {
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
  }
}

.display-content {
  text-align: center;
  padding: var(--spacing-sm);
}

.label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-sm);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
}

.value-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.value {
  font-size: 56px;
  font-weight: 700;
  color: var(--color-weight-primary);
  line-height: 1;
  transition: opacity 0.2s ease;
}

.value-submitting {
  opacity: 0.45;
}

.loading-indicator {
  min-height: 56px;
  min-width: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner {
  width: 26px;
  height: 26px;
  border: 3px solid rgba(245, 158, 11, 0.25);
  border-top-color: var(--color-weight-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.unit {
  font-size: 24px;
  color: var(--color-text-secondary);
  margin-top: var(--spacing-sm);
  font-weight: 600;
}

.history-button {
  padding: 12px 12px;
  background: var(--color-surface);
  border: none;
  border-radius: var(--border-radius);
  color: var(--color-weight-primary);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: all 0.2s ease;
}

.history-button:active {
  transform: scale(0.98);
  background: rgba(245, 158, 11, 0.1);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
