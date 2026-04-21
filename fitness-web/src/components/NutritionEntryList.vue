<script setup lang="ts">
import { computed, ref } from 'vue'

import { buildHistoryListItems, formatHistoryTime } from '@/lib/history'
import {
  isNutritionMetric,
  nutritionMetricColorVars,
  nutritionMetricLabels,
  nutritionMetricUnits
} from '@/lib/nutrition'
import { useAppStore } from '@/stores/app'
import { useEntryDividerStore } from '@/stores/entryDivider'
import { useNutritionStore } from '@/stores/nutrition'
import type { EntryMetric, NutritionMetric } from '@/types'

const appStore = useAppStore()
const entryDividerStore = useEntryDividerStore()
const nutritionStore = useNutritionStore()
const deletingId = ref<number | null>(null)

const drawerTargetMetric = computed<EntryMetric>(() => appStore.drawerMetric ?? appStore.activeMetric)
const currentMetric = computed<NutritionMetric>(() => {
  const metric = drawerTargetMetric.value
  return isNutritionMetric(metric) ? metric : 'protein'
})
const currentLabel = computed(() => nutritionMetricLabels[currentMetric.value])
const currentUnit = computed(() => nutritionMetricUnits[currentMetric.value])
const currentColor = computed(() => nutritionMetricColorVars[currentMetric.value])
const currentEntries = computed(() => nutritionStore.entriesByMetric[currentMetric.value])

const historyItems = computed(() =>
  buildHistoryListItems(currentEntries.value, entryDividerStore.entries)
)

async function handleDelete(id: number) {
  deletingId.value = id
  await nutritionStore.deleteEntry(id, currentMetric.value)
  deletingId.value = null
}
</script>

<template>
  <div class="entry-list">
    <div v-if="historyItems.length === 0" class="empty-state">
      No {{ currentLabel.toLowerCase() }} entries today
    </div>
    <div v-else class="entries">
      <template v-for="item in historyItems" :key="item.id">
        <div v-if="item.type === 'divider'" class="divider-item">
          <span class="divider-line"></span>
          <span class="divider-label">{{ formatHistoryTime(item.createdAt) }}</span>
          <span class="divider-line"></span>
        </div>
        <div v-else class="entry-item">
          <div class="entry-info">
            <div class="entry-time">{{ formatHistoryTime(item.entry.createdAt) }}</div>
            <div class="entry-amount" :style="{ color: currentColor }">
              {{ item.entry.amount }} {{ currentUnit }}
            </div>
          </div>
          <button
            class="delete-button"
            :disabled="deletingId !== null"
            @click="handleDelete(item.entry.id)"
          >
            <span v-if="deletingId === item.entry.id" class="loading-spinner"></span>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.entry-list {
  max-height: 400px;
  overflow-y: auto;
}

.empty-state {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--color-text-secondary);
}

.entries {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding-right: 8px;
}

.entry-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  background: var(--color-background);
  border-radius: var(--border-radius);
}

.divider-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px 0;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: rgba(156, 163, 175, 0.3);
}

.divider-label {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.entry-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex: 1;
}

.entry-time {
  color: var(--color-text-secondary);
  font-size: 14px;
  min-width: 80px;
}

.entry-amount {
  font-size: 18px;
  font-weight: 600;
}

.delete-button {
  padding: 8px;
  background: transparent;
  border: none;
  color: #ef4444;
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.delete-button:active {
  background: rgba(239, 68, 68, 0.1);
}

.delete-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(239, 68, 68, 0.3);
  border-top-color: #ef4444;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
