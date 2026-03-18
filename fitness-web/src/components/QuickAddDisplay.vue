<script setup lang="ts">
import { useQuickAddStore } from '@/stores/quickadd'

const quickAddStore = useQuickAddStore()

async function handleSubmit() {
  await quickAddStore.submitTaps()
}
</script>

<template>
  <div class="quick-add-display">
    <div class="pending-info">
      <div class="pending-label">Pending Calories</div>
      <div class="pending-value">{{ quickAddStore.pendingCalories.toLocaleString() }}</div>
    </div>
    <div class="action-buttons">
      <button
        class="clear-button"
        :disabled="!quickAddStore.hasPendingTaps"
        @click="quickAddStore.clearTaps"
      >
        Clear
      </button>
      <button
        class="submit-button"
        :disabled="!quickAddStore.hasPendingTaps || quickAddStore.submitting"
        @click="handleSubmit"
      >
        <span v-if="quickAddStore.submitting" class="loading-spinner"></span>
        <span v-else>Submit</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.quick-add-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
}

.pending-info {
  display: flex;
  flex-direction: column;
}

.pending-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.pending-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-calorie-primary);
}

.action-buttons {
  display: flex;
  gap: var(--spacing-sm);
}

.clear-button,
.submit-button {
  padding: 12px 20px;
  border: none;
  border-radius: var(--border-radius);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-button {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-text-secondary);
}

.clear-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-button {
  background: var(--color-calorie-primary);
  color: white;
}

.submit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-button:not(:disabled):active,
.clear-button:not(:disabled):active {
  transform: scale(0.98);
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
