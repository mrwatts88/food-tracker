<script setup lang="ts">
import { useQuickAddStore } from '@/stores/quickadd'

const quickAddStore = useQuickAddStore()

function getTapCount(foodId: number): number {
  return quickAddStore.pendingTaps.get(foodId) || 0
}
</script>

<template>
  <div class="quick-add-list">
    <div v-if="quickAddStore.foods.length === 0" class="empty-state">
      No quick-add foods configured.
      <span class="desktop-hint">Add foods using the config panel.</span>
    </div>
    <div v-else class="food-grid">
      <button
        v-for="food in quickAddStore.foods"
        :key="food.id"
        class="food-item"
        :class="{ 'has-taps': getTapCount(food.id) > 0 }"
        @click="quickAddStore.incrementTap(food.id)"
        @contextmenu.prevent="quickAddStore.decrementTap(food.id)"
      >
        <div class="food-name">{{ food.name }}</div>
        <div class="food-info">{{ food.amount }} {{ food.unit }} - {{ food.calories }} cal</div>
        <div v-if="getTapCount(food.id) > 0" class="tap-badge">
          {{ getTapCount(food.id) }}
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.quick-add-list {
  overflow-y: auto;
  padding: var(--spacing-sm) var(--spacing-md);
  height: 500px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  text-align: center;
  padding: var(--spacing-lg);
}

.desktop-hint {
  display: none;
  margin-top: var(--spacing-sm);
  font-size: 14px;
}

@media (min-width: 900px) {
  .desktop-hint {
    display: block;
  }
}

.food-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.food-item {
  position: relative;
  padding: var(--spacing-md);
  background: var(--color-background);
  border: 2px solid transparent;
  border-radius: var(--border-radius);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
  color: var(--color-text);
}

.food-item:active {
  transform: scale(0.98);
}

.food-item.has-taps {
  border-color: var(--color-calorie-primary);
  background: rgba(16, 185, 129, 0.1);
}

.food-name {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.food-info {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.tap-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 28px;
  height: 28px;
  background: var(--color-calorie-primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
}
</style>
