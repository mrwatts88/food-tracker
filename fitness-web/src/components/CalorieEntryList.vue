<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCalorieStore } from '@/stores/calorie'

const calorieStore = useCalorieStore()
const deletingId = ref<number | null>(null)

const sortedEntries = computed(() => {
  return [...calorieStore.entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
})

function formatTime(datetime: string) {
  // Format: YYYY-MM-DD HH:MM:SS → HH:MM AM/PM
  const date = new Date(datetime.replace(' ', 'T'))
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

async function handleDelete(id: number) {
  deletingId.value = id
  await calorieStore.deleteEntry(id)
  deletingId.value = null
}
</script>

<template>
  <div class="entry-list">
    <div v-if="sortedEntries.length === 0" class="empty-state">No entries today</div>
    <div v-else class="entries">
      <div v-for="entry in sortedEntries" :key="entry.id" class="entry-item">
        <div class="entry-info">
          <div class="entry-time">{{ formatTime(entry.createdAt) }}</div>
          <div class="entry-amount">{{ entry.amount }} cal</div>
        </div>
        <button
          class="delete-button"
          :disabled="deletingId !== null"
          @click="handleDelete(entry.id)"
        >
          <span v-if="deletingId === entry.id" class="loading-spinner"></span>
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
  color: var(--color-calorie-primary);
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
